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
    'testedBy',
    'testedDate',

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
    'testedBy',
    'testedDate',

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
    canEdit: ['MICRO', 'MC', 'SYSTEMADMIN', 'ADMIN'],
  },
  UNDER_CLIENT_PRELIMINARY_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'PRELIMINARY_APPROVED'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },

  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'FINAL_APPROVED'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
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
    canEdit: ['FRONTDESK', 'SYSTEMADMIN'],
  },

  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: [
      'PRELIMINARY_TESTING_ON_HOLD',
      'CHANGE_REQUESTED',
      'CORRECTION_REQUESTED',
      'UNDER_QA_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },

  UNDER_QA_PRELIMINARY_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: [
      'CHANGE_REQUESTED',
      'CORRECTION_REQUESTED',
      'UNDER_CLIENT_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },

  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: [
      'FINAL_TESTING_ON_HOLD',
      'CHANGE_REQUESTED',
      'CORRECTION_REQUESTED',
      'UNDER_QA_FINAL_REVIEW',
    ],
    nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'SYSTEMADMIN'],
  },
  FINAL_TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: [
      'CHANGE_REQUESTED',
      'CORRECTION_REQUESTED',
      'UNDER_FINAL_TESTING_REVIEW',
    ],
    nextEditableBy: ['CLIENT', 'MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },

  UNDER_QA_FINAL_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: [
      'CHANGE_REQUESTED',
      'CORRECTION_REQUESTED',
      'ADMIN_REJECTED',
      'UNDER_CLIENT_FINAL_REVIEW',
    ],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },

  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
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
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_CHANGE_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CHANGE_UPDATE: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },

  CORRECTION_REQUESTED: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_CORRECTION_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CORRECTION_UPDATE: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },
} as const satisfies Partial<Record<ReportStatus, Transition>>;

// const STATUS_TRANSITIONS = {
//   DRAFT: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_DRAFT_REVIEW', 'SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_DRAFT_REVIEW: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['DRAFT', 'SUBMITTED_BY_CLIENT'], // ✅
//     nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   SUBMITTED_BY_CLIENT: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_CLIENT_PRELIMINARY_REVIEW: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['CLIENT_NEEDS_PRELIMINARY_CORRECTION', 'PRELIMINARY_APPROVED'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_CLIENT_PRELIMINARY_CORRECTION: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_CLIENT_FINAL_CORRECTION: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_CLIENT_FINAL_REVIEW: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['FINAL_APPROVED', 'CLIENT_NEEDS_FINAL_CORRECTION'],
//     nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   PRELIMINARY_RESUBMISSION_BY_CLIENT: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   CLIENT_NEEDS_FINAL_CORRECTION: {
//     canSet: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   FINAL_RESUBMISSION_BY_CLIENT: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   PRELIMINARY_APPROVED: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   RECEIVED_BY_FRONTDESK: {
//     canSet: ['FRONTDESK', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_FINAL_REVIEW', 'FRONTDESK_ON_HOLD'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: ["FRONTDESK", "SYSTEMADMIN"],
//   },
//   FRONTDESK_ON_HOLD: {
//     canSet: ['FRONTDESK', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['FRONTDESK', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   FRONTDESK_NEEDS_CORRECTION: {
//     canSet: ['FRONTDESK', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     next: ['SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_PRELIMINARY_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: [
//       'PRELIMINARY_TESTING_ON_HOLD',
//       'PRELIMINARY_TESTING_NEEDS_CORRECTION',
//       'UNDER_QA_PRELIMINARY_REVIEW',
//     ],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   PRELIMINARY_TESTING_ON_HOLD: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: ["MICRO", "MC", "SYSTEMADMIN", "ADMIN", "QA"],
//   },
//   PRELIMINARY_TESTING_NEEDS_CORRECTION: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_PRELIMINARY_CORRECTION'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: [],
//   },
//   UNDER_QA_PRELIMINARY_REVIEW: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: [
//       'QA_NEEDS_PRELIMINARY_CORRECTION',
//       'UNDER_CLIENT_PRELIMINARY_REVIEW',
//     ],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: ['QA', 'SYSTEMADMIN'],
//   },
//   QA_NEEDS_PRELIMINARY_CORRECTION: {
//     canSet: ['QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_PRELIMINARY_REVIEW'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   PRELIMINARY_RESUBMISSION_BY_TESTING: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_PRELIMINARY_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_FINAL_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: [
//       'FINAL_TESTING_ON_HOLD',
//       'FINAL_TESTING_NEEDS_CORRECTION',
//       'UNDER_QA_FINAL_REVIEW',
//     ],
//     nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC'],
//   },
//   FINAL_TESTING_ON_HOLD: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['FINAL_TESTING_NEEDS_CORRECTION', 'UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['CLIENT', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit:  ["MICRO", "MC", "SYSTEMADMIN", "ADMIN", "QA"],
//   },
//   FINAL_TESTING_NEEDS_CORRECTION: {
//     canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_FINAL_CORRECTION'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_RESUBMISSION_QA_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   FINAL_RESUBMISSION_BY_TESTING: {
//     canSet: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_FINAL_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['QA', 'SYSTEMADMIN'],
//   },
//   UNDER_QA_FINAL_REVIEW: {
//     canSet: ['MICRO', 'MC', 'QA', 'SYSTEMADMIN'],
//     next: ['QA_NEEDS_FINAL_CORRECTION', 'UNDER_ADMIN_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['QA', 'SYSTEMADMIN'],
//   },
//   QA_NEEDS_FINAL_CORRECTION: {
//     canSet: ['QA', 'MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_FINAL_RESUBMISSION_QA_REVIEW: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'QA', 'SYSTEMADMIN'],
//   },

