import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  AttachmentKind,
  ReportStatus,
  UserRole,
  Prisma,
  FormType,
  $Enums,
} from '@prisma/client';

import { ReportsGateway } from './reports.gateway';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from '../auth/esign.service';
import { getRequestContext } from '../common/request-context';
import { randomUUID } from 'node:crypto';
import * as crypto from 'crypto';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { AttachmentsService } from 'src/attachments/attachments.service';
import { ReportNotificationsService } from 'src/notifications/report-notifications.service';

// ----------------------------
// Which roles may edit which fields (unchanged)
// ----------------------------
const EDIT_MAP: Record<UserRole, string[]> = {
  SYSTEMADMIN: ['*'],
  ADMIN: ['*'],
  FRONTDESK: [
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'idNo',
    'description',
    'lotNo',
    'manufactureDate',
    'samplingDate',
  ],
  MICRO: [
    'testSopNo',
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'dateCompleted',
    'comments',

    'ftm_turbidity',
    'ftm_observation',
    'ftm_result',
    'scdb_turbidity',
    'scdb_observation',
    'scdb_result',
  ],
  CHEMISTRY: [
    'testSopNo',
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'comments',
  ],
  MC: [
    'testSopNo',
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'dateCompleted',
    'comments',

    'ftm_turbidity',
    'ftm_observation',
    'ftm_result',
    'scdb_turbidity',
    'scdb_observation',
    'scdb_result',
  ],
  QA: [
    'testSopNo',
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'comments',
  ],
  CLIENT: [
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'idNo',
    'description',
    'lotNo',
    'manufactureDate',
    'samplingDate',
    'tbc_spec',
    'tmy_spec',
    'pathogens',
  ],
};

type Transition = {
  next: ReportStatus[];
  canSet: UserRole[];
  nextEditableBy: UserRole[];
  canEdit: UserRole[];
};

