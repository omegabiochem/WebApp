import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentKind, ReportStatus, UserRole } from '@prisma/client';
import { ReportsGateway } from './reports.gateway';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from '../auth/esign.service';
import { getRequestContext } from '../common/request-context';
import { randomUUID } from 'node:crypto';
import * as crypto from 'crypto';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { AttachmentsService } from 'src/attachments/attachments.service';

// ----------------------------
// Which roles may edit which fields (unchanged)
// ----------------------------
const EDIT_MAP: Record<UserRole, string[]> = {
  SYSTEMADMIN: [],
  ADMIN: ['*'],
  FRONTDESK: [
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'description',
    'lotNo',
    'manufactureDate',
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
    'testedBy',
    'testedDate',
    'comments',
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
    'testedBy',
    'testedDate',
    'comments',
  ],
  QA: ['dateCompleted', 'reviewedBy', 'reviewedDate'],
  CLIENT: [
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'description',
    'lotNo',
    'manufactureDate',
    'tbc_spec',
    'tmy_spec',
    'pathogens',
  ],
};

// ----------------------------
// Workflow transitions (unchanged)
// ----------------------------

// const STATUS_TRANSITIONS: Record<
//   ReportStatus,
//   {
//     next: ReportStatus[];
//     canSet: UserRole[];
//     nextEditableBy: UserRole[];
//     canEdit: UserRole[];
//   }
// > = {
//   DRAFT: {
//     canSet: ['CLIENT'],
//     next: ['SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT', 'FRONTDESK'],
//     canEdit: ['CLIENT'],
//   },
//   SUBMITTED_BY_CLIENT: {
//     canSet: ['MICRO'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO'],
//     canEdit: [],
//   },
// UNDER_CLIENT_PRELIMINARY_REVIEW: {
//     canSet: ["CLIENT"],
//     next: ["CLIENT_NEEDS_PRELIMINARY_CORRECTION", "PRELIMINARY_APPROVED"],
//     nextEditableBy: ["CLIENT"],
//     canEdit: [],
//   },
//   CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
//     canSet: ["MICRO"],
//     next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
//     nextEditableBy: ["MICRO", "ADMIN"],
//     canEdit: [],
//   },
//   UNDER_CLIENT_PRELIMINARY_CORRECTION: {
//     canSet: ['CLIENT'],
//     next: ['PRELIMINARY_RESUBMISSION_BY_CLIENT'],
//     nextEditableBy: ['MICRO', 'ADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_CLIENT_FINAL_CORRECTION: {
//     canSet: ['CLIENT'],
//     next: ['FINAL_RESUBMISSION_BY_CLIENT'],
//     nextEditableBy: ['MICRO', 'ADMIN'],
//     canEdit: ['CLIENT'],
//   },
//   UNDER_CLIENT_FINAL_REVIEW: {
//     canSet: ['FRONTDESK', 'CLIENT'],
//     next: ['FINAL_APPROVED', 'CLIENT_NEEDS_FINAL_CORRECTION'],
//     nextEditableBy: ['ADMIN'],
//     canEdit: [],
//   },
//   PRELIMINARY_RESUBMISSION_BY_CLIENT: {
//     canSet: ['MICRO'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'MICRO'],
//     canEdit: [],
//   },
//   CLIENT_NEEDS_FINAL_CORRECTION: {
//     canSet: ['CLIENT'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN'],
//     canEdit: [],
//   },
//   FINAL_RESUBMISSION_BY_CLIENT: {
//     canSet: ['CLIENT'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['ADMIN', 'MICRO'],
//     canEdit: [],
//   },
//   PRELIMINARY_APPROVED: {
//     canSet: ['MICRO'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO'],
//     canEdit: [],
//   },
//   RECEIVED_BY_FRONTDESK: {
//     canSet: ['FRONTDESK'],
//     next: ['UNDER_CLIENT_FINAL_REVIEW', 'FRONTDESK_ON_HOLD'],
//     nextEditableBy: ['MICRO'],
//     canEdit: [],
//   },
//   FRONTDESK_ON_HOLD: {
//     canSet: ['FRONTDESK'],
//     next: ['RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['FRONTDESK'],
//     canEdit: [],
//   },
//   FRONTDESK_NEEDS_CORRECTION: {
//     canSet: ['FRONTDESK', 'ADMIN'],
//     next: ['SUBMITTED_BY_CLIENT'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: [],
//   },
//   UNDER_PRELIMINARY_TESTING_REVIEW: {
//     canSet: ['MICRO'],
//     next: [
//       'PRELIMINARY_TESTING_ON_HOLD',
//       'PRELIMINARY_TESTING_NEEDS_CORRECTION',
//       'UNDER_CLIENT_PRELIMINARY_REVIEW',
//     ],
//     nextEditableBy: ['MICRO'],
//     canEdit: ['MICRO', 'ADMIN'],
//   },
//   PRELIMINARY_TESTING_ON_HOLD: {
//     canSet: ['MICRO'],
//     next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO', 'ADMIN'],
//     canEdit: [],
//   },
//   PRELIMINARY_TESTING_NEEDS_CORRECTION: {
//     canSet: ['CLIENT', 'ADMIN'],
//     next: ['UNDER_CLIENT_PRELIMINARY_CORRECTION'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: [],
//   },
//   UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
//     canSet: ['MICRO'],
//     next: ['PRELIMINARY_RESUBMISSION_BY_TESTING'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: ['MICRO', 'ADMIN'],
//   },
//   PRELIMINARY_RESUBMISSION_BY_TESTING: {
//     canSet: ['MICRO'],
//     next: ['UNDER_CLIENT_PRELIMINARY_REVIEW'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: [],
//   },
//   UNDER_FINAL_TESTING_REVIEW: {
//     canSet: ['MICRO'],
//     next: [
//       'FINAL_TESTING_NEEDS_CORRECTION',
//       'FINAL_TESTING_NEEDS_CORRECTION',
//       'UNDER_ADMIN_REVIEW',
//     ],
//     nextEditableBy: ['QA', 'ADMIN'],
//     canEdit: ['MICRO'],
//   },
//   FINAL_TESTING_ON_HOLD: {
//     canSet: ['MICRO'],
//     next: ['FINAL_TESTING_NEEDS_CORRECTION', 'UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['CLIENT', 'MICRO'],
//     canEdit: [],
//   },
//   FINAL_TESTING_NEEDS_CORRECTION: {
//     canSet: ['MICRO', 'ADMIN'],
//     next: ['UNDER_CLIENT_FINAL_CORRECTION'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: [],
//   },
//   UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
//     canSet: ['MICRO'],
//     next: ['UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW'],
//     nextEditableBy: ['ADMIN'],
//     canEdit: ['MICRO', 'ADMIN'],
//   },
//   FINAL_RESUBMISSION_BY_TESTING: {
//     canSet: ['MICRO', 'ADMIN'],
//     next: ['UNDER_ADMIN_REVIEW'],
//     nextEditableBy: [],
//     canEdit: [],
//   },
//   UNDER_QA_REVIEW: {
//     canSet: ['MICRO'],
//     next: ['QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW'],
//     nextEditableBy: ['QA'],
//     canEdit: ['QA'],
//   },
//   QA_NEEDS_CORRECTION: {
//     canSet: ['QA'],
//     next: ['UNDER_FINAL_TESTING_REVIEW'],
//     nextEditableBy: ['MICRO'],
//     canEdit: [],
//   },