//   UNDER_ADMIN_REVIEW: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: [
//       'ADMIN_NEEDS_CORRECTION',
//       'ADMIN_REJECTED',
//       'UNDER_CLIENT_FINAL_REVIEW',
//     ],
//     nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   ADMIN_NEEDS_CORRECTION: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_FINAL_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   ADMIN_REJECTED: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_FINAL_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   FINAL_APPROVED: {
//     canSet: [],
//     next: [],
//     nextEditableBy: [],
//     canEdit: [],
//   },
//   LOCKED: {
//     canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [],
//     canEdit: [],
//   },
//   VOID: {
//     canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN', 'QA'], // nobody can set FROM VOID (no transitions out)
//     next: [],
//     nextEditableBy: ['SYSTEMADMIN'],
//     canEdit: [],
//   },

//   CHANGE_REQUESTED: {
//     canSet: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     next: ['UNDER_CHANGE_UPDATE'],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [],
//   },

//   UNDER_CHANGE_UPDATE: {
//     canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//   },

//   CORRECTION_REQUESTED: {
//     canSet: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     next: ['UNDER_CORRECTION_UPDATE'],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [],
//   },

//   UNDER_CORRECTION_UPDATE: {
//     canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//   },
// } as const satisfies Partial<Record<ReportStatus, Transition>>;

// 🔁 Keep this in sync with backend

export const STERILITY_STATUS_TRANSITIONS = {
  DRAFT: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_DRAFT_REVIEW', 'SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
    canEdit: ['CLIENT', 'SYSTEMADMIN'],
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
    next: ["CHANGE_REQUESTED","CORRECTION_REQUESTED", 'APPROVED'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
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
    nextEditableBy: ['FRONTDESK'],
    canEdit: [],
  },

  UNDER_TESTING_REVIEW: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['TESTING_ON_HOLD', 'CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'UNDER_QA_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
    canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  TESTING_ON_HOLD: {
    canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },

  UNDER_QA_REVIEW: {
    canSet: ['QA', 'SYSTEMADMIN'],
    next: ['CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: ['QA', 'SYSTEMADMIN'],
  },


  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['CHANGE_REQUESTED', 'CORRECTION_REQUESTED', 'ADMIN_REJECTED', 'UNDER_CLIENT_REVIEW'],
    nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN', 'SYSTEMADMIN'],
  },

  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA', 'SYSTEMADMIN'],
    canEdit: [],
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
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_CHANGE_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CHANGE_UPDATE: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },

  CORRECTION_REQUESTED: {
    canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_CORRECTION_UPDATE'],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [],
  },

  UNDER_CORRECTION_UPDATE: {
    canSet: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    next: [],
    nextEditableBy: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
    canEdit: [
      'CLIENT',
      'FRONTDESK',
      'MICRO',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
    ],
  },
} as const satisfies Partial<Record<ReportStatus, Transition>>;

// const STERILITY_STATUS_TRANSITIONS = {
//   DRAFT: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_DRAFT_REVIEW', 'SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT', 'FRONTDESK', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_DRAFT_REVIEW: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['DRAFT', 'SUBMITTED_BY_CLIENT'], // ✅
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT', 'SYSTEMADMIN'],
//   },
//   SUBMITTED_BY_CLIENT: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_CLIENT_REVIEW: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['CLIENT_NEEDS_CORRECTION', 'APPROVED'],
//     nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   CLIENT_NEEDS_CORRECTION: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_CLIENT_CORRECTION: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: ['CLIENT', 'SYSTEMADMIN'],
//   },

//   RESUBMISSION_BY_CLIENT: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'QA', 'MICRO', 'MC'],
//     canEdit: [],
//   },
//   RECEIVED_BY_FRONTDESK: {
//     canSet: ['FRONTDESK', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_REVIEW', 'FRONTDESK_ON_HOLD'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   FRONTDESK_ON_HOLD: {
//     canSet: ['FRONTDESK', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['FRONTDESK', 'SYSTEMADMIN'],
//     canEdit: ['FRONTDESK', 'SYSTEMADMIN'],
//   },
//   FRONTDESK_NEEDS_CORRECTION: {
//     canSet: ['FRONTDESK', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     next: ['SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'UNDER_QA_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   TESTING_ON_HOLD: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   TESTING_NEEDS_CORRECTION: {
//     canSet: ['CLIENT', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_CORRECTION'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_RESUBMISSION_TESTING_REVIEW: {
//     canSet: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     next: ['UNDER_RESUBMISSION_QA_REVIEW', 'QA_NEEDS_CORRECTION'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: ['MICRO', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
//   },
//   RESUBMISSION_BY_TESTING: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: ['UNDER_CLIENT_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_QA_REVIEW: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: ['QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['QA', 'SYSTEMADMIN'],
//   },
//   QA_NEEDS_CORRECTION: {
//     canSet: ['QA', 'SYSTEMADMIN', 'MC', 'MICRO'],
//     next: ['UNDER_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'MC', 'SYSTEMADMIN'],
//     canEdit: [],
//   },

