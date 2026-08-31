import {
  Injectable,
  Logger,
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
  ReportType,
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
import { DashboardReportSyncService } from 'src/dashboards/dashboard-report-sync.service';
import { WorkflowReminderService } from 'src/notifications/workflow-reminder.service';

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
    'organisms',
    'comments'
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

type CorrectionRecipientSide = 'CLIENT' | 'LAB' | 'BOTH';

type CorrectionItem = {
  id: string;
  fieldKey: string; // e.g. "dateSent", "tbc_result"
  message: string; // reason text
  status: 'OPEN' | 'RESOLVED';
  requestedByUserId: string;
  requestedByRole: UserRole;
  createdAt: Date;
  recipientSide?: CorrectionRecipientSide | null;
  oldValue?: any | null; // ✅ snapshot at time of request (string | number | array | object)
  resolvedAt?: string | null; // ✅ ISO
  resolvedByUserId?: string | null;
  resolvedByRole?: UserRole | null;
  resolutionNote?: string | null;
};

function _getCorrectionsArray(r: any): CorrectionItem[] {
  const raw = (r.corrections ?? []) as CorrectionItem[];
  return Array.isArray(raw) ? raw : [];
}

// Which details relation to use for a given formType
type MicroFormType = Extract<
  FormType,
  'MICRO_MIX' | 'MICRO_MIX_WATER' | 'STERILITY' | 'APE'
>;

type LabReportType = Extract<
  ReportType,
  'APE_VALIDATION_REPORT' | 'APE_REPORT'
>;

const APE_CHILD_EDIT_FIELDS: Partial<Record<UserRole, readonly string[]>> = {
  SYSTEMADMIN: ['*'],
  ADMIN: ['*'],
  MICRO: [
    'testSopNo',
    'testReference',
    'dateTested',
    'dateCompleted',
    'validationSections',
    'apeReportSections',
    'testedBy',
    'testedDate',
  ],
  MC: [
    'testSopNo',
    'testReference',
    'dateTested',
    'dateCompleted',
    'validationSections',
    'apeReportSections',
    'testedBy',
    'testedDate',
  ],
};

function assertApeChildFieldPermissions(
  role: UserRole,
  patch: Record<string, any>,
) {
  const allowed = APE_CHILD_EDIT_FIELDS[role] ?? [];

  if (allowed.includes('*')) return;

  const denied = Object.keys(patch).filter((field) => !allowed.includes(field));

  if (denied.length > 0) {
    throw new ForbiddenException(
      `You cannot edit APE client/submission fields: ${denied.join(', ')}`,
    );
  }
}

const REPORT_DETAILS_RELATION: Record<
  LabReportType,
  'apeValidationReport' | 'apeReport'
> = {
  APE_VALIDATION_REPORT: 'apeValidationReport',
  APE_REPORT: 'apeReport',
};

const DETAILS_RELATION: Record<
  MicroFormType,
  'microMix' | 'microMixWater' | 'sterility' | 'ape'
> = {
  MICRO_MIX: 'microMix',
  MICRO_MIX_WATER: 'microMixWater',
  STERILITY: 'sterility',
  APE: 'ape',
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
    case 'APE':
      return prisma.apeDetails;

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
  'reportType',
  'parentReportId',
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
  return (
    r.microMix ??
    r.microMixWater ??
    r.sterility ??
    r.ape ??
    r.apeValidationReport ??
    r.apeReport ??
    null
  );
}

// Flatten for backwards-compat responses (base + active details on top)
function flattenReport(r: any) {
  const {
    microMix,
    microMixWater,
    sterility,
    ape,
    apeValidationReport,
    apeReport,
    ...base
  } = r;

  const dRaw = pickDetails(r) || {};

  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)),
  );

  return { ...base, ...d };
}

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  if (formType === 'APE') return 'APE';

  if (formType.startsWith('MICRO') || formType === 'STERILITY') {
    return 'OM';
  }

  return 'BC';
}

function shouldAssignReportNumber(
  formType: FormType,
  nextStatus: ReportStatus,
) {
  if (formType === 'STERILITY' || formType === 'APE') {
    return nextStatus === 'UNDER_TESTING_REVIEW';
  }

  return nextStatus === 'UNDER_PRELIMINARY_TESTING_REVIEW';
}