//   UNDER_ADMIN_REVIEW: {
//     canSet: ['MICRO', 'ADMIN', 'SYSTEMADMIN'],
//     next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'RECEIVED_BY_FRONTDESK'],
//     nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
//     canEdit: ['ADMIN'],
//   },
//   ADMIN_NEEDS_CORRECTION: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_REVIEW'],
//     nextEditableBy: ['QA'],
//     canEdit: ['ADMIN'],
//   },
//   ADMIN_REJECTED: {
//     canSet: ['ADMIN', 'SYSTEMADMIN'],
//     next: ['UNDER_QA_REVIEW'],
//     nextEditableBy: ['QA'],
//     canEdit: [],
//   },
//   UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW: {
//     canSet: ['MICRO'],
//     next: ['UNDER_CLIENT_FINAL_REVIEW'],
//     nextEditableBy: ['CLIENT'],
//     canEdit: ['ADMIN'],
//   },
//   FINAL_APPROVED: {
//     canSet: ['CLIENT'],
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
// };





const STATUS_TRANSITIONS: Record<
  ReportStatus,
  {
    next: ReportStatus[];
    canSet: UserRole[];
    nextEditableBy: UserRole[];
    canEdit: UserRole[];
  }
> = {
  DRAFT: {
    canSet: ['CLIENT'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT', 'FRONTDESK'],
    canEdit: ['CLIENT'],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },
UNDER_CLIENT_PRELIMINARY_REVIEW: {
    canSet: ["CLIENT"],
    next: ["CLIENT_NEEDS_PRELIMINARY_CORRECTION", "PRELIMINARY_APPROVED"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ["MICRO"],
    next: ["UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "ADMIN"],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['PRELIMINARY_RESUBMISSION_BY_CLIENT'],
    nextEditableBy: ['MICRO', 'ADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['FINAL_RESUBMISSION_BY_CLIENT'],
    nextEditableBy: ['MICRO', 'ADMIN'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ['FRONTDESK', 'CLIENT'],
    next: ['FINAL_APPROVED', 'CLIENT_NEEDS_FINAL_CORRECTION'],
    nextEditableBy: ['ADMIN'],
    canEdit: [],
  },
  PRELIMINARY_RESUBMISSION_BY_CLIENT: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'MICRO'],
    canEdit: [],
  },
  CLIENT_NEEDS_FINAL_CORRECTION: {
    canSet: ['ADMIN',"MICRO"],
    next: ['UNDER_FINAL_RESUBMISSION_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN'],
    canEdit: [],
  },
  FINAL_RESUBMISSION_BY_CLIENT: {
    canSet: ['CLIENT'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'MICRO'],
    canEdit: [],
  },
  PRELIMINARY_APPROVED: {
    canSet: ['MICRO'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK'],
    next: ['UNDER_CLIENT_FINAL_REVIEW', 'FRONTDESK_ON_HOLD'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ['FRONTDESK'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK'],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: [
      'PRELIMINARY_TESTING_ON_HOLD',
      'PRELIMINARY_TESTING_NEEDS_CORRECTION',
      'UNDER_CLIENT_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO'],
    canEdit: ['MICRO', 'ADMIN'],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'ADMIN'],
    canEdit: [],
  },
  PRELIMINARY_TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT', 'ADMIN'],
    next: ['UNDER_CLIENT_PRELIMINARY_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: ['PRELIMINARY_RESUBMISSION_BY_TESTING'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['MICRO', 'ADMIN'],
  },
  PRELIMINARY_RESUBMISSION_BY_TESTING: {
    canSet: ["CLIENT"],
    next: ['UNDER_CLIENT_PRELIMINARY_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: [
      'FINAL_TESTING_NEEDS_CORRECTION',
      'FINAL_TESTING_NEEDS_CORRECTION',
      'UNDER_ADMIN_REVIEW',
    ],
    nextEditableBy: ['QA', 'ADMIN'],
    canEdit: ['MICRO'],
  },
  FINAL_TESTING_ON_HOLD: {
    canSet: ['MICRO'],
    next: ['FINAL_TESTING_NEEDS_CORRECTION', 'UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['CLIENT', 'MICRO'],
    canEdit: [],
  },
  FINAL_TESTING_NEEDS_CORRECTION: {
    canSet: ['MICRO', 'ADMIN'],
    next: ['UNDER_CLIENT_FINAL_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO','ADMIN'],
    next: ['UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW'],
    nextEditableBy: ['ADMIN'],
    canEdit: ['MICRO', 'ADMIN'],
  },
  FINAL_RESUBMISSION_BY_TESTING: {
    canSet: ['MICRO', 'ADMIN'],
    next: ['UNDER_ADMIN_REVIEW'],
    nextEditableBy: [],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ['MICRO'],
    next: ['QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['QA'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ['QA'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['MICRO', 'ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['QA', 'ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN'],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['ADMIN'],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ['ADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['ADMIN'],
  },
  FINAL_APPROVED: {
    canSet: ['CLIENT'],
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
};

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
      return 'M';
    case 'CHEMISTRY':
      return 'C';
    default:
      return '';
  }
}

// Critical fields that require reason
const CRITICAL_FIELDS = new Set<string>([
  'dateCompleted',
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
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
};

function _getCorrectionsArray(r: any): CorrectionItem[] {
  const raw = (r.corrections ?? []) as CorrectionItem[];
  return Array.isArray(raw) ? raw : [];
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
  ) {}

  // 👇 add this inside the class
  private _getCorrectionsArray(r: any): CorrectionItem[] {
    const raw = (r?.corrections ?? []) as CorrectionItem[];
    return Array.isArray(raw) ? raw : [];
  }

  async createDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    if (!['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const clientCode = user.clientCode ?? body.clientCode;
    if (!clientCode) {
      throw new BadRequestException(
        'Client code is required to create a report',
      );
    }

    // increment per-client sequence atomically
    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    const nextNumber = seq.lastNumber;
    const formNumber = `${clientCode}-${nextNumber.toString().padStart(4, '0')}`;

    const created = await this.prisma.microMixReport.create({
      data: {
        ...this._coerce(body),
        status: 'DRAFT',
        formNumber,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    this.reportsGateway.notifyReportCreated(created);
    return created;
  }

  async get(id: string) {
    const r = await this.prisma.microMixReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async update(
    user: { userId: string; role: UserRole },
    id: string,
    patchIn: any,
  ) {
    const current = await this.get(id);

    if (
      current.status === 'LOCKED' &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException('Report is locked');
    }

    // pull request-context (reason, ip, etc.)
    const ctx = getRequestContext() || {};

    // console.log('PATCH IN:', patchIn);

    // never persist helper fields onto the model
    const {
      reason: _reasonFromBody,
      eSignPassword: _pwdFromBody,
      ...patch
    } = {
      ...patchIn,
    };

    // field-level permissions (ignore 'status' here)
    const fields = Object.keys(patch).filter((f) => f !== 'status');

    // clients may edit ANY field while in DRAFT
    if (!(user.role === 'CLIENT' && current.status === 'DRAFT')) {
      const bad = allowedForRole(user.role, fields);
      if (bad.length) {
        throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);
      }
    }

    // status-based editing guard for field edits
    if (fields.length > 0) {
      const transition = STATUS_TRANSITIONS[current.status];
      if (!transition) {
        throw new BadRequestException(
          `Invalid current status: ${current.status}`,
        );
      }
      if (!transition.canEdit.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot edit report in status ${current.status}`,
        );
      }
    }

    // Require "reason" when touching critical fields (Part 11 rationale)
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
    // console.log('REASON:', reasonFromCtxOrBody);

    // handle status transitions
    if (patchIn.status) {
      const currentTransition = STATUS_TRANSITIONS[current.status];
      if (!currentTransition) {
        throw new BadRequestException(
          `Invalid current status: ${current.status}`,
        );
      }
      if (!currentTransition.canSet.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot change status from ${current.status}`,
        );
      }
      if (!currentTransition.next.includes(patchIn.status)) {
        throw new BadRequestException(
          `Invalid transition: ${current.status} → ${patchIn.status}`,
        );
      }

      // Assign report number when work starts in lab
      if (patchIn.status === 'UNDER_PRELIMINARY_TESTING_REVIEW') {
        if (!current.reportNumber) {
          const deptLetter = getDepartmentLetter(user.role);
          if (deptLetter) {
            const seq = await this.prisma.labReportSequence.upsert({
              where: { department: deptLetter },
              update: { lastNumber: { increment: 1 } },
              create: { department: deptLetter, lastNumber: 1 },
            });
            patch.reportNumber = `${deptLetter}-${seq.lastNumber
              .toString()
              .padStart(4, '0')}`;
          }
        }
      }

      // E-signature required when going to APPROVED or LOCKED
      if (
        patchIn.status === 'UNDER_CLIENT_FINAL_REVIEW' ||
        patchIn.status === 'LOCKED'
      ) {
        const password =
          _pwdFromBody ||
          (patchIn as any)?.eSignPassword ||
          (ctx as any)?.eSignPassword || // set by middleware if you decide to capture X-ESign-Password
          null;
        if (!password) {
          throw new BadRequestException(
            'Electronic signature (password) is required',
          );
        }
        await this.esign.verifyPassword(user.userId, String(password));
      }

      if (patchIn.status === 'LOCKED') {
        (patch as any).lockedAt = new Date();
      }

      (patch as any).status = patchIn.status;
    }

    const updated = await this.prisma.microMixReport.update({
      where: { id },
      data: { ...this._coerce(patch), updatedBy: user.userId },
    });

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    return updated;
  }

  async updateStatus(
    user: { userId: string; role: UserRole },
    id: string,
    status: ReportStatus,
  ) {
    return this.update(user, id, { status });
  }

  async changeStatus(
    user: { userId: string; role: UserRole },
    id: string,
    input: ChangeStatusInput,
  ) {
    const current = await this.get(id);

    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN/SYSTEMADMIN can Change Status this directly',
      );
    }

    const target: ReportStatus =
      typeof input === 'string' ? input : input.status;
    if (!target) {
      throw new BadRequestException('Status is required');
    }

    const ctx = getRequestContext() || {};

    const reason =
      typeof input === 'string'
        ? undefined
        : (input.reason ?? (ctx as any)?.reason);
    const eSignPassword =
      typeof input === 'string'
        ? undefined
        : (input.eSignPassword ?? (ctx as any)?.eSignPassword);

    if (!reason) {
      throw new BadRequestException(
        'Reason for change is required (21 CFR Part 11). Provide X-Change-Reason header or body.reason',
      );
    }

    const trans = STATUS_TRANSITIONS[current.status];
    if (!trans) {
      throw new BadRequestException(
        `Invalid current status: ${current.status}`,
      );
    }


    const patch: any = { status: target };

      if (target === 'UNDER_PRELIMINARY_TESTING_REVIEW') {
        if (!current.reportNumber) {
          const deptLetter = getDepartmentLetter(user.role);
          if (deptLetter) {
            const seq = await this.prisma.labReportSequence.upsert({
              where: { department: deptLetter },
              update: { lastNumber: { increment: 1 } },
              create: { department: deptLetter, lastNumber: 1 },
            });
            patch.reportNumber = `${deptLetter}-${seq.lastNumber
              .toString()
              .padStart(4, '0')}`;
          }
        }
      }

      const updated = await this.prisma.microMixReport.update({
        where: { id },
        data: { ...patch, updatedBy: user.userId },
      });

      this.reportsGateway.notifyStatusChange(id, target);
      return updated;

    
  }

  async findAll() {
    return this.prisma.microMixReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------
  // Coerce dates and JSON (unchanged)
  // ----------------------------
  private _coerce(obj: any) {
    const copy = { ...obj };
    const dateKeys = [
      'dateSent',
      'manufactureDate',
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

  // POST /reports/micro-mix/:id/corrections
  async createCorrections(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      items: { fieldKey: string; message: string }[];
      targetStatus?: ReportStatus;
      reason?: string;
    },
  ) {
    if (!body.items?.length)
      throw new BadRequestException(
        'At least one correction item is required.',
      );

    const r = await this.get(id);
    const mayRequest = ['FRONTDESK', 'MICRO', 'QA', 'ADMIN', 'SYSTEMADMIN','CLIENT'];
    if (!mayRequest.includes(user.role))
      throw new ForbiddenException('Not allowed');

    const nowIso = new Date().toISOString();
    const existing = this._getCorrectionsArray(r);
    const toAdd = body.items.map((it) => ({
      id: randomUUID(),
      fieldKey: it.fieldKey,
      message: it.message,
      status: 'OPEN' as const,
      requestedByUserId: user.userId,
      requestedByRole: user.role,
      createdAt: nowIso, // ✅ ISO string for JSON column
      resolvedAt: null as string | null,
      resolvedByUserId: null as string | null,
    }));

    const nextCorrections = [...existing, ...toAdd];

    // ✅ ALWAYS write corrections
    await this.prisma.microMixReport.update({
      where: { id },
      data: { corrections: nextCorrections, updatedBy: user.userId },
    });

    // Optional: also move status
    if (body.targetStatus) {
      await this.update(user, id, {
        status: body.targetStatus,
        reason: body.reason || 'Corrections requested',
      });
    }

    // Return fresh list (way more useful than {ok:true})
    return nextCorrections;
  }

  // GET /reports/micro-mix/:id/corrections
  async listCorrections(id: string) {
    const r = await this.get(id);
    return this._getCorrectionsArray(r);
  }

  // PATCH /reports/micro-mix/:id/corrections/:cid
  async resolveCorrection(
    user: { userId: string; role: UserRole },
    id: string,
    cid: string,
    body: { resolutionNote?: string },
  ) {
    const r = await this.get(id);
    const arr = this._getCorrectionsArray(r);
    const idx = arr.findIndex((c) => c.id === cid);
    if (idx < 0) throw new NotFoundException('Correction not found');

    // who can resolve? (the party asked to fix)
    const allowedResolvers: UserRole[] = ['CLIENT', 'MICRO', 'FRONTDESK','ADMIN']; // tune per status
    if (!allowedResolvers.includes(user.role))
      throw new ForbiddenException('Not allowed to resolve');

    arr[idx] = {
      ...arr[idx],
      status: 'RESOLVED',
      resolvedAt: new Date(), // ✅ Date object
      resolvedByUserId: user.userId,
    };

    await this.prisma.microMixReport.update({
      where: { id },
      data: { corrections: arr, updatedBy: user.userId },
    });

    this.reportsGateway.notifyReportUpdate({ id });
    return { ok: true };
  }

  private async findReportOrThrow(user: any, id: string) {
    // add org/tenant scoping here if you have it on MicroMixReport
    const report = await this.prisma.microMixReport.findUnique({
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
    },
  ) {
    // delegate; AttachmentsService handles FILES_DIR & DB
    return this.attachments.create({
      reportId: id,
      file,
      kind: (body.kind as any) ?? 'OTHER',
      source: body.source ?? 'upload',
      pages: body.pages ? Number(body.pages) : undefined,
      createdBy: body.createdBy ?? user?.userId ?? 'web',
    });
  }

  //   async addAttachment(
  //     user: any,
  //     id: string,
  //     file: Express.Multer.File,
  //     body: { pages?: string; checksum?: string; source?: string; createdBy?: string; kind?: string },
  //   ) {
  //     await this.findReportOrThrow(user, id);

  //       // read file contents regardless of storage
  //  const buf = file.buffer ?? await fsp.readFile((file as any).path);
  //   const checksum = body.checksum || crypto.createHash('sha256').update(buf).digest('hex');

  //     // Optional: de-dupe per report + checksum
  //     const existing = await this.prisma.attachment.findFirst({
  //       where: { reportId: id, checksum },
  //       select: { id: true },
  //     });
  //     if (existing) return { ok: true, id: existing.id, dedup: true };

  //     // Persist file (adjust to S3/GCS if needed)
  //     const dir = path.join(process.cwd(), 'uploads', 'micro-mix', id);
  //     await fsp.mkdir(dir, { recursive: true });
  //     const safeName = `${Date.now()}_${(file.originalname || 'scan').replace(/[^\w.\-]+/g, '_')}`;
  //     const fullPath = path.join(dir, safeName);
  //     await fsp.writeFile(fullPath, buf);

  //     const att = await this.prisma.attachment.create({
  //       data: {
  //         reportId: id,
  //         kind: (body.kind as AttachmentKind) || AttachmentKind.SIGNED_FORM,
  //         filename: safeName,
  //         storageKey: fullPath,   // or a URL if you serve it
  //         checksum,
  //         pages: body.pages ? Number(body.pages) : null,
  //         source: body.source || 'scan-hotfolder',
  //         meta: {},
  //         createdBy: body.createdBy || user?.sub || 'ingestor',
  //       },
  //     });

  //     return { ok: true, id: att.id };
  //   }
}