//   UNDER_ADMIN_REVIEW: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'UNDER_CLIENT_REVIEW'],
//     nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   ADMIN_NEEDS_CORRECTION: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   ADMIN_REJECTED: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_REVIEW'],
//     nextEditableBy: ['QA', 'SYSTEMADMIN'],
//     canEdit: [],
//   },
//   UNDER_RESUBMISSION_QA_REVIEW: {
//     canSet: ['QA', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: ['QA', 'SYSTEMADMIN'],
//   },
//   UNDER_RESUBMISSION_ADMIN_REVIEW: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN', 'SYSTEMADMIN'],
//   },
//   APPROVED: {
//     canSet: [],
//     next: [],
//     nextEditableBy: [],
//     canEdit: [],
//   },
//   LOCKED: {
//     canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [],
//     canEdit: [],
//   },
//   VOID: {
//     canSet: ['CLIENT', 'ADMIN', 'SYSTEMADMIN', 'QA'], // nobody can set FROM VOID (no transitions out)
//     next: [],
//     nextEditableBy: ['SYSTEMADMIN'],
//     canEdit: [],
//   },

//   CHANGE_REQUESTED: {
//     canSet: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     next: ['UNDER_CHANGE_UPDATE'],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [],
//   },

//   UNDER_CHANGE_UPDATE: {
//     canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//   },

//   CORRECTION_REQUESTED: {
//     canSet: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     next: ['UNDER_CORRECTION_UPDATE'],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [],
//   },

//   UNDER_CORRECTION_UPDATE: {
//     canSet: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     next: [],
//     nextEditableBy: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//     canEdit: [
//       'CLIENT',
//       'FRONTDESK',
//       'MICRO',
//       'CHEMISTRY',
//       'MC',
//       'QA',
//       'ADMIN',
//       'SYSTEMADMIN',
//     ],
//   },
// } as const satisfies Partial<Record<ReportStatus, Transition>>;

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


const APE_CHILD_EDIT_FIELDS: Partial<
  Record<UserRole, readonly string[]>