const STATUS_TRANSITIONS = {
  DRAFT: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_DRAFT_REVIEW', 'SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_DRAFT_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['DRAFT', 'SUBMITTED_BY_CLIENT'], // ✅
    nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
    canEdit: ['CLIENT'],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['CLIENT_NEEDS_PRELIMINARY_CORRECTION', 'PRELIMINARY_APPROVED'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['FINAL_APPROVED', 'CLIENT_NEEDS_FINAL_CORRECTION'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  PRELIMINARY_RESUBMISSION_BY_CLIENT: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  CLIENT_NEEDS_FINAL_CORRECTION: {
    canSet: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FINAL_RESUBMISSION_BY_CLIENT: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  PRELIMINARY_APPROVED: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_FINAL_REVIEW', 'FRONTDESK_ON_HOLD'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ['FRONTDESK', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ['FRONTDESK', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: [
      'PRELIMINARY_TESTING_ON_HOLD',
      'PRELIMINARY_TESTING_NEEDS_CORRECTION',
      'UNDER_QA_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  PRELIMINARY_TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_PRELIMINARY_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_QA_PRELIMINARY_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: [
      'QA_NEEDS_PRELIMINARY_CORRECTION',
      'UNDER_CLIENT_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },
  QA_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ['QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_QA_PRELIMINARY_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  PRELIMINARY_RESUBMISSION_BY_TESTING: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['UNDER_QA_PRELIMINARY_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: [
      'FINAL_TESTING_ON_HOLD',
      'FINAL_TESTING_NEEDS_CORRECTION',
      'UNDER_QA_FINAL_REVIEW',
    ],
    nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC'],
  },
  FINAL_TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['FINAL_TESTING_NEEDS_CORRECTION', 'UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['CLIENT', 'MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FINAL_TESTING_NEEDS_CORRECTION: {
    canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_FINAL_CORRECTION'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_RESUBMISSION_QA_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  FINAL_RESUBMISSION_BY_TESTING: {
    canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },
  UNDER_QA_FINAL_REVIEW: {
    canSet: ['MICRO', 'MC', 'QA', 'SYSTEMADMIN'],
    next: ['QA_NEEDS_FINAL_CORRECTION', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },
  QA_NEEDS_FINAL_CORRECTION: {
    canSet: ['QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_QA_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'QA', 'SYSTEMADMIN'],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  FINAL_APPROVED: {
    canSet: [],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  VOID: {
    canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN', 'QA'], // nobody can set FROM VOID (no transitions out)
    next: [],
    nextEditableBy: ['SYSTEMADMIN'],
    canEdit: [],
  },

  CHANGE_REQUESTED: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: ['UNDER_CHANGE_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CHANGE_UPDATE: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },

  CORRECTION_REQUESTED: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: ['UNDER_CORRECTION_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CORRECTION_UPDATE: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },
} as const satisfies Partial<Record<ReportStatus, Transition>>;

// 🔁 Keep this in sync with backend
const STERILITY_STATUS_TRANSITIONS = {
  DRAFT: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_DRAFT_REVIEW', 'SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_DRAFT_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['DRAFT', 'SUBMITTED_BY_CLIENT'], // ✅
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: ['CLIENT', 'SYSTEMADMIN'],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['CLIENT_NEEDS_CORRECTION', 'APPROVED'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: ['CLIENT', 'SYSTEMADMIN'],
  },

  RESUBMISSION_BY_CLIENT: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_REVIEW', 'FRONTDESK_ON_HOLD'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ['FRONTDESK', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK', 'SYSTEMADMIN'],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ['FRONTDESK', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'UNDER_QA_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_CORRECTION'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_RESUBMISSION_QA_REVIEW', 'QA_NEEDS_CORRECTION'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  RESUBMISSION_BY_TESTING: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['QA_NEEDS_CORRECTION', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ['QA', 'SYSTEMADMIN', 'MC', 'MICRO'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_RESUBMISSION_QA_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },
  UNDER_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },
  APPROVED: {
    canSet: [],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  VOID: {
    canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN', 'QA'], // nobody can set FROM VOID (no transitions out)
    next: [],
    nextEditableBy: ['SYSTEMADMIN'],
    canEdit: [],
  },

  CHANGE_REQUESTED: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: ['UNDER_CHANGE_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CHANGE_UPDATE: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },

  CORRECTION_REQUESTED: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: ['UNDER_CORRECTION_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CORRECTION_UPDATE: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },
} as const satisfies Partial<Record<ReportStatus, Transition>>;

type ChangeStatusInput =
  | ReportStatus
  | { status: ReportStatus; reason?: string; eSignPassword?: string };

// ----------------------------
// Helper: Role → disallowed fields
// ----------------------------
function allowedForRole(role: UserRole, fields: string[]) {
  if (EDIT_MAP[role]?.includes('*')) return [];
  const disallowed = fields.filter((f) => !EDIT_MAP[role]?.includes(f));
  return disallowed;
}

function getDepartmentLetter(role: string): string {
  switch (role) {
    case 'MICRO':
      return 'OM';
    case 'CHEMISTRY':
      return 'BC';
    default:
      return '';
  }
}

// Critical fields that require reason
const CRITICAL_FIELDS = new Set<string>([
  'reviewedBy',
  'reviewedDate',
  'testedBy',
  'testedDate',
  'tbc_result',
  'tmy_result',
  'status',
]);

type CorrectionItem = {
  id: string;
  fieldKey: string; // e.g. "dateSent", "tbc_result"
  message: string; // reason text
  status: 'OPEN' | 'RESOLVED';
  requestedByUserId: string;
  requestedByRole: UserRole;
  createdAt: Date;
  oldValue?: any | null; // ✅ snapshot at time of request (string | number | array | object)
  resolvedAt?: string | null; // ✅ ISO
  resolvedByUserId?: string | null;

  resolutionNote?: string | null;
};

function _getCorrectionsArray(r: any): CorrectionItem[] {
  const raw = (r.corrections ?? []) as CorrectionItem[];
  return Array.isArray(raw) ? raw : [];
}

// Which details relation to use for a given formType
type MicroFormType = Extract<
  FormType,
  'MICRO_MIX' | 'MICRO_MIX_WATER' | 'STERILITY'
>;

const DETAILS_RELATION: Record<
  MicroFormType,
  'microMix' | 'microMixWater' | 'sterility'
> = {
  MICRO_MIX: 'microMix',
  MICRO_MIX_WATER: 'microMixWater',
  STERILITY: 'sterility',
};

// Prisma delegate per details model
function detailsDelegate(prisma: PrismaService, t: FormType) {
  switch (t) {
    case 'MICRO_MIX':
      return prisma.microMixDetails;
    case 'MICRO_MIX_WATER':
      return prisma.microMixWaterDetails;
    case 'STERILITY':
      return prisma.sterilityDetails;

    default:
      throw new BadRequestException(`Unsupported formType: ${t}`);
  }
}

// Base Report fields (the rest are treated as details fields)
const BASE_FIELDS = new Set([
  'formNumber',
  'reportNumber',
  'prefix',
  'status',
  'lockedAt',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'formType',
]);

// Split a flat patch into base-vs-details
function splitPatch(patch: Record<string, any>) {
  const base: any = {};
  const details: any = {};
  for (const [k, v] of Object.entries(patch)) {
    (BASE_FIELDS.has(k) ? base : details)[k] = v;
  }
  return { base, details };
}

// Pick the one details object off an included Report
function pickDetails(r: any) {
  return r.microMix ?? r.microMixWater ?? r.sterility ?? null;
}

// Flatten for backwards-compat responses (base + active details on top)
function flattenReport(r: any) {
  const { microMix, microMixWater, sterility, ...base } = r;
  const dRaw = pickDetails(r) || {};

  // Strip any keys that belong to the base report so they can't override it.
  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)), // BASE_FIELDS includes "status"
  );

  return { ...base, ...d }; // base wins for base fields (incl. status)
}

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') || formType.startsWith('STERILITY')
    ? 'OM'
    : 'BC';
}

function shouldAssignReportNumber(
  formType: FormType,
  nextStatus: ReportStatus,
) {
  if (formType === 'STERILITY') {
    return nextStatus === 'UNDER_TESTING_REVIEW';
  }
  // micro mix + micro water
  return nextStatus === 'UNDER_PRELIMINARY_TESTING_REVIEW';
}

function updateDetailsByType(
  tx: PrismaService,
  formType: FormType,
  reportId: string,
  data: Record<string, any>,
): Prisma.PrismaPromise<any> | null {
  if (!data || Object.keys(data).length === 0) return null;

  switch (formType) {
    case 'MICRO_MIX':
      return tx.microMixDetails.update({ where: { reportId }, data });
    case 'MICRO_MIX_WATER':
      return tx.microMixWaterDetails.update({ where: { reportId }, data });
    case 'STERILITY':
      return tx.sterilityDetails.update({ where: { reportId }, data });
    default:
      throw new Error(`Unsupported formType: ${formType}`);
  }
}

function transitionsFor(formType: FormType) {
  return formType === 'STERILITY'
    ? STERILITY_STATUS_TRANSITIONS
    : STATUS_TRANSITIONS;
}

// ----------------------------
// Reports Service
// ----------------------------
@Injectable()
export class ReportsService {
  constructor(
    private readonly reportsGateway: ReportsGateway,
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly attachments: AttachmentsService,
    private readonly reportNotifications: ReportNotificationsService,
  ) {}

  // 👇 add this inside the class
  private _getCorrectionsArray(r: any): CorrectionItem[] {
    const raw = r?.corrections;
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    return raw as CorrectionItem[];
  }

  async createDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    // guard
    if (!['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const formType: FormType = body?.formType;
    if (!formType) throw new BadRequestException('formType is required');

    const relationKey = DETAILS_RELATION[formType]; // e.g. "microMix"
    if (!relationKey)
      throw new BadRequestException(`Unsupported formType: ${formType}`);

    const clientCode = user.clientCode ?? body.clientCode;
    if (!clientCode) {
      throw new BadRequestException(
        'Client code is required to create a report',
      );
    }

    function yyyy(d: Date = new Date()): string {
      const yyyy = String(d.getFullYear());
      return yyyy; // e.g. "2410"
    }

    // Pads with a minimum of 4 digits, but grows as needed (10000 → width 5, etc.)
    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    // per-client running number
    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    // const formNumber = `${clientCode}-${String(seq.lastNumber).padStart(4, '0')}`;
    // const n = String(seq.lastNumber).padStart(4, '0');
    const n = seqPad(seq.lastNumber);
    const formNumber = `${clientCode}-${yyyy()}${n}`;
    const prefix = getDeptLetterForForm(formType); // "M" for MICRO_*

    // remove non-details keys from body that would collide with Report fields
    const { formType: _ft, clientCode: _cc, ...rest } = body;

    const created = await this.prisma.report.create({
      data: {
        clientCode,
        formType,
        formNumber,
        prefix,
        status: 'DRAFT',
        createdBy: user.userId,
        updatedBy: user.userId,
        [relationKey]: {
          create: this._coerce(rest), // everything else goes into details
        },
      },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });

    await this.prisma.auditTrail.create({
      data: {
        action: 'FORM_NUMBER_ASSIGNED',
        entity: created.formType,
        entityId: created.id,
        userId: user.userId,
        role: user.role,
        ipAddress: getRequestContext()?.ip ?? null,
        clientCode: created.clientCode ?? null,
        formNumber: created.formNumber,
        reportNumber: created.reportNumber ?? null,
        formType: created.formType,
        details: `Assigned form number ${created.formNumber}`,
        changes: {
          formNumber: created.formNumber,
        },
      },
    });

    const flat = flattenReport(created);
    this.reportsGateway.notifyReportCreated(flat);
    return flat;
  }

  async get(id: string) {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        attachments: true,
        statusHistory: true,
      },
    });
    if (!r) throw new NotFoundException('Report not found');
    return flattenReport(r);
  }

  async update(
    user: { userId: string; role: UserRole },
    id: string,
    patchIn: any,
  ) {
    const current = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });
    if (!current) throw new NotFoundException('Report not found');

    // LOCK guard
    if (
      (current.status === 'LOCKED' || current.status === 'VOID') &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException('Report is locked/void');
    }

    const ctx = getRequestContext() || {};
    const {
      reason: _reasonFromBody,
      eSignPassword: _pwdFromBody,
      expectedVersion,
      workflowReturnStatus,
      previousStatus,
      ...patch
    } = { ...patchIn };

    if (
      !['ADMIN', 'SYSTEMADMIN'].includes(user.role) &&
      typeof expectedVersion !== 'number'
    ) {
      throw new BadRequestException('expectedVersion is required');
    }

    // field-level permissions (ignore 'status' here)
    const fieldKeys = Object.keys(patch).filter((f) => f !== 'status');

    // Clients can edit any field while in DRAFT
    const clientMayEditDraft =
      user.role === 'CLIENT' &&
      (current.status === 'DRAFT' || current.status === 'UNDER_DRAFT_REVIEW');
    const SystemAdminMayEditDraft =
      user.role === 'SYSTEMADMIN' &&
      (current.status === 'DRAFT' || current.status === 'UNDER_DRAFT_REVIEW');

    if (!clientMayEditDraft && !SystemAdminMayEditDraft) {
      const bad = allowedForRole(user.role, fieldKeys);
      if (bad.length) {
        throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);
      }
    }

    const transitions = transitionsFor(current.formType);

    if (fieldKeys.length > 0) {
      const transition = transitions[current.status];
      if (!transition) {
        throw new BadRequestException(
          `No transition config for status: ${current.status} (formType: ${current.formType})`,
        );
      }
      if (!transition.canEdit.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot edit report in status ${current.status}`,
        );
      }
    }

    // reason for critical fields
    const touchingCritical = Object.keys(patchIn).some((k) =>
      CRITICAL_FIELDS.has(k),
    );
    const reasonFromCtxOrBody =
      (ctx as any).reason ?? _reasonFromBody ?? patchIn?.reason;
    if (touchingCritical && !reasonFromCtxOrBody) {
      throw new BadRequestException(
        'Reason for change is required (21 CFR Part 11). Provide X-Change-Reason header or body.reason',
      );
    }

    // Split base-vs-details
    const { base, details } = splitPatch(this._coerce(patch));

    // handle status transitions (base.status)
    if (patchIn.status) {
      const transitions = transitionsFor(current.formType);
      const trans = transitions[current.status];

      if (!trans) {
        throw new BadRequestException(
          `No transition config for status: ${current.status} (formType: ${current.formType})`,
        );
      }

      const targetStatus = patchIn.status as ReportStatus;

      // 🔥 NEW: when request is created
      if (
        targetStatus === 'CHANGE_REQUESTED' ||
        targetStatus === 'CORRECTION_REQUESTED'
      ) {
        base.workflowReturnStatus =
          patchIn.workflowReturnStatus ??
          patchIn.previousStatus ??
          current.status; // 🔥 where to go back
        base.workflowRequestKind =
          targetStatus === 'CHANGE_REQUESTED' ? 'CHANGE' : 'CORRECTION';
        base.workflowRequestedByRole = user.role;
        base.workflowRequestedAt = new Date();
      }
      const isVoid = targetStatus === 'VOID';

      const CENTRAL_REQUEST_STATUSES: ReportStatus[] = [
        'CHANGE_REQUESTED',
        'CORRECTION_REQUESTED',
      ];

      const CENTRAL_UPDATE_STATUSES: ReportStatus[] = [
        'UNDER_CHANGE_UPDATE',
        'UNDER_CORRECTION_UPDATE',
      ];

      const isCentralRequestStatus =
        CENTRAL_REQUEST_STATUSES.includes(targetStatus);

      const isCentralUpdateStatus =
        CENTRAL_UPDATE_STATUSES.includes(targetStatus);

      const isCentralStatus = isCentralRequestStatus || isCentralUpdateStatus;

      if (isVoid) {
        if (current.status === 'VOID') {
          throw new BadRequestException('Report is already VOID');
        }

        const voidRule = transitions.VOID;
        const allowed: UserRole[] = (voidRule?.canSet as
          | UserRole[]
          | undefined) ?? ['ADMIN', 'SYSTEMADMIN', 'QA', 'CLIENT'];

        if (!allowed.includes(user.role)) {
          throw new ForbiddenException(`Role ${user.role} cannot VOID reports`);
        }
      } else if (isCentralStatus) {
        // ✅ use centralized rule itself, not current state's rule
        const centralRule = transitions[targetStatus];
        if (!centralRule) {
          throw new BadRequestException(
            `No transition config for centralized status: ${targetStatus}`,
          );
        }

        if (!centralRule.canSet.includes(user.role)) {
          throw new ForbiddenException(
            `Role ${user.role} cannot change status to ${targetStatus}`,
          );
        }
      } else {
        // ✅ normal workflow path
        if (!trans.canSet.includes(user.role)) {
          throw new ForbiddenException(
            `Role ${user.role} cannot change status from ${current.status}`,
          );
        }

        if (!trans.next.includes(targetStatus)) {
          throw new BadRequestException(
            `Invalid transition: ${current.status} → ${targetStatus}`,
          );
        }
      }

      base.status = targetStatus;

      const isReturningFromCentralizedUpdate =
        (current.status === 'UNDER_CHANGE_UPDATE' ||
          current.status === 'UNDER_CORRECTION_UPDATE') &&
        targetStatus === current.workflowReturnStatus;

      if (isReturningFromCentralizedUpdate) {
        base.workflowReturnStatus = null;
        base.workflowRequestKind = null;
        base.workflowRequestedByRole = null;
        base.workflowRequestedAt = null;
      }

      function yyyy(d: Date = new Date()): string {
        const yyyy = String(d.getFullYear());
        return yyyy; // e.g. "2410"
      }

      // Pads with a minimum of 4 digits, but grows as needed (10000 → width 5, etc.)
      function seqPad(num: number): string {
        const width = Math.max(4, String(num).length);
        return String(num).padStart(width, '0');
      }

      // Assign report number when lab work starts
      if (
        patchIn.status &&
        !current.reportNumber &&
        shouldAssignReportNumber(current.formType, patchIn.status)
      ) {
        const deptLetter = getDeptLetterForForm(current.formType); // OM for MICRO + STERILITY, BC for chemistry
        const seq = await this.prisma.labReportSequence.upsert({
          where: { department: deptLetter },
          update: { lastNumber: { increment: 1 } },
          create: { department: deptLetter, lastNumber: 1 },
        });

        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: {
            name: true,
            userId: true,
            email: true,
          },
        });
        const n = seqPad(seq.lastNumber);
        base.reportNumber = `${deptLetter}-${yyyy()}${n}`;
        base.ReportnumberAssignedAt = new Date();
        base.ReportnumberAssignedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';
      }

      // e-sign requirements
      if (
        patchIn.status === 'UNDER_CLIENT_FINAL_REVIEW' ||
        patchIn.status === 'LOCKED' ||
        patchIn.status === 'VOID'
      ) {
        const password =
          _pwdFromBody ||
          (patchIn as any)?.eSignPassword ||
          (ctx as any)?.eSignPassword ||
          null;
        if (!password)
          throw new BadRequestException(
            'Electronic signature (password) is required',
          );
        await this.esign.verifyPassword(user.userId, String(password));
      }

      if (patchIn.status === 'LOCKED') base.lockedAt = new Date();
      base.status = patchIn.status;
    }

    // write base + details
    const relationKey = DETAILS_RELATION[current.formType];
    const delegate = detailsDelegate(this.prisma, current.formType);

    // ✅ Step 1: attempt base update with version check
    const baseRes = await this.prisma.report.updateMany({
      where: {
        id,
        ...(typeof expectedVersion === 'number'
          ? { version: expectedVersion }
          : {}),
      },
      data: {
        ...base,
        updatedBy: user.userId,
        version: { increment: 1 },
      },
    });

    // ✅ Step 2: if expectedVersion was provided, enforce conflict
    if (typeof expectedVersion === 'number' && baseRes.count === 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'This report was updated by someone else. Please reload and try again.',
        expectedVersion,
        currentVersion: current.version,
      });
    }

    // ✅ Step 3: now update details (only after base update succeeded)
    if (Object.keys(details).length > 0) {
      await updateDetailsByType(this.prisma, current.formType, id, details);
    }

    // ✅ Step 4: read updated report and do notifications + email
    const updated = await this.prisma.report.findUnique({
      where: { id },
      include: { microMix: true, microMixWater: true, sterility: true },
    });
    if (!updated) throw new NotFoundException('Report not found after update');

    if (!current.reportNumber && updated.reportNumber) {
      await this.prisma.auditTrail.create({
        data: {
          action: 'REPORT_NUMBER_ASSIGNED',
          entity: current.formType,
          entityId: current.id,
          userId: user.userId,
          role: user.role,
          ipAddress: getRequestContext()?.ip ?? null,
          clientCode: current.clientCode ?? null,
          formNumber: current.formNumber,
          reportNumber: updated.reportNumber,
          formType: current.formType,
          details: `Assigned report number ${updated.reportNumber}`,
          changes: {
            formNumber: current.formNumber,
            reportNumber: updated.reportNumber,
          },
        },
      });
    }

    const prevStatus = String(current.status);

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    if (patchIn.status && prevStatus !== String(patchIn.status)) {
      const ctx = getRequestContext() || {};
      const reason =
        (ctx as any)?.reason ?? _reasonFromBody ?? patchIn?.reason ?? null;

      await this.logStatusChange({
        reportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
        from: current.status,
        to: patchIn.status,
        reason,
        actorUserId: user.userId,
        actorRole: user.role,
      });
    }

    if (patchIn.status && prevStatus !== String(patchIn.status)) {
      const slug =
        current.formType === 'MICRO_MIX'
          ? 'micro-mix'
          : current.formType === 'MICRO_MIX_WATER'
            ? 'micro-mix-water'
            : current.formType === 'STERILITY'
              ? 'sterility'
              : 'micro-mix';

      const clientCode = current.clientCode ?? null;
      const clientName = pickDetails(current)?.client ?? '-'; // or '-' if you prefer

      await this.reportNotifications.onStatusChanged({
        formType: current.formType,
        reportId: current.id,
        formNumber: current.formNumber,
        clientName,
        clientCode,
        oldStatus: prevStatus,
        newStatus: String(patchIn.status),
        reportUrl: `${process.env.APP_URL}/reports/${slug}/${current.id}`,
        actorUserId: user.userId,
      });
    }

    return flattenReport(updated);
  }
  private async logStatusChange(args: {
    reportId: string;
    clientCode: string | null;
    formType: FormType;
    formNumber: string;
    reportNumber: string | null;
    from: ReportStatus;
    to: ReportStatus;
    reason: string | null;
    actorUserId: string;
    actorRole: UserRole;
  }) {
    const ctx = getRequestContext();

    // optional bypass
    if (ctx?.skipAudit) return;

    await this.prisma.$transaction([
      // Status history (your dedicated table)
      this.prisma.statusHistory.create({
        data: {
          reportId: args.reportId,
          from: args.from,
          to: args.to,
          reason: args.reason ?? null,
          userId: args.actorUserId,
          role: args.actorRole,
          ipAddress: ctx?.ip ?? null,
        },
      }),

      // Audit trail (what your Audit page reads)
      this.prisma.auditTrail.create({
        data: {
          action: 'STATUS_CHANGE',
          entity: args.formType, // OR "REPORT" if you want one entity name for all
          entityId: args.reportId,
          userId: args.actorUserId,
          role: args.actorRole,
          ipAddress: ctx?.ip ?? null,
          clientCode: args.clientCode ?? null,
          details: args.reason
            ? `Status changed: ${args.from} → ${args.to} | reason: ${args.reason}`
            : `Status changed: ${args.from} → ${args.to}`,
          changes: {
            from: args.from,
            to: args.to,
            reason: args.reason ?? null,
            formNumber: args.formNumber,
            reportNumber: args.reportNumber ?? null,
          },
          formNumber: args.formNumber,
          reportNumber: args.reportNumber ?? null,
          formType: args.formType,
        },
      }),
    ]);
  }

  private async logCorrectionAudit(args: {
    reportId: string;
    clientCode: string | null;
    formType: FormType;
    formNumber: string;
    reportNumber: string | null;
    actorUserId: string;
    actorRole: UserRole;
    action:
      | 'CORRECTION_CREATED'
      | 'CORRECTION_RESOLVED'
      | 'CORRECTION_RESOLVED_ALL';
    details: string;
    changes?: Record<string, any> | null;
  }) {
    const ctx = getRequestContext();
    if (ctx?.skipAudit) return;

    await this.prisma.auditTrail.create({
      data: {
        action: args.action,
        entity: args.formType,
        entityId: args.reportId,
        userId: args.actorUserId,
        role: args.actorRole,
        ipAddress: ctx?.ip ?? null,
        clientCode: args.clientCode ?? null,
        details: args.details,
        changes: args.changes ?? {},
        formNumber: args.formNumber,
        reportNumber: args.reportNumber ?? null,
        formType: args.formType,
      },
    });
  }

  // async updateStatus(
  //   user: { userId: string; role: UserRole },
  //   id: string,
  //   status: ReportStatus,
  // ) {
  //   return this.update(user, id, { status });
  // }

  async updateStatus(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      status: ReportStatus;
      reason?: string;
      eSignPassword?: string;
      expectedVersion?: number;
    },
  ) {
    return this.update(user, id, body);
  }

  async changeStatus(
    user: { userId: string; role: UserRole },
    id: string,
    input: ChangeStatusInput,
  ) {
    // IMPORTANT: use prisma findUnique so we have base + details
    const current = await this.prisma.report.findUnique({
      where: { id },
      include: { microMix: true, microMixWater: true, sterility: true },
    });
    if (!current) throw new NotFoundException('Report not found');

    const prevStatus = current.status;

    if (!['ADMIN', 'SYSTEMADMIN', 'QA', 'MICRO', 'MC'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN/SYSTEMADMIN/QA/MICRO/MC can Change Status this directly',
      );
    }

    const target: ReportStatus =
      typeof input === 'string' ? input : input.status;
    if (!target) throw new BadRequestException('Status is required');

    const ctx = getRequestContext() || {};

    const reason =
      typeof input === 'string'
        ? (ctx as any)?.reason
        : (input.reason ?? (ctx as any)?.reason);

    const eSignPassword =
      typeof input === 'string'
        ? (ctx as any)?.eSignPassword
        : (input.eSignPassword ?? (ctx as any)?.eSignPassword);

    if (!reason) {
      throw new BadRequestException(
        'Reason for change is required (21 CFR Part 11). Provide X-Change-Reason header or body.reason',
      );
    }

    // ✅ e-sign rules (keep your existing rule)
    const skipESign = target === 'UNDER_FINAL_TESTING_REVIEW';
    if (!skipESign) {
      if (!eSignPassword) {
        throw new BadRequestException(
          'Electronic Signature (password) is required for status changes',
        );
      }
      await this.esign.verifyPassword(user.userId, String(eSignPassword));
    }

    const transitions = transitionsFor(current.formType);
    const trans = transitions[prevStatus];

    if (!trans) {
      throw new BadRequestException(
        `No transition config for status: ${prevStatus} (formType: ${current.formType})`,
      );
    }

    const isVoid = target === 'VOID';

    if (isVoid) {
      if (prevStatus === 'VOID') {
        throw new BadRequestException('Report is already VOID');
      }
      const voidRule = transitions.VOID;

      // ✅ force the array element type to be UserRole
      const allowed: UserRole[] = (voidRule?.canSet as
        | UserRole[]
        | undefined) ?? ['ADMIN', 'SYSTEMADMIN', 'QA', 'CLIENT'];

      if (!allowed.includes(user.role)) {
        throw new ForbiddenException(`Role ${user.role} cannot VOID reports`);
      }
    }

    const patch: any = { status: target };

    // ✅ assign report number same behavior as update()
    function yyyy(d: Date = new Date()): string {
      return String(d.getFullYear());
    }
    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    if (
      !current.reportNumber &&
      shouldAssignReportNumber(current.formType, target)
    ) {
      const deptLetter = getDeptLetterForForm(current.formType);
      const seq = await this.prisma.labReportSequence.upsert({
        where: { department: deptLetter },
        update: { lastNumber: { increment: 1 } },
        create: { department: deptLetter, lastNumber: 1 },
      });

      const actor = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          name: true,
          userId: true,
          email: true,
        },
      });
      patch.reportNumber = `${deptLetter}-${yyyy()}${seqPad(seq.lastNumber)}`;
      patch.ReportnumberAssignedAt = new Date();
      patch.ReportnumberAssignedBy =
        actor?.name?.trim() ||
        actor?.userId?.trim() ||
        actor?.email?.trim() ||
        'Unknown';
    }

    // ✅ apply lock timestamp
    if (target === 'LOCKED') patch.lockedAt = new Date();

    const updated = await this.prisma.report.update({
      where: { id },
      data: { ...patch, updatedBy: user.userId },
      include: { microMix: true, microMixWater: true, sterility: true },
    });

    // if (!current.reportNumber && updated.reportNumber) {
    //   await this.prisma.auditTrail.create({
    //     data: {
    //       action: 'REPORT_NUMBER_ASSIGNED',
    //       entity: current.formType,
    //       entityId: current.id,
    //       userId: user.userId,
    //       role: user.role,
    //       ipAddress: getRequestContext()?.ip ?? null,
    //       clientCode: current.clientCode ?? null,
    //       formNumber: current.formNumber,
    //       reportNumber: updated.reportNumber,
    //       formType: current.formType,
    //       details: `Assigned report number ${updated.reportNumber}`,
    //       changes: {
    //         formNumber: current.formNumber,
    //         reportNumber: updated.reportNumber,
    //       },
    //     },
    //   });
    // }

    // ✅ NOW log status change (StatusHistory + AuditTrail)
    if (prevStatus !== target) {
      await this.logStatusChange({
        reportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
        from: prevStatus,
        to: target,
        reason: reason ?? null,
        actorUserId: user.userId,
        actorRole: user.role,
      });
    }

    // ✅ notify websocket
    this.reportsGateway.notifyStatusChange(id, target);

    // ✅ OPTIONAL: if you also want emails for change-status (same as update())
    if (prevStatus !== target) {
      const slug =
        current.formType === 'MICRO_MIX'
          ? 'micro-mix'
          : current.formType === 'MICRO_MIX_WATER'
            ? 'micro-mix-water'
            : current.formType === 'STERILITY'
              ? 'sterility'
              : 'micro-mix';

      const clientName = pickDetails(current)?.client ?? '-';
      await this.reportNotifications.onStatusChanged({
        formType: current.formType,
        reportId: current.id,
        formNumber: current.formNumber,
        clientName,
        clientCode: current.clientCode ?? null,
        oldStatus: String(prevStatus),
        newStatus: String(target),
        reportUrl: `${process.env.APP_URL}/reports/${slug}/${current.id}`,
        actorUserId: user.userId,
      });
    }

    return flattenReport(updated);
  }

  async findAll() {
    const rows = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });
    return rows.map(flattenReport);
  }

  // ----------------------------
  // Coerce dates and JSON (unchanged)
  // ----------------------------
  private _coerce(obj: any) {
    const copy = { ...obj };
    const dateKeys = [
      'dateSent',
      'manufactureDate',
      'samplingDate',
      'dateTested',
      'preliminaryResultsDate',
      'dateCompleted',
      'testedDate',
      'reviewedDate',
    ];
    for (const k of dateKeys) {
      if (!(k in copy)) continue;

      if (copy[k] === '' || copy[k] === null) {
        copy[k] = null;
      } else if (typeof copy[k] === 'string') {
        const d = new Date(copy[k]);
        copy[k] = !isNaN(d.getTime()) ? d : null;
      }
    }
    if (copy.pathogens && typeof copy.pathogens !== 'object') {
      try {
        copy.pathogens = JSON.parse(copy.pathogens);
      } catch {}
    }
    return copy;
  }

  // POST /reports/:id/corrections
  async createCorrections(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      items: { fieldKey: string; message: string; oldValue?: any | null }[];
      targetStatus?: ReportStatus;
      reason?: string;
      expectedVersion?: number;
      previousStatus?: ReportStatus;
      workflowReturnStatus?: ReportStatus;
    },
  ) {
    if (!body.items?.length) {
      throw new BadRequestException(
        'At least one correction item is required.',
      );
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const mayRequest = [
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
      'CLIENT',
    ] as const;
    if (!mayRequest.includes(user.role))
      throw new ForbiddenException('Not allowed');

    const d = pickDetails(report);
    if (!d)
      throw new BadRequestException('Details row missing for this report');

    const nowIso = new Date().toISOString();
    const existing = this._getCorrectionsArray(d);
    const toAdd = body.items.map((it) => ({
      id: randomUUID(),
      fieldKey: it.fieldKey,
      message: it.message,
      status: 'OPEN' as const,
      requestedByUserId: user.userId,
      requestedByRole: user.role,
      createdAt: nowIso,

      // ✅ store snapshot
      oldValue: it.oldValue ?? null,

      resolvedAt: null as string | null,
      resolvedByUserId: null as string | null,
      resolutionNote: null as string | null,
    }));
    const nextCorrections = [...existing, ...toAdd];

    await updateDetailsByType(this.prisma, report.formType, id, {
      corrections: nextCorrections,
    });
    await this.logCorrectionAudit({
      reportId: report.id,
      clientCode: report.clientCode ?? null,
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_CREATED',
      details: `Created ${toAdd.length} correction item(s)`,
      changes: {
        targetStatus: body.targetStatus ?? null,
        reason: body.reason ?? null,
        items: toAdd.map((c) => ({
          id: c.id,
          fieldKey: c.fieldKey,
          message: c.message,
          oldValue: c.oldValue ?? null,
          requestedByRole: c.requestedByRole,
          createdAt: c.createdAt,
        })),
      },
    });

    if (body.targetStatus) {
      await this.update(user, id, {
        status: body.targetStatus,
        reason: body.reason || 'Corrections requested',
        expectedVersion: body.expectedVersion,
        workflowReturnStatus: body.workflowReturnStatus ?? body.previousStatus,
      });
    }

    return nextCorrections;
  }

  async listCorrections(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    const d = pickDetails(report);
    return this._getCorrectionsArray(d);
  }

  async resolveCorrection(
    user: { userId: string; role: UserRole },
    id: string,
    cid: string,
    body: { resolutionNote?: string },
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const d = pickDetails(report) || { corrections: [] };
    const arr = this._getCorrectionsArray(d);
    const idx = arr.findIndex((c) => c.id === cid);
    if (idx < 0) throw new NotFoundException('Correction not found');

    const allowedResolvers: UserRole[] = [
      'CLIENT',
      'MICRO',
      'FRONTDESK',
      'ADMIN',
      'QA',
      'SYSTEMADMIN',
    ];
    if (!allowedResolvers.includes(user.role)) {
      throw new ForbiddenException('Not allowed to resolve');
    }

    arr[idx] = {
      ...arr[idx],
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: user.userId,
      resolutionNote: body?.resolutionNote ?? null,
    };

    await updateDetailsByType(this.prisma, report.formType, id, {
      corrections: arr,
    });

    const resolvedItem = arr[idx];

    await this.logCorrectionAudit({
      reportId: report.id,
      clientCode: report.clientCode ?? null,
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_RESOLVED',
      details: `Resolved correction for field ${resolvedItem.fieldKey}`,
      changes: {
        correctionId: resolvedItem.id,
        fieldKey: resolvedItem.fieldKey,
        message: resolvedItem.message,
        oldValue: resolvedItem.oldValue ?? null,
        resolvedAt: resolvedItem.resolvedAt ?? null,
        resolvedByUserId: resolvedItem.resolvedByUserId ?? null,
        resolutionNote: resolvedItem.resolutionNote ?? null,
      },
    });

    const allResolved = arr.every((c) => c.status === 'RESOLVED');

    if (
      allResolved &&
      (report.status === 'UNDER_CHANGE_UPDATE' ||
        report.status === 'UNDER_CORRECTION_UPDATE') &&
      report.workflowReturnStatus
    ) {
      await this.prisma.report.update({
        where: { id },
        data: {
          status: report.workflowReturnStatus,
          workflowReturnStatus: null,
          workflowRequestKind: null,
          workflowRequestedByRole: null,
          workflowRequestedAt: null,
          updatedBy: user.userId,
          version: { increment: 1 },
        },
      });

      await this.logCorrectionAudit({
        reportId: report.id,
        clientCode: report.clientCode ?? null,
        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber ?? null,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'CORRECTION_RESOLVED_ALL',
        details: 'All correction items resolved',
        changes: {
          returnedFromStatus: report.status,
          returnedToStatus: report.workflowReturnStatus,
          totalCorrections: arr.length,
        },
      });

      await this.logStatusChange({
        reportId: report.id,
        clientCode: report.clientCode ?? null,
        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber ?? null,
        from: report.status,
        to: report.workflowReturnStatus,
        reason: 'Returned to original status after all corrections resolved',
        actorUserId: user.userId,
        actorRole: user.role,
      });

      this.reportsGateway.notifyStatusChange(id, report.workflowReturnStatus);
    } else {
      this.reportsGateway.notifyReportUpdate({ id });
    }

    return { ok: true };
  }
  // async resolveCorrection(
  //   user: { userId: string; role: UserRole },
  //   id: string,
  //   cid: string,
  //   body: { resolutionNote?: string },
  // ) {
  //   const report = await this.prisma.report.findUnique({
  //     where: { id },
  //     include: {
  //       microMix: true,
  //       microMixWater: true,
  //       sterility: true,
  //     },
  //   });
  //   if (!report) throw new NotFoundException('Report not found');

  //   const d = pickDetails(report) || { corrections: [] };
  //   const arr = this._getCorrectionsArray(d);
  //   const idx = arr.findIndex((c) => c.id === cid);
  //   if (idx < 0) throw new NotFoundException('Correction not found');

  //   const allowedResolvers: UserRole[] = [
  //     'CLIENT',
  //     'MICRO',
  //     'FRONTDESK',
  //     'ADMIN',
  //     'QA',
  //   ];
  //   if (!allowedResolvers.includes(user.role))
  //     throw new ForbiddenException('Not allowed to resolve');
  //   arr[idx] = {
  //     ...arr[idx],
  //     status: 'RESOLVED',
  //     resolvedAt: new Date().toISOString(), // ✅ ISO
  //     resolvedByUserId: user.userId,
  //     resolutionNote: body?.resolutionNote ?? null, // ✅ store note
  //   };

  //   await updateDetailsByType(this.prisma, report.formType, id, {
  //     corrections: arr,
  //   });

  //   this.reportsGateway.notifyReportUpdate({ id });
  //   return { ok: true };
  // }

  private async findReportOrThrow(user: any, id: string) {
    // add org/tenant scoping here if you have it on MicroMixReport
    const report = await this.prisma.report.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async addAttachment(
    user: any,
    id: string,
    file: Express.Multer.File,
    body: {
      pages?: string;
      checksum?: string;
      source?: string;
      createdBy?: string;
      kind?: string;
      meta?: Record<string, any>;
    },
  ) {
    // delegate; AttachmentsService handles FILES_DIR & DB
    // reports.service.ts (addAttachment handler)
    return this.attachments.create({
      reportId: id,
      file,
      kind: (body.kind as any) ?? 'OTHER',
      source: body.source ?? 'upload',
      pages: body.pages ? Number(body.pages) : undefined,
      providedChecksum: body.checksum, // you already added this
      createdBy: body.createdBy ?? user?.userId ?? 'web',
      meta: typeof body.meta === 'string' ? JSON.parse(body.meta) : body.meta, // ⬅ pass meta
    });
  }

  // reports.service.ts
  async listAttachments(id: string) {
    return this.attachments.listForReport(id);
  }
}