/**
 * Billing milestone for MICRO / STERILITY / APE root reports.
 *
 * IMPORTANT:
 * - This records the FIRST time results reach the client.
 * - It never changes during corrections/resubmissions.
 * - APE child reports are NEVER billable.
 * - billingReadyAt means the SOURCE REPORT is ready for billing.
 *   ClientDetails.billingEnabled / billingStartAt are applied later
 *   when invoices are generated.
 */
function buildReportBillingMilestonePatch(args: {
  current: {
    formType: FormType;
    reportType?: ReportType | null;
    parentReportId?: string | null;
    reportNumber?: string | null;
    resultSentToClientAt?: Date | null;
    billingReadyAt?: Date | null;
  };

  nextStatus?: ReportStatus | null;

  // Use this when a report number is being assigned
  // in the same update.
  pendingReportNumber?: string | null;

  now?: Date;
}) {
  const { current, nextStatus, pendingReportNumber, now = new Date() } = args;

  const patch: {
    resultSentToClientAt?: Date;
    billingReadyAt?: Date;
  } = {};

  if (!nextStatus) {
    return patch;
  }

  /*
   * ---------------------------------------------------------
   * APE CHILD PROTECTION
   * ---------------------------------------------------------
   *
   * APE Validation Report and APE Report are separate Report rows.
   * They must never create billing milestones.
   */
  if (current.parentReportId || current.reportType) {
    return patch;
  }

  /*
   * ---------------------------------------------------------
   * RESULT-SENT MILESTONES
   * ---------------------------------------------------------
   */

  const isMicroFinalClientReview =
    (current.formType === 'MICRO_MIX' ||
      current.formType === 'MICRO_MIX_WATER') &&
    nextStatus === 'UNDER_CLIENT_FINAL_REVIEW';

  const isSterilityOrApeClientReview =
    (current.formType === 'STERILITY' || current.formType === 'APE') &&
    nextStatus === 'UNDER_CLIENT_REVIEW';

  const reachedClientResultMilestone =
    isMicroFinalClientReview || isSterilityOrApeClientReview;

  /*
   * Preserve the original timestamp forever.
   */
  let effectiveResultSentAt = current.resultSentToClientAt ?? null;

  if (reachedClientResultMilestone && !current.resultSentToClientAt) {
    patch.resultSentToClientAt = now;
    effectiveResultSentAt = now;
  }

  /*
   * A report becomes billing-ready when BOTH are true:
   *
   * 1. Client result milestone was reached.
   * 2. A report number exists.
   *
   * billingReadyAt is also permanent.
   */
  const effectiveReportNumber =
    pendingReportNumber ?? current.reportNumber ?? null;

  if (
    !current.billingReadyAt &&
    effectiveResultSentAt &&
    effectiveReportNumber
  ) {
    patch.billingReadyAt = now;
  }

  return patch;
}

type ReportDbClient = PrismaService | Prisma.TransactionClient;

function updateDetailsByType(
  tx: ReportDbClient,
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
    case 'APE':
      return tx.apeDetails.update({ where: { reportId }, data });
    default:
      throw new Error(`Unsupported formType: ${formType}`);
  }
}

function updateLabReportDetailsByType(
  tx: PrismaService,
  reportType: ReportType | null,
  reportId: string,
  data: Record<string, any>,
): Prisma.PrismaPromise<any> | null {
  if (!data || Object.keys(data).length === 0) return null;

  switch (reportType) {
    case 'APE_VALIDATION_REPORT':
      return tx.apeValidationReportDetails.update({
        where: { reportId },
        data,
      });

    case 'APE_REPORT':
      return tx.apeReportDetails.update({
        where: { reportId },
        data,
      });

    default:
      return null;
  }
}

function transitionsFor(formType: FormType) {
  return formType === 'STERILITY' || formType === 'APE'
    ? STERILITY_STATUS_TRANSITIONS
    : STATUS_TRANSITIONS;
}