> = {
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

  const denied = Object.keys(patch).filter(
    (field) => !allowed.includes(field),
  );

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
  constructor(
    private readonly reportsGateway: ReportsGateway,
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly attachments: AttachmentsService,
    private readonly reportNotifications: ReportNotificationsService,
    private readonly dashboardSync: DashboardReportSyncService,
  ) {}

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
    this.reportsGateway.notifyReportCreated(flat);
    return flat;
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
        ape: true,
        apeValidationReport: true,
        apeReport: true,
        attachments: true,
        statusHistory: true,
      },
    });
    if (!r) throw new NotFoundException('Report not found');
    return flattenReport(r);
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
      reason: reasonFromBody,
      eSignPassword: eSignPasswordFromBody,
      signatureType: signatureTypeFromBody,
      expectedVersion,
      ...patch
    } = { ...patchIn };

    const signatureType = signatureTypeFromBody
      ? String(signatureTypeFromBody).trim().toUpperCase()
      : null;

    let signatureAudit:
      | {
          parentStatus: ReportStatus;
          targetStatus: ReportStatus;
          signatureType: 'TESTED' | 'REVIEWED';
          reason: string;
        }
      | null = null;

    if (signatureType) {
      if (signatureType !== 'TESTED' && signatureType !== 'REVIEWED') {
        throw new BadRequestException(
          'signatureType must be TESTED or REVIEWED',
        );
      }

      if (!current.parentReportId) {
        throw new BadRequestException(
          'APE child report is missing parentReportId',
        );
      }

      if (!reasonFromBody || !String(reasonFromBody).trim()) {
        throw new BadRequestException(
          'Reason is required for electronic signature',
        );
      }

      if (!eSignPasswordFromBody) {
        throw new BadRequestException(
          'Electronic signature (password) is required',
        );
      }

      const parent = await this.prisma.report.findUnique({
        where: { id: current.parentReportId },
        select: {
          id: true,
          status: true,
          formType: true,
          formNumber: true,
          reportNumber: true,
        },
      });

      if (!parent || parent.formType !== FormType.APE) {
        throw new BadRequestException('Parent APE report not found');
      }

      const expectedTargetStatus =
        signatureType === 'TESTED'
          ? ReportStatus.UNDER_QA_REVIEW
          : ReportStatus.UNDER_CLIENT_REVIEW;

      const expectedParentStatus =
        signatureType === 'TESTED'
          ? ReportStatus.UNDER_TESTING_REVIEW
          : ReportStatus.UNDER_ADMIN_REVIEW;

      if (parent.status !== expectedParentStatus) {
        throw new ConflictException({
          code: 'APE_SIGNATURE_STATUS_CONFLICT',
          message:
            `Cannot apply ${signatureType} signature while parent APE status is ` +
            `${parent.status}`,
          currentStatus: parent.status,
          expectedStatus: expectedParentStatus,
        });
      }

      const allowedRoles: UserRole[] =
        signatureType === 'TESTED'
          ? ['MICRO', 'MC', 'SYSTEMADMIN']
          : ['ADMIN', 'SYSTEMADMIN'];

      if (!allowedRoles.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot apply ${signatureType} APE signature`,
        );
      }

      try {
        await this.esign.verifyPassword(
          user.userId,
          String(eSignPasswordFromBody),
        );
      } catch {
        await this.logESignAudit({
          reportId: current.id,
          clientCode: current.clientCode ?? null,
          formType: current.formType,
          formNumber: current.formNumber,
          reportNumber: current.reportNumber ?? null,
          actorUserId: user.userId,
          actorRole: user.role,
          action: 'ESIGN_REJECTED',
          fromStatus: parent.status,
          toStatus: expectedTargetStatus,
          reason: String(reasonFromBody).trim(),
          signatureType,
          statusChanged: false,
          approvalTarget: expectedTargetStatus,
          details:
            `Electronic signature rejected for ${current.reportType} ` +
            `${signatureType} signature`,
        });

        throw new ForbiddenException('Electronic signature failed');
      }

      const actor = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          name: true,
          userId: true,
          email: true,
        },
      });

      const signer =
        actor?.name?.trim() ||
        actor?.userId?.trim() ||
        actor?.email?.trim() ||
        'Unknown';

      if (signatureType === 'TESTED') {
        patch.testedBy = signer;
        patch.testedDate = new Date();
      } else {
        patch.reviewedBy = signer;
        patch.reviewedDate = new Date();
      }

      signatureAudit = {
        parentStatus: parent.status,
        targetStatus: expectedTargetStatus,
        signatureType,
        reason: String(reasonFromBody).trim(),
      };
    }

    assertApeChildFieldPermissions(user.role, patch);

    if (
      !['ADMIN', 'SYSTEMADMIN'].includes(user.role) &&
      typeof expectedVersion !== 'number'
    ) {
      throw new BadRequestException('expectedVersion is required');
    }

    const { base, details } = splitPatch(this._coerce(patch));

    // A child report's own status is used only as a secure marker that this
    // specific report completed the verified electronic-signature step.
    // It does not change the parent APE workflow status.
    if (signatureAudit) {
      base.status = signatureAudit.targetStatus;
    }

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

    if (signatureAudit) {
      await this.logESignAudit({
        reportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: current.reportNumber ?? null,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'ESIGN_VERIFIED',
        fromStatus: signatureAudit.parentStatus,
        toStatus: signatureAudit.targetStatus,
        reason: signatureAudit.reason,
        signatureType: signatureAudit.signatureType,
        statusChanged: false,
        approvalTarget: signatureAudit.targetStatus,
        details:
          `Electronic signature verified for ${current.reportType} ` +
          `${signatureAudit.signatureType} signature. Parent status was not ` +
          `changed by this child-signature operation.`,
      });
    }

    const flat = flattenReport(updated);
    this.reportsGateway.notifyReportUpdate(flat);

    return flat;
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

    // A standalone field signature is the PATCH made by the Sign button.
    // It saves Tested By / Reviewed By without changing workflow status.
    const hasTestedSignaturePatch =
      !patchIn.status && ('testedBy' in patch || 'testedDate' in patch);
    const hasReviewedSignaturePatch =
      !patchIn.status && ('reviewedBy' in patch || 'reviewedDate' in patch);

    let standaloneSignatureAudit:
      | {
          signatureType: 'TESTED_BY' | 'REVIEWED_BY';
          reason: string;
          approvalTarget: ReportStatus;
        }
      | null = null;

    if (hasTestedSignaturePatch || hasReviewedSignaturePatch) {
      if (hasTestedSignaturePatch && hasReviewedSignaturePatch) {
        throw new BadRequestException(
          'Only one electronic signature may be applied per request',
        );
      }

      const signatureType: 'TESTED_BY' | 'REVIEWED_BY' =
        hasTestedSignaturePatch ? 'TESTED_BY' : 'REVIEWED_BY';

      const reason = String(
        (ctx as any)?.reason ?? _reasonFromBody ?? '',
      ).trim();

      const password =
        _pwdFromBody ?? (ctx as any)?.eSignPassword ?? null;

      if (!reason) {
        throw new BadRequestException(
          'Reason is required for electronic signature',
        );
      }

      if (!password) {
        throw new BadRequestException(
          'Electronic signature (password) is required',
        );
      }

      const isMicroFinalForm =
        current.formType === FormType.MICRO_MIX ||
        current.formType === FormType.MICRO_MIX_WATER;

      const expectedStatus =
        signatureType === 'TESTED_BY'
          ? isMicroFinalForm
            ? ReportStatus.UNDER_FINAL_TESTING_REVIEW
            : ReportStatus.UNDER_TESTING_REVIEW
          : ReportStatus.UNDER_ADMIN_REVIEW;

      const approvalTarget =
        signatureType === 'TESTED_BY'
          ? isMicroFinalForm
            ? ReportStatus.UNDER_QA_FINAL_REVIEW
            : ReportStatus.UNDER_QA_REVIEW
          : isMicroFinalForm
            ? ReportStatus.UNDER_CLIENT_FINAL_REVIEW
            : ReportStatus.UNDER_CLIENT_REVIEW;

      const allowedRoles: UserRole[] =
        signatureType === 'TESTED_BY'
          ? [UserRole.MICRO, UserRole.MC, UserRole.SYSTEMADMIN]
          : [UserRole.ADMIN, UserRole.SYSTEMADMIN];

      if (current.status !== expectedStatus) {
        throw new ConflictException({
          code: 'ESIGN_STATUS_CONFLICT',
          message:
            `Cannot apply ${signatureType} signature while report status is ` +
            `${current.status}. Required status is ${expectedStatus}.`,
          currentStatus: current.status,
          expectedStatus,
        });
      }

      if (!allowedRoles.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot apply ${signatureType} signature`,
        );
      }

      try {
        await this.esign.verifyPassword(user.userId, String(password));
      } catch {
        await this.logESignAudit({
          reportId: current.id,
          clientCode: current.clientCode ?? null,
          formType: current.formType,
          formNumber: current.formNumber,
          reportNumber: current.reportNumber ?? null,
          actorUserId: user.userId,
          actorRole: user.role,
          action: 'ESIGN_REJECTED',
          fromStatus: current.status,
          toStatus: current.status,
          reason,
          signatureType,
          statusChanged: false,
          approvalTarget,
          details:
            `${signatureType === 'TESTED_BY' ? 'Tested By' : 'Reviewed By'} ` +
            `electronic signature rejected. Report status was not changed.`,
        });

        throw new ForbiddenException('Electronic signature failed');
      }

      const actor = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          name: true,
          userId: true,
          email: true,
        },
      });

      const signerName =
        actor?.name?.trim() ||
        actor?.userId?.trim() ||
        actor?.email?.trim() ||
        'Unknown';

      if (signatureType === 'TESTED_BY') {
        patch.testedBy = signerName;
        patch.testedDate = new Date();
      } else {
        patch.reviewedBy = signerName;
        patch.reviewedDate = new Date();
      }

      standaloneSignatureAudit = {
        signatureType,
        reason,
        approvalTarget,
      };
    }

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
      } else if (isCentralRequestStatus) {
        // A request must be authorized from the report's CURRENT workflow
        // state. For example, CLIENT may request a correction while the APE
        // parent is UNDER_CLIENT_REVIEW.
        if (!trans.canSet.includes(user.role)) {
          throw new ForbiddenException(
            `Role ${user.role} cannot request a correction/change from ${current.status}`,
          );
        }

        if (!trans.next.includes(targetStatus)) {
          throw new BadRequestException(
            `Invalid centralized request: ${current.status} → ${targetStatus}`,
          );
        }
      } else if (isCentralUpdateStatus) {
        // Entering the centralized update stage is controlled by the target
        // status because several roles may be responsible for fixing fields.
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
        patchIn.status === 'UNDER_QA_FINAL_REVIEW' ||
        patchIn.status === 'UNDER_QA_REVIEW' ||
        patchIn.status === 'UNDER_CLIENT_REVIEW' ||
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
        try {
          await this.esign.verifyPassword(user.userId, String(password));
        } catch {
          await this.logESignAudit({
            reportId: current.id,
            clientCode: current.clientCode ?? null,

            formType: current.formType,
            formNumber: current.formNumber,
            reportNumber: current.reportNumber ?? null,

            actorUserId: user.userId,
            actorRole: user.role,

            action: 'ESIGN_REJECTED',

            fromStatus: current.status,
            toStatus: patchIn.status,

            reason: reasonFromCtxOrBody,

            details:
              `Electronic signature rejected ` +
              `for ${current.status} → ${patchIn.status}`,
          });

          throw new ForbiddenException('Electronic signature failed');
        }
      }

      if (
        current.status === 'UNDER_FINAL_TESTING_REVIEW' &&
        patchIn.status === 'UNDER_QA_FINAL_REVIEW' &&
        (user.role === 'MICRO' || user.role === 'MC')
      ) {
        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: { name: true, email: true, userId: true },
        });

        details.testedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';

        details.testedDate = new Date();
      }

      if (
        current.status === 'UNDER_ADMIN_REVIEW' &&
        patchIn.status === 'UNDER_CLIENT_FINAL_REVIEW' &&
        user.role === 'ADMIN'
      ) {
        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: { name: true, email: true, userId: true },
        });

        details.reviewedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';

        details.reviewedDate = new Date();
      }

      if (
        current.status === 'UNDER_TESTING_REVIEW' &&
        patchIn.status === 'UNDER_QA_REVIEW' &&
        (user.role === 'MICRO' || user.role === 'MC')
      ) {
        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: { name: true, email: true, userId: true },
        });

        details.testedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';

        details.testedDate = new Date();
      }

      if (
        current.status === 'UNDER_ADMIN_REVIEW' &&
        patchIn.status === 'UNDER_CLIENT_REVIEW' &&
        user.role === 'ADMIN'
      ) {
        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: { name: true, email: true, userId: true },
        });

        details.reviewedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';

        details.reviewedDate = new Date();
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
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
      },
    });
    if (!updated) throw new NotFoundException('Report not found after update');

    if (standaloneSignatureAudit) {
      await this.logESignAudit({
        reportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
        actorUserId: user.userId,
        actorRole: user.role,
        action: 'ESIGN_VERIFIED',
        fromStatus: current.status,
        toStatus: current.status,
        reason: standaloneSignatureAudit.reason,
        signatureType: standaloneSignatureAudit.signatureType,
        statusChanged: false,
        approvalTarget: standaloneSignatureAudit.approvalTarget,
        details:
          `${standaloneSignatureAudit.signatureType === 'TESTED_BY' ? 'Tested By' : 'Reviewed By'} ` +
          `electronic signature verified and recorded. Report status was not changed.`,
      });
    }

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

    const currentDetailsBeforeUpdate = pickDetails(current);
    const statusTarget = patchIn.status ? String(patchIn.status) : null;

    const isFieldSignatureApprovalTransition =
      !!statusTarget &&
      (
        ((statusTarget === 'UNDER_QA_FINAL_REVIEW' ||
          statusTarget === 'UNDER_QA_REVIEW') &&
          ((current.formType === FormType.APE) ||
            (!!currentDetailsBeforeUpdate?.testedBy &&
              !!currentDetailsBeforeUpdate?.testedDate))) ||
        ((statusTarget === 'UNDER_CLIENT_FINAL_REVIEW' ||
          statusTarget === 'UNDER_CLIENT_REVIEW') &&
          ((current.formType === FormType.APE) ||
            (!!currentDetailsBeforeUpdate?.reviewedBy &&
              !!currentDetailsBeforeUpdate?.reviewedDate)))
      );

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    if (patchIn.status && prevStatus !== String(patchIn.status)) {
      const ctx = getRequestContext() || {};

      if (
        patchIn.status &&
        prevStatus !== String(patchIn.status) &&
        !isFieldSignatureApprovalTransition &&
        (patchIn.status === 'UNDER_CLIENT_FINAL_REVIEW' ||
          patchIn.status === 'UNDER_QA_FINAL_REVIEW' ||
          patchIn.status === 'UNDER_QA_REVIEW' ||
          patchIn.status === 'UNDER_CLIENT_REVIEW' ||
          patchIn.status === 'LOCKED' ||
          patchIn.status === 'VOID')
      ) {
        await this.logESignAudit({
          reportId: current.id,
          clientCode: current.clientCode ?? null,
          formType: current.formType,
          formNumber: current.formNumber,
          reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
          actorUserId: user.userId,
          actorRole: user.role,
          action: 'ESIGN_VERIFIED',
          fromStatus: current.status,
          toStatus: patchIn.status,
          reason: reasonFromCtxOrBody,
          signatureType: 'STATUS',
          statusChanged: true,
          approvalTarget: patchIn.status,
          details: `Electronic signature verified for ${current.status} → ${patchIn.status}`,
        });
      }
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
              : current.formType === 'APE'
                ? 'ape'
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

    await this.dashboardSync.syncMicroReport(id);

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

  private async logESignAudit(args: {
    reportId: string;
    clientCode: string | null;
    formType: FormType;
    formNumber: string;
    reportNumber: string | null;

    actorUserId: string;
    actorRole: UserRole;

    action: 'ESIGN_VERIFIED' | 'ESIGN_REJECTED';

    fromStatus?: ReportStatus | null;
    toStatus?: ReportStatus | null;

    reason?: string | null;

    signatureType?: string | null;
    statusChanged?: boolean;
    approvalTarget?: ReportStatus | null;

    details: string;
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

        changes: {
          fromStatus: args.fromStatus ?? null,
          toStatus: args.toStatus ?? null,
          reason: args.reason ?? null,
          signatureType: args.signatureType ?? null,
          statusChanged: args.statusChanged ?? null,
          approvalTarget: args.approvalTarget ?? null,
          signedAt: new Date().toISOString(),
        },

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
    // const skipESign = target === 'UNDER_FINAL_TESTING_REVIEW';
    // if (!skipESign) {
    //   if (!eSignPassword) {
    //     throw new BadRequestException(
    //       'Electronic Signature (password) is required for status changes',
    //     );
    //   }
    //   await this.esign.verifyPassword(user.userId, String(eSignPassword));
    // }

    const skipESignStatuses: ReportStatus[] = ['UNDER_FINAL_TESTING_REVIEW'];

    const skipESign = skipESignStatuses.includes(target);

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
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
      },
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

    await this.dashboardSync.syncMicroReport(id);

    return flattenReport(updated);
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
        ape: true,
        apeValidationReport: true,
        apeReport: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const mayRequest: UserRole[] = [
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'ADMIN',
      'SYSTEMADMIN',
      'CLIENT',
    ];

    if (!mayRequest.includes(user.role)) {
      throw new ForbiddenException('Not allowed');
    }

    const isApeChild =
      report.reportType === ReportType.APE_VALIDATION_REPORT ||
      report.reportType === ReportType.APE_REPORT;

    if (
      isApeChild &&
      typeof body.expectedVersion === 'number' &&
      report.version !== body.expectedVersion
    ) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'This APE child report was updated by someone else. Please reload and try again.',
        expectedVersion: body.expectedVersion,
        currentVersion: report.version,
      });
    }

    const details = pickDetails(report);

    if (!details) {
      throw new BadRequestException('Details row missing for this report');
    }

    const nowIso = new Date().toISOString();
    const existing = this._getCorrectionsArray(details);

    // A previous two-step request may already have saved the correction
    // items before the parent status update failed. Avoid creating duplicate
    // open corrections when the user clicks Send Corrections again.
    const uniqueItems = body.items.filter((item) => {
      const fieldKey = String(item.fieldKey || '').trim();
      const message = String(item.message || '').trim();

      return !existing.some(
        (correction) =>
          correction.status === 'OPEN' &&
          String(correction.fieldKey || '').trim() === fieldKey &&
          String(correction.message || '').trim() === message,
      );
    });

    const toAdd = uniqueItems.map((item) => ({
      id: randomUUID(),
      fieldKey: item.fieldKey,
      message: item.message,
      status: 'OPEN' as const,
      requestedByUserId: user.userId,
      requestedByRole: user.role,
      createdAt: nowIso,
      oldValue: item.oldValue ?? null,
      resolvedAt: null as string | null,
      resolvedByUserId: null as string | null,
      resolvedByRole: null as UserRole | null,
      resolutionNote: null as string | null,
    }));

    const nextCorrections = [...existing, ...toAdd];

    const correctionWrite = isApeChild
      ? updateLabReportDetailsByType(
          this.prisma,
          report.reportType,
          report.id,
          { corrections: nextCorrections },
        )
      : updateDetailsByType(this.prisma, report.formType, report.id, {
          corrections: nextCorrections,
        });

    if (!correctionWrite) {
      throw new BadRequestException(
        'Unsupported report type for corrections',
      );
    }

    await correctionWrite;

    await this.logCorrectionAudit({
      reportId: report.id,
      clientCode: report.clientCode ?? null,
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber ?? null,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'CORRECTION_CREATED',
      details:
        toAdd.length > 0
          ? `Created ${toAdd.length} correction item(s)`
          : 'Correction request retried; existing open correction items reused',
      changes: {
        reportType: report.reportType ?? null,
        targetStatus: body.targetStatus ?? null,
        reason: body.reason ?? null,
        items: toAdd.map((correction) => ({
          id: correction.id,
          fieldKey: correction.fieldKey,
          message: correction.message,
          oldValue: correction.oldValue ?? null,
          requestedByRole: correction.requestedByRole,
          createdAt: correction.createdAt,
        })),
      },
    });

    if (body.targetStatus) {
      if (isApeChild) {
        if (!report.parentReportId) {
          throw new BadRequestException(
            'APE child report is missing parentReportId',
          );
        }

        const workflowReturnStatus =
          body.workflowReturnStatus ?? body.previousStatus ?? null;

        // Corrections belong to the selected child report, but the APE
        // workflow status belongs to the parent APE form. The frontend changes
        // the parent status immediately after this request.
        await this.prisma.report.update({
          where: { id: report.parentReportId },
          data: {
            ...(workflowReturnStatus
              ? { workflowReturnStatus }
              : {}),
            workflowRequestKind:
              body.targetStatus === ReportStatus.CHANGE_REQUESTED
                ? 'CHANGE'
                : 'CORRECTION',
            workflowRequestedByRole: user.role,
            workflowRequestedAt: new Date(),
            updatedBy: user.userId,
          },
        });
      } else {
        await this.update(user, id, {
          status: body.targetStatus,
          reason: body.reason || 'Corrections requested',
          expectedVersion: body.expectedVersion,
          workflowReturnStatus:
            body.workflowReturnStatus ?? body.previousStatus,
        });
      }
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
        apeValidationReport: true,
        apeReport: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const details = pickDetails(report);

    if (!details) {
      throw new BadRequestException('Details row missing for this report');
    }

    return this._getCorrectionsArray(details);
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
        apeValidationReport: true,
        apeReport: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const details = pickDetails(report);

    if (!details) {
      throw new BadRequestException('Details row missing for this report');
    }

    const corrections = this._getCorrectionsArray(details);
    const correctionIndex = corrections.findIndex(
      (correction) => correction.id === cid,
    );

    if (correctionIndex < 0) {
      throw new NotFoundException('Correction not found');
    }

    const allowedResolvers: UserRole[] = [
      'CLIENT',
      'MICRO',
      'MC',
      'FRONTDESK',
      'ADMIN',
      'QA',
      'SYSTEMADMIN',
    ];

    if (!allowedResolvers.includes(user.role)) {
      throw new ForbiddenException('Not allowed to resolve');
    }

    corrections[correctionIndex] = {
      ...corrections[correctionIndex],
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: user.userId,
      resolvedByRole: user.role,
      resolutionNote: body?.resolutionNote ?? null,
    };

    const isApeChild =
      report.reportType === ReportType.APE_VALIDATION_REPORT ||
      report.reportType === ReportType.APE_REPORT;

    const correctionWrite = isApeChild
      ? updateLabReportDetailsByType(
          this.prisma,
          report.reportType,
          report.id,
          { corrections },
        )
      : updateDetailsByType(this.prisma, report.formType, report.id, {
          corrections,
        });

    if (!correctionWrite) {
      throw new BadRequestException(
        'Unsupported report type for corrections',
      );
    }

    await correctionWrite;

    const resolvedItem = corrections[correctionIndex];

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
        reportType: report.reportType ?? null,
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

    const correctionWorkflowStatuses: ReportStatus[] = [
      ReportStatus.UNDER_CHANGE_UPDATE,
      ReportStatus.UNDER_CORRECTION_UPDATE,
      ReportStatus.CHANGE_REQUESTED,
      ReportStatus.CORRECTION_REQUESTED,
    ];

    if (isApeChild) {
      if (!report.parentReportId) {
        throw new BadRequestException(
          'APE child report is missing parentReportId',
        );
      }

      const [parent, apeChildren] = await Promise.all([
        this.prisma.report.findUnique({
          where: { id: report.parentReportId },
          include: {
            ape: true,
          },
        }),
        this.prisma.report.findMany({
          where: {
            parentReportId: report.parentReportId,
            reportType: {
              in: [
                ReportType.APE_VALIDATION_REPORT,
                ReportType.APE_REPORT,
              ],
            },
          },
          include: {
            apeValidationReport: true,
            apeReport: true,
          },
        }),
      ]);

      if (!parent) {
        throw new NotFoundException('Parent APE report not found');
      }

      const allChildCorrections = apeChildren.flatMap((child) =>
        this._getCorrectionsArray(pickDetails(child)),
      );

      const hasOpenChildCorrections = allChildCorrections.some(
        (correction) => correction.status === 'OPEN',
      );

      const workflowReturnStatus = parent.workflowReturnStatus ?? null;

      if (
        !hasOpenChildCorrections &&
        workflowReturnStatus &&
        correctionWorkflowStatuses.includes(parent.status)
      ) {
        const parentStatusBeforeReturn = parent.status;

        const updatedParent = await this.prisma.report.update({
          where: { id: parent.id },
          data: {
            status: workflowReturnStatus,
            workflowReturnStatus: null,
            workflowRequestKind: null,
            workflowRequestedByRole: null,
            workflowRequestedAt: null,
            updatedBy: user.userId,
            version: { increment: 1 },
          },
          include: {
            ape: true,
          },
        });

        await this.dashboardSync.syncMicroReport(parent.id);

        await this.logCorrectionAudit({
          reportId: parent.id,
          clientCode: parent.clientCode ?? null,
          formType: parent.formType,
          formNumber: parent.formNumber,
          reportNumber: parent.reportNumber ?? null,
          actorUserId: user.userId,
          actorRole: user.role,
          action: 'CORRECTION_RESOLVED_ALL',
          details: 'All APE child-report correction items resolved',
          changes: {
            returnedFromStatus: parentStatusBeforeReturn,
            returnedToStatus: workflowReturnStatus,
            totalCorrections: allChildCorrections.length,
          },
        });

        await this.logStatusChange({
          reportId: parent.id,
          clientCode: parent.clientCode ?? null,
          formType: parent.formType,
          formNumber: parent.formNumber,
          reportNumber: parent.reportNumber ?? null,
          from: parentStatusBeforeReturn,
          to: workflowReturnStatus,
          reason:
            'Returned to original status after all APE child-report corrections resolved',
          actorUserId: user.userId,
          actorRole: user.role,
        });

        this.reportsGateway.notifyStatusChange(
          parent.id,
          workflowReturnStatus,
        );

        return {
          ok: true,
          parentReportId: parent.id,
          parentStatus: updatedParent.status,
          parentVersion: updatedParent.version,
          allResolved: true,
        };
      }

      this.reportsGateway.notifyReportUpdate({ id: report.id });

      return {
        ok: true,
        parentReportId: parent.id,
        parentStatus: parent.status,
        parentVersion: parent.version,
        allResolved: !hasOpenChildCorrections,
      };
    }

    const allResolved = corrections.every(
      (correction) => correction.status === 'RESOLVED',
    );

    if (
      allResolved &&
      report.workflowReturnStatus &&
      correctionWorkflowStatuses.includes(report.status)
    ) {
      const reportStatusBeforeReturn = report.status;

      const updatedReport = await this.prisma.report.update({
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

      await this.dashboardSync.syncMicroReport(id);

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
          returnedFromStatus: reportStatusBeforeReturn,
          returnedToStatus: report.workflowReturnStatus,
          totalCorrections: corrections.length,
        },
      });

      await this.logStatusChange({
        reportId: report.id,
        clientCode: report.clientCode ?? null,
        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber ?? null,
        from: reportStatusBeforeReturn,
        to: report.workflowReturnStatus,
        reason: 'Returned to original status after all corrections resolved',
        actorUserId: user.userId,
        actorRole: user.role,
      });

      this.reportsGateway.notifyStatusChange(
        id,
        report.workflowReturnStatus,
      );

      return {
        ok: true,
        status: updatedReport.status,
        version: updatedReport.version,
        allResolved: true,
      };
    }

    this.reportsGateway.notifyReportUpdate({ id });

    return { ok: true, allResolved };
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