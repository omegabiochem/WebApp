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
  SYSTEMADMIN: [],
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
    'comments',
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
    'dateCompleted',
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
    canSet: ['CLIENT'],
    next: ['CLIENT_NEEDS_PRELIMINARY_CORRECTION', 'PRELIMINARY_APPROVED'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'ADMIN', 'QA'],
    canEdit: [],
  },
  UNDER_CLIENT_PRELIMINARY_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['PRELIMINARY_RESUBMISSION_BY_CLIENT'],
    nextEditableBy: ['MICRO', 'ADMIN', 'QA'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['FINAL_RESUBMISSION_BY_CLIENT'],
    nextEditableBy: ['MICRO', 'ADMIN', 'QA'],
    canEdit: ['CLIENT'],
  },
  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ['CLIENT'],
    next: ['FINAL_APPROVED', 'CLIENT_NEEDS_FINAL_CORRECTION'],
    nextEditableBy: ['ADMIN', 'QA'],
    canEdit: [],
  },
  PRELIMINARY_RESUBMISSION_BY_CLIENT: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'MICRO'],
    canEdit: [],
  },
  CLIENT_NEEDS_FINAL_CORRECTION: {
    canSet: ['ADMIN', 'QA', 'MICRO'],
    next: ['UNDER_FINAL_RESUBMISSION_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA'],
    canEdit: [],
  },
  FINAL_RESUBMISSION_BY_CLIENT: {
    canSet: ['CLIENT'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'MICRO'],
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
    canSet: ['FRONTDESK', 'ADMIN', 'QA'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: [
      'PRELIMINARY_TESTING_ON_HOLD',
      'PRELIMINARY_TESTING_NEEDS_CORRECTION',
      'UNDER_QA_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO'],
    canEdit: ['MICRO', 'ADMIN', 'QA'],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ['MICRO'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'ADMIN', 'QA'],
    canEdit: [],
  },
  PRELIMINARY_TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['UNDER_CLIENT_PRELIMINARY_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_QA_PRELIMINARY_REVIEW: {
    canSet: ['QA'],
    next: [
      'QA_NEEDS_PRELIMINARY_CORRECTION',
      'UNDER_CLIENT_PRELIMINARY_REVIEW',
    ],
    nextEditableBy: ['MICRO'],
    canEdit: ['QA'],
  },
  QA_NEEDS_PRELIMINARY_CORRECTION: {
    canSet: ['QA'],
    next: ['UNDER_PRELIMINARY_TESTING_REVIEW'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },
  UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: ['UNDER_QA_PRELIMINARY_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['MICRO', 'ADMIN', 'QA'],
  },
  PRELIMINARY_RESUBMISSION_BY_TESTING: {
    canSet: ['QA'],
    next: ['UNDER_QA_PRELIMINARY_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: [],
  },
  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ['MICRO'],
    next: [
      'FINAL_TESTING_ON_HOLD',
      'FINAL_TESTING_NEEDS_CORRECTION',
      'UNDER_QA_FINAL_REVIEW',
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
    canSet: ['MICRO', 'ADMIN', 'QA'],
    next: ['UNDER_CLIENT_FINAL_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['MICRO', 'ADMIN', 'QA'],
    next: ['UNDER_FINAL_RESUBMISSION_QA_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['MICRO', 'ADMIN', 'QA'],
  },
  FINAL_RESUBMISSION_BY_TESTING: {
    canSet: ['MICRO', 'ADMIN', 'QA'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: [],
    canEdit: [],
  },
  UNDER_QA_FINAL_REVIEW: {
    canSet: ['MICRO', 'QA'],
    next: ['QA_NEEDS_FINAL_CORRECTION', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['QA'],
    canEdit: ['QA'],
  },
  QA_NEEDS_FINAL_CORRECTION: {
    canSet: ['QA'],
    next: ['UNDER_FINAL_TESTING_REVIEW'],
    nextEditableBy: ['MICRO'],
    canEdit: [],
  },
  UNDER_FINAL_RESUBMISSION_QA_REVIEW: {
    canSet: ['QA'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['ADMIN', 'QA'],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
    canEdit: ['ADMIN'],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['ADMIN'],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_FINAL_REVIEW'],
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
      return 'OM';
    case 'CHEMISTRY':
      return 'BC';
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
type MicroFormType = Extract<FormType, 'MICRO_MIX' | 'MICRO_MIX_WATER'>;

const DETAILS_RELATION: Record<MicroFormType, 'microMix' | 'microMixWater'> = {
  MICRO_MIX: 'microMix',
  MICRO_MIX_WATER: 'microMixWater',
};

// Prisma delegate per details model
function detailsDelegate(prisma: PrismaService, t: FormType) {
  switch (t) {
    case 'MICRO_MIX':
      return prisma.microMixDetails;
    case 'MICRO_MIX_WATER':
      return prisma.microMixWaterDetails;

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
  return r.microMix ?? r.microMixWater ?? null;
}

// Flatten for backwards-compat responses (base + active details on top)
function flattenReport(r: any) {
  const { microMix, microMixWater, ...base } = r;
  const dRaw = pickDetails(r) || {};

  // Strip any keys that belong to the base report so they can't override it.
  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)), // BASE_FIELDS includes "status"
  );

  return { ...base, ...d }; // base wins for base fields (incl. status)
}

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') ? 'OM' : 'BC';
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
    default:
      throw new Error(`Unsupported formType: ${formType}`);
  }
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
      },
    });
    if (!current) throw new NotFoundException('Report not found');

    // LOCK guard
    if (
      current.status === 'LOCKED' &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException('Report is locked');
    }

    const ctx = getRequestContext() || {};
    const {
      reason: _reasonFromBody,
      eSignPassword: _pwdFromBody,
      expectedVersion,
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
    if (!(user.role === 'CLIENT' && current.status === 'DRAFT')) {
      const bad = allowedForRole(user.role, fieldKeys);
      if (bad.length)
        throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);
    }

    // status-based edit guard
    if (fieldKeys.length > 0) {
      const transition = STATUS_TRANSITIONS[current.status];
      if (!transition)
        throw new BadRequestException(
          `Invalid current status: ${current.status}`,
        );
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
      const trans = STATUS_TRANSITIONS[current.status];
      if (!trans)
        throw new BadRequestException(
          `Invalid current status: ${current.status}`,
        );
      if (!trans.canSet.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot change status from ${current.status}`,
        );
      }
      if (!trans.next.includes(patchIn.status)) {
        throw new BadRequestException(
          `Invalid transition: ${current.status} → ${patchIn.status}`,
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

      // Assign report number when lab work starts
      if (
        patchIn.status === 'UNDER_PRELIMINARY_TESTING_REVIEW' &&
        !current.reportNumber
      ) {
        const deptLetter = getDeptLetterForForm(current.formType); // "M" or "C"
        const seq = await this.prisma.labReportSequence.upsert({
          where: { department: deptLetter },
          update: { lastNumber: { increment: 1 } },
          create: { department: deptLetter, lastNumber: 1 },
        });
        const n = seqPad(seq.lastNumber);
        base.reportNumber = `${deptLetter}-${yyyy()}${n}`; // M-YYMMNNNNN
      }

      // e-sign requirements
      if (
        patchIn.status === 'UNDER_CLIENT_FINAL_REVIEW' ||
        patchIn.status === 'LOCKED'
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

    // // do both updates in a transaction for consistency
    // const ops: Prisma.PrismaPromise<any>[] = [
    //   this.prisma.report.update({
    //     where: { id },
    //     data: { ...base, updatedBy: user.userId },
    //     include: {
    //       microMix: true,
    //       microMixWater: true,
    //     },
    //   }),
    // ];

    // const detailsOp = updateDetailsByType(
    //   this.prisma,
    //   current.formType,
    //   id,
    //   details,
    // );
    // if (detailsOp) ops.push(detailsOp);

    // const [updated] = await this.prisma.$transaction(ops);

    // if (patchIn.status) {
    //   this.reportsGateway.notifyStatusChange(id, patchIn.status);
    // } else {
    //   this.reportsGateway.notifyReportUpdate(updated);
    // }

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
      include: { microMix: true, microMixWater: true },
    });
    if (!updated) throw new NotFoundException('Report not found after update');

    const prevStatus = String(current.status);

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    if (patchIn.status && prevStatus !== String(patchIn.status)) {
      const slug =
        current.formType === 'MICRO_MIX'
          ? 'micro-mix'
          : current.formType === 'MICRO_MIX_WATER'
            ? 'micro-mix-water'
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
    const current = await this.get(id);

    if (!['ADMIN', 'SYSTEMADMIN', 'QA', 'MICRO'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN/SYSTEMADMIN/QA/MICRO can Change Status this directly',
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

    const skipESign = target === 'UNDER_FINAL_TESTING_REVIEW'; // ✅ only for Start Final

    if (!skipESign) {
      if (!eSignPassword) {
        throw new BadRequestException(
          'Electronic Signature (password) is required for status changes',
        );
      }
      await this.esign.verifyPassword(user.userId, String(eSignPassword));
    }

    const trans = STATUS_TRANSITIONS[current.status as ReportStatus];
    if (!trans) {
      throw new BadRequestException(
        `Invalid current status: ${current.status}`,
      );
    }

    const patch: any = { status: target };

    function yyyy(d: Date = new Date()): string {
      const yyyy = String(d.getFullYear());
      return yyyy; // e.g. "2410"
    }

    // Pads with a minimum of 4 digits, but grows as needed (10000 → width 5, etc.)
    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    if (
      target === 'UNDER_PRELIMINARY_TESTING_REVIEW' &&
      !current.reportNumber
    ) {
      const deptLetter =
        getDeptLetterForForm((current as any).formType) ||
        getDepartmentLetter(user.role);
      if (deptLetter) {
        const seq = await this.prisma.labReportSequence.upsert({
          where: { department: deptLetter },
          update: { lastNumber: { increment: 1 } },
          create: { department: deptLetter, lastNumber: 1 },
        });
        const n = seqPad(seq.lastNumber);
        patch.reportNumber = `${deptLetter}-${yyyy()}${n}`;
      }
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: { ...patch, updatedBy: user.userId },
    });

    this.reportsGateway.notifyStatusChange(id, target);
    return updated;
  }

  async findAll() {
    const rows = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        microMix: true,
        microMixWater: true,
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
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const mayRequest = [
      'FRONTDESK',
      'MICRO',
      'CHEMISTRY',
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

    if (body.targetStatus) {
      await this.update(user, id, {
        status: body.targetStatus,
        reason: body.reason || 'Corrections requested',
        expectedVersion: body.expectedVersion,
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
    ];
    if (!allowedResolvers.includes(user.role))
      throw new ForbiddenException('Not allowed to resolve');
    arr[idx] = {
      ...arr[idx],
      status: 'RESOLVED',
      resolvedAt: new Date().toISOString(), // ✅ ISO
      resolvedByUserId: user.userId,
      resolutionNote: body?.resolutionNote ?? null, // ✅ store note
    };

    await updateDetailsByType(this.prisma, report.formType, id, {
      corrections: arr,
    });

    this.reportsGateway.notifyReportUpdate({ id });
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