// ----------------------------
// Reports Service
// ----------------------------
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly reportsGateway: ReportsGateway,
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly attachments: AttachmentsService,
    private readonly reportNotifications: ReportNotificationsService,
    private readonly dashboardSync: DashboardReportSyncService,
    private readonly workflowReminders: WorkflowReminderService,
  ) {}

  /**
   * Writes the root workflow snapshot to DashboardReport using the same
   * transaction as the Report and details updates. The upsert also repairs a
   * missing dashboard row instead of allowing the source and dashboard tables
   * to remain inconsistent.
   */
  private async syncDashboardRootInsideTransaction(
    tx: Prisma.TransactionClient,
    reportId: string,
  ) {
    const source = await tx.report.findUnique({
      where: { id: reportId },
      select: {
        formType: true,
        formNumber: true,
        reportNumber: true,
        prefix: true,
        clientCode: true,
        status: true,
        version: true,
        lockedAt: true,
        createdBy: true,
        updatedBy: true,
        ReportnumberAssignedAt: true,
        ReportnumberAssignedBy: true,
        workflowReturnStatus: true,
        workflowRequestKind: true,
        workflowRequestedByRole: true,
        workflowRequestedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!source) {
      throw new NotFoundException(
        'Report not found during dashboard synchronization',
      );
    }

    const dashboardData = {
      formType: source.formType,
      formNumber: source.formNumber,
      reportNumber: source.reportNumber,
      prefix: source.prefix,
      clientCode: source.clientCode,
      status: String(source.status),
      detailStatus: String(source.status),
      version: source.version,
      sourceLockedAt: source.lockedAt,
      sourceCreatedBy: source.createdBy,
      sourceUpdatedBy: source.updatedBy,
      reportNumberAssignedAt: source.ReportnumberAssignedAt,
      reportNumberAssignedBy: source.ReportnumberAssignedBy,
      workflowReturnStatus: source.workflowReturnStatus
        ? String(source.workflowReturnStatus)
        : null,
      workflowRequestKind: source.workflowRequestKind,
      workflowRequestedByRole: source.workflowRequestedByRole,
      workflowRequestedAt: source.workflowRequestedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };

    await tx.dashboardReport.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: 'MICRO_REPORT',
          sourceId: reportId,
        },
      },
      create: {
        sourceType: 'MICRO_REPORT',
        sourceId: reportId,
        ...dashboardData,
      },
      update: dashboardData,
    });
  }

  // 👇 add this inside the class
  private _getCorrectionsArray(r: any): CorrectionItem[] {
    const raw = r?.corrections;
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    return raw as CorrectionItem[];
  }

  async findApeChildByParent(parentReportId: string, reportType: ReportType) {
    if (!parentReportId) {
      throw new BadRequestException('parentReportId is required');
    }

    if (reportType !== 'APE_VALIDATION_REPORT' && reportType !== 'APE_REPORT') {
      throw new BadRequestException(`Unsupported reportType: ${reportType}`);
    }

    const row = await this.prisma.report.findFirst({
      where: {
        parentReportId,
        reportType,
      },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
        apeValidationReport: true,
        apeReport: true,
        attachments: true,
        statusHistory: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return row ? flattenReport(row) : null;
  }

  private async addCreatorName(report: any) {
    if (!report) return report;

    const createdBy = String(report.createdBy || '').trim();

    if (!createdBy) {
      return {
        ...report,
        createdByName: null,
      };
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: createdBy },
      select: {
        name: true,
        userId: true,
        email: true,
      },
    });

    return {
      ...report,
      createdByName:
        creator?.name?.trim() ||
        creator?.userId?.trim() ||
        creator?.email?.trim() ||
        null,
    };
  }

  private async syncWorkflowReminderSafe(args: {
    reportId: string;
    formType: FormType;
    formNumber: string;
    clientCode?: string | null;
    newStatus: string;
    requestKind?: string | null;
    requestedByRole?: UserRole | null;
  }) {
    try {
      await this.workflowReminders.handleStatusChange({
        sourceType: 'REPORT',
        sourceId: args.reportId,

        formType: args.formType,
        formNumber: args.formNumber,

        clientCode: args.clientCode ?? null,

        newStatus: args.newStatus,

        requestKind: args.requestKind,
        requestedByRole: args.requestedByRole ?? null,
      });
    } catch (error: any) {
      this.logger.error(
        `Report ${args.reportId} reminder scheduling failed: ${error?.message ?? error}`,
        error?.stack,
      );
    }
  }

  async createLabReportDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    if (!['MICRO', 'MC', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create lab report');
    }

    const reportType: LabReportType = body?.reportType;

    if (!reportType) {
      throw new BadRequestException('reportType is required');
    }

    const relationKey = REPORT_DETAILS_RELATION[reportType];

    if (!relationKey) {
      throw new BadRequestException(`Unsupported reportType: ${reportType}`);
    }

    let parent: any = null;

    if (body.parentReportId) {
      parent = await this.prisma.report.findUnique({
        where: { id: body.parentReportId },
      });

      if (!parent) {
        throw new BadRequestException('Parent APE report not found');
      }
    }
    const clientCode =
      String(body.clientCode ?? '').trim() ||
      String(parent?.clientCode ?? '').trim() ||
      String(parent?.formNumber ?? '').split('-')[0] ||
      String(user.clientCode ?? '').trim();

    if (!clientCode) {
      throw new BadRequestException(
        'Client code is required to create lab report',
      );
    }

    function yyyy(d: Date = new Date()): string {
      return String(d.getFullYear());
    }

    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    const seqKey = `${clientCode}:${reportType}`;

    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode: seqKey },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode: seqKey, lastNumber: 1 },
    });

    const n = seqPad(seq.lastNumber);

    const formNumber =
      reportType === 'APE_VALIDATION_REPORT'
        ? `${clientCode}-APEVAL-${yyyy()}${n}`
        : `${clientCode}-APEREP-${yyyy()}${n}`;

    const prefix = 'APE';

    const {
      reportType: _rt,
      formType: _ft,
      clientCode: _cc,
      parentReportId: _parentReportId,
      status: _status,
      ...rest
    } = body;

    const created = await this.prisma.report.create({
      data: {
        clientCode,
        formType: FormType.APE,
        reportType,
        parentReportId: body.parentReportId ?? null,
        formNumber,
        prefix,
        status: 'DRAFT',
        createdBy: user.userId,
        updatedBy: user.userId,
        [relationKey]: {
          create: this._coerce({
            ...rest,
            footerRevNo: 'Rev-00',
            footerDateEffective: new Date('2026-07-10T12:00:00.000Z'),
          }),
        },
      },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
        apeValidationReport: true,
        apeReport: true,
      },
    });

    await this.prisma.auditTrail.create({
      data: {
        action: 'LAB_REPORT_CREATED',
        entity: reportType,
        entityId: created.id,
        userId: user.userId,
        role: user.role,
        ipAddress: getRequestContext()?.ip ?? null,
        clientCode: created.clientCode ?? null,
        formNumber: created.formNumber,
        reportNumber: created.reportNumber ?? null,
        details: `Created ${reportType}`,
        changes: {
          reportType,
          parentReportId: body.parentReportId ?? null,
        },
      },
    });

    const flat = flattenReport(created);
    const response = await this.addCreatorName(flat);

    this.reportsGateway.notifyReportCreated(response);

    return response;
  }

  private async resolveCreateClientCode(
    user: {
      userId: string;
      role: UserRole;
      clientCode?: string;
    },
    body: any,
  ) {
    /*
     * Normal CLIENT creation.
     *
     * Never trust a client-supplied createForClientCode.
     */
    if (user.role === 'CLIENT') {
      const clientCode = String(user.clientCode ?? '')
        .trim()
        .toUpperCase();

      if (!clientCode) {
        throw new BadRequestException(
          'Your account is not assigned to a client code',
        );
      }

      return clientCode;
    }

    /*
     * Internal creation on behalf of a client.
     */
    if (user.role === 'ADMIN' || user.role === 'SYSTEMADMIN') {
      const clientCode = String(body?.createForClientCode ?? '')
        .trim()
        .toUpperCase();

      if (!clientCode) {
        throw new BadRequestException(
          'createForClientCode is required when creating a form for a client',
        );
      }

      const client = await this.prisma.clientDetails.findUnique({
        where: {
          clientCode,
        },
        select: {
          clientCode: true,
          name: true,
          active: true,
        },
      });

      if (!client) {
        throw new BadRequestException(`Client ${clientCode} does not exist`);
      }

      if (!client.active) {
        throw new BadRequestException(`Client ${clientCode} is inactive`);
      }

      return client.clientCode;
    }

    throw new ForbiddenException('Not allowed to create report');
  }

  async createDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    // guard
    const reportType: ReportType | undefined = body?.reportType;

    if (reportType) {
      return this.createLabReportDraft(user, body);
    }

    // guard for normal submission forms
    if (!['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const formType: FormType = body?.formType;
    if (!formType) throw new BadRequestException('formType is required');

    const relationKey = DETAILS_RELATION[formType]; // e.g. "microMix"
    if (!relationKey)
      throw new BadRequestException(`Unsupported formType: ${formType}`);

    const clientCode = await this.resolveCreateClientCode(user, body);

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
    const {
      formType: _ft,
      clientCode: _cc,
      createForClientCode: _createForClientCode,
      ...rest
    } = body;

    // const MICRO_FOOTER_REV_NO = 'Rev-02';
    // const MICRO_FOOTER_DATE_EFFECTIVE = new Date('2026-06-03T00:00:00.000Z');

    const FOOTER_BY_FORM_TYPE = {
      MICRO_MIX: {
        footerRevNo: 'Rev-02',
        footerDateEffective: new Date('2026-06-03T12:00:00.000Z'),
      },
      MICRO_MIX_WATER: {
        footerRevNo: 'Rev-01',
        footerDateEffective: new Date('2026-03-10T12:00:00.000Z'),
      },
      STERILITY: {
        footerRevNo: 'Rev-01',
        footerDateEffective: new Date('2026-03-10T12:00:00.000Z'),
      },
      APE: {
        footerRevNo: 'Rev-00',
        footerDateEffective: new Date('2026-07-10T12:00:00.000Z'),
      },
    } as const;

    const footerDefaults = FOOTER_BY_FORM_TYPE[formType];

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
          create: this._coerce({
            ...rest,
            footerRevNo: footerDefaults.footerRevNo,
            footerDateEffective: footerDefaults.footerDateEffective,
          }),
        },
      },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
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

    await this.dashboardSync.syncMicroReport(created.id);

    const flat = flattenReport(created);
    const response = await this.addCreatorName(flat);

    this.reportsGateway.notifyReportCreated(response);

    return response;
  }

  // async get(id: string) {
  //   const r = await this.prisma.report.findUnique({
  //     where: { id },
  //     include: {
  //       microMix: true,
  //       microMixWater: true,
  //       sterility: true,
  //       ape: true,
  //       apeValidationReport: true,
  //       apeReport: true,
  //       attachments: true,
  //       statusHistory: true,
  //     },
  //   });
  //   if (!r) throw new NotFoundException('Report not found');
  //   return flattenReport(r);
  // }

  async get(id: string) {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
        apeValidationReport: true,
        apeReport: true,
        attachments: true,
        statusHistory: true,
      },
    });

    if (!r) {
      throw new NotFoundException('Report not found');
    }

    const flat = flattenReport(r);

    return this.addCreatorName(flat);
  }

  async updateLabReportDraft(
    user: { userId: string; role: UserRole },
    id: string,
    current: any,
    patchIn: any,
  ) {
    if (!['MICRO', 'MC', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to update lab report');
    }

    const {
      reason: _reasonFromBody,
      eSignPassword: _pwdFromBody,
      expectedVersion,
      ...patch
    } = { ...patchIn };

    assertApeChildFieldPermissions(user.role, patch);

    if (
      !['ADMIN', 'SYSTEMADMIN'].includes(user.role) &&
      typeof expectedVersion !== 'number'
    ) {
      throw new BadRequestException('expectedVersion is required');
    }

    const { base, details } = splitPatch(this._coerce(patch));

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

    if (typeof expectedVersion === 'number' && baseRes.count === 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'This report was updated by someone else. Please reload and try again.',
        expectedVersion,
        currentVersion: current.version,
      });
    }

    await updateLabReportDetailsByType(
      this.prisma,
      current.reportType,
      id,
      details,
    );

    const updated = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
        apeValidationReport: true,
        apeReport: true,
      },
    });

    if (!updated) throw new NotFoundException('Report not found after update');

    const flat = flattenReport(updated);
    const response = await this.addCreatorName(flat);

    this.reportsGateway.notifyReportUpdate(response);

    return response;
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
        ape: true,
      },
    });
    if (!current) throw new NotFoundException('Report not found');

    if (current.reportType) {
      return this.updateLabReportDraft(user, id, current, patchIn);
    }

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

    // ---------------------------------------------------------
    // FIELD / DRAFT PERMISSIONS
    // ---------------------------------------------------------

    const fieldKeys = Object.keys(patch).filter((f) => f !== 'status');

    const isDraftLike =
      current.status === 'DRAFT' || current.status === 'UNDER_DRAFT_REVIEW';

    const clientMayEditDraft = user.role === 'CLIENT' && isDraftLike;

    /*
     * ---------------------------------------------------------
     * INTERNAL "CREATE FOR CLIENT" DRAFT
     * ---------------------------------------------------------
     *
     * When ADMIN / SYSTEMADMIN creates the form, createDraft()
     * already writes a FORM_NUMBER_ASSIGNED audit record with
     * the real internal role.
     *
     * Use that audit record to identify an internally-created
     * client submission instead of relying only on createdBy.
     */
    let internallyCreatedClientDraft = false;

    if (isDraftLike && (user.role === 'ADMIN' || user.role === 'SYSTEMADMIN')) {
      const creationAudit = await this.prisma.auditTrail.findFirst({
        where: {
          entityId: current.id,
          action: 'FORM_NUMBER_ASSIGNED',
          role: {
            in: ['ADMIN', 'SYSTEMADMIN'],
          },
        },
        select: {
          id: true,
          userId: true,
          role: true,
        },
      });

      internallyCreatedClientDraft = !!creationAudit;
    }

    /*
     * ADMIN / SYSTEMADMIN may act with CLIENT submission
     * permissions only for a draft originally created internally.
     */
    const internalCreatorMayActAsClient =
      (user.role === 'ADMIN' || user.role === 'SYSTEMADMIN') &&
      isDraftLike &&
      internallyCreatedClientDraft;

    /*
     * Preserve your existing SYSTEMADMIN behavior.
     */
    const systemAdminMayEditDraft = user.role === 'SYSTEMADMIN' && isDraftLike;

    /*
     * Permission role is ONLY for the workflow permission check.
     *
     * Audit records still use the real authenticated role:
     * ADMIN / SYSTEMADMIN.
     */
    const permissionRole: UserRole = internalCreatorMayActAsClient
      ? 'CLIENT'
      : user.role;

    /*
     * Internal create-for-client drafts must only accept
     * CLIENT submission fields.
     */
    if (internalCreatorMayActAsClient) {
      const bad = allowedForRole('CLIENT', fieldKeys);

      if (bad.length) {
        throw new ForbiddenException(
          `You cannot edit client submission fields: ${bad.join(', ')}`,
        );
      }
    } else if (!clientMayEditDraft && !systemAdminMayEditDraft) {
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

      if (!transition.canEdit.includes(permissionRole)) {
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

    // If status is being set to SUBMITTED_BY_CLIENT, set dateSent if not already set on either current or patch
    if (patchIn.status === 'SUBMITTED_BY_CLIENT') {
      const currentDetails = pickDetails(current);

      if (!currentDetails?.dateSent && !details.dateSent) {
        details.dateSent = new Date();
      }
    }

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
        if (!trans.canSet.includes(permissionRole)) {
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
      details.status = targetStatus;

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

      if (patchIn.status === 'LOCKED') {
        base.lockedAt = new Date();
      }

      base.status = patchIn.status;
      details.status = patchIn.status;

      /*
       * ---------------------------------------------------------
       * BILLING MILESTONE
       * ---------------------------------------------------------
       *
       * Must happen AFTER potential report-number assignment so
       * base.reportNumber can participate in the readiness check.
       */
      Object.assign(
        base,
        buildReportBillingMilestonePatch({
          current,
          nextStatus: patchIn.status,

          pendingReportNumber:
            base.reportNumber ?? current.reportNumber ?? null,
        }),
      );
    }

    // Commit Report, active details, and the dashboard workflow snapshot together.
    const updated = await this.prisma.$transaction(async (tx) => {
      const baseRes = await tx.report.updateMany({
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

      if (baseRes.count === 0) {
        if (typeof expectedVersion === 'number') {
          throw new ConflictException({
            code: 'CONFLICT',
            message:
              'This report was updated by someone else. Please reload and try again.',
            expectedVersion,
            currentVersion: current.version,
          });
        }

        throw new NotFoundException('Report not found');
      }

      if (Object.keys(details).length > 0) {
        await updateDetailsByType(tx, current.formType, id, details);
      }

      await this.syncDashboardRootInsideTransaction(tx, id);

      const result = await tx.report.findUnique({
        where: { id },
        include: {
          microMix: true,
          microMixWater: true,
          sterility: true,
          ape: true,
        },
      });

      if (!result) {
        throw new NotFoundException('Report not found after update');
      }

      return result;
    });

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

    // Keep the dashboard copy aligned with the root report before returning.
    await this.dashboardSync.syncMicroReportAndVerify(id);

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    if (patchIn.status && prevStatus !== String(patchIn.status)) {
      await this.syncWorkflowReminderSafe({
        reportId: updated.id,
        formType: updated.formType,
        formNumber: updated.formNumber,
        clientCode: updated.clientCode,

        newStatus: String(updated.status),

        requestKind: updated.workflowRequestKind,

        requestedByRole: updated.workflowRequestedByRole,
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
              : current.formType === 'APE'
                ? 'ape'
                : 'micro-mix';

      const clientCode = current.clientCode ?? null;
      const clientName = pickDetails(current)?.client ?? '-';

      try {
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
      } catch (error: any) {
        this.logger.error(
          `Report ${id} status changed from ${prevStatus} to ${String(
            patchIn.status,
          )}, but notification delivery failed: ${error?.message ?? error}`,
          error?.stack,
        );
      }
    }

    const flat = flattenReport(updated);
    return this.addCreatorName(flat);
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
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
      },
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
    const isCentralApprovalStatus =
      target === 'UNDER_CHANGE_UPDATE' || target === 'UNDER_CORRECTION_UPDATE';

    if (isCentralApprovalStatus) {
      const approvalRule = transitions[target];
      const approvalCanSet = approvalRule?.canSet as UserRole[] | undefined;

      if (!approvalCanSet?.includes(user.role)) {
        throw new ForbiddenException(
          `Only ADMIN, SYSTEMADMIN, or QA can approve ${target}`,
        );
      }
    }

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

    // Preserve the original requester and request type for approval routing.
    if (target === 'CHANGE_REQUESTED' || target === 'CORRECTION_REQUESTED') {
      patch.workflowReturnStatus = current.status;
      patch.workflowRequestKind =
        target === 'CHANGE_REQUESTED' ? 'CHANGE' : 'CORRECTION';
      patch.workflowRequestedByRole = user.role;
      patch.workflowRequestedAt = new Date();
    }

    // Clear centralized workflow metadata only when returning to the
    // original status after the requested update is completed.
    if (
      (current.status === 'UNDER_CHANGE_UPDATE' ||
        current.status === 'UNDER_CORRECTION_UPDATE') &&
      target === current.workflowReturnStatus
    ) {
      patch.workflowReturnStatus = null;
      patch.workflowRequestKind = null;
      patch.workflowRequestedByRole = null;
      patch.workflowRequestedAt = null;
    }

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

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id },
        data: {
          ...patch,
          updatedBy: user.userId,
          version: { increment: 1 },
        },
      });

      await updateDetailsByType(tx, current.formType, id, {
        status: target,
      });

      await this.syncDashboardRootInsideTransaction(tx, id);

      const result = await tx.report.findUnique({
        where: { id },
        include: {
          microMix: true,
          microMixWater: true,
          sterility: true,
          ape: true,
        },
      });

      if (!result) {
        throw new NotFoundException('Report not found after status update');
      }

      return result;
    });

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

    await this.dashboardSync.syncMicroReportAndVerify(id);

    // ✅ notify websocket
    this.reportsGateway.notifyStatusChange(id, target);

    if (prevStatus !== target) {
      await this.syncWorkflowReminderSafe({
        reportId: updated.id,
        formType: updated.formType,
        formNumber: updated.formNumber,
        clientCode: updated.clientCode,

        newStatus: String(updated.status),

        requestKind: updated.workflowRequestKind,

        requestedByRole: updated.workflowRequestedByRole,
      });
    }

    if (prevStatus !== target) {
      const slug =
        current.formType === 'MICRO_MIX'
          ? 'micro-mix'
          : current.formType === 'MICRO_MIX_WATER'
            ? 'micro-mix-water'
            : current.formType === 'STERILITY'
              ? 'sterility'
              : current.formType === 'APE'
                ? 'ape'
                : 'micro-mix';

      const clientName = pickDetails(current)?.client ?? '-';

      try {
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
      } catch (error: any) {
        this.logger.error(
          `Report ${id} status changed from ${String(
            prevStatus,
          )} to ${String(target)}, but notification delivery failed: ${
            error?.message ?? error
          }`,
          error?.stack,
        );
      }
    }

    const flat = flattenReport(updated);
    return this.addCreatorName(flat);
  }

  async findAll() {
    const rows = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
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
      items: {
        fieldKey: string;
        message: string;
        oldValue?: any;
        recipientSide?: CorrectionRecipientSide | null;
      }[];
      targetStatus?: ReportStatus;
      reason?: string;
      expectedVersion?: number;
      previousStatus?: ReportStatus;
      workflowReturnStatus?: ReportStatus;
      recipientSide?: CorrectionRecipientSide | null;
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
        ape: true,
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

    const requestRecipientSide = body.recipientSide ?? null;

    const toAdd = body.items.map((it) => ({
      id: randomUUID(),
      fieldKey: it.fieldKey,
      message: it.message,
      status: 'OPEN' as const,
      requestedByUserId: user.userId,
      requestedByRole: user.role,
      createdAt: nowIso,
      oldValue: it.oldValue ?? null,

      recipientSide: it.recipientSide ?? requestRecipientSide,

      resolvedAt: null as string | null,
      resolvedByUserId: null as string | null,
      resolvedByRole: null as UserRole | null,
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
          recipientSide: c.recipientSide ?? null,
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
        ape: true,
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
        ape: true,
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
      'MC',
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
      resolvedByRole: user.role,
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
        resolvedByRole: resolvedItem.resolvedByRole ?? null,
        resolutionNote: resolvedItem.resolutionNote ?? null,
      },
    });

    const allResolved = arr.every((c) => c.status === 'RESOLVED');

    if (
      allResolved &&
      report.workflowReturnStatus &&
      (report.status === 'UNDER_CHANGE_UPDATE' ||
        report.status === 'UNDER_CORRECTION_UPDATE' ||
        report.status === 'CHANGE_REQUESTED' ||
        report.status === 'CORRECTION_REQUESTED')
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.report.update({
          where: { id },
          data: {
            status: report.workflowReturnStatus ?? undefined,
            workflowReturnStatus: null,
            workflowRequestKind: null,
            workflowRequestedByRole: null,
            workflowRequestedAt: null,
            updatedBy: user.userId,
            version: { increment: 1 },
          },
        });

        await updateDetailsByType(tx, report.formType, id, {
          status: report.workflowReturnStatus!,
        });

        await this.syncDashboardRootInsideTransaction(tx, id);
      });
      try {
        await this.workflowReminders.resolveForSource('REPORT', report.id);
      } catch (error: any) {
        this.logger.error(
          `Report ${report.id} reminder cancellation failed after correction resolution: ${
            error?.message ?? error
          }`,
          error?.stack,
        );
      }

      await this.dashboardSync.syncMicroReportAndVerify(id);

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
