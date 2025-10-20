import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
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
    nextEditableBy: ['MICRO', 'ADMIN'],
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
    canSet: ['ADMIN', 'MICRO'],
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
    canSet: ['CLIENT'],
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
    canSet: ['MICRO', 'ADMIN'],
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

// Which details relation to use for a given formType
const DETAILS_RELATION: Record<
  FormType,
  'microMix' | 'microMixWater' | 'microGeneral' | 'microGeneralWater'
> = {
  MICRO_MIX: 'microMix',
  MICRO_MIX_WATER: 'microMixWater',
  MICRO_GENERAL: 'microGeneral',
  MICRO_GENERAL_WATER: 'microGeneralWater',
};

// Prisma delegate per details model
function detailsDelegate(prisma: PrismaService, t: FormType) {
  switch (t) {
    case 'MICRO_MIX':
      return prisma.microMixDetails;
    case 'MICRO_MIX_WATER':
      return prisma.microMixWaterDetails;
    case 'MICRO_GENERAL':
      return prisma.microGeneralDetails;
    case 'MICRO_GENERAL_WATER':
      return prisma.microGeneralWaterDetails;
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
  return (
    r.microMix ??
    r.microMixWater ??
    r.microGeneral ??
    r.microGeneralWater ??
    null
  );
}

// Flatten for backwards-compat responses (base + active details on top)
function flattenReport(r: any) {
  const { microMix, microMixWater, microGeneral, microGeneralWater, ...base } =
    r;
  const dRaw = pickDetails(r) || {};

  // Strip any keys that belong to the base report so they can't override it.
  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)), // BASE_FIELDS includes "status"
  );

  return { ...base, ...d }; // base wins for base fields (incl. status)
}

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') ? 'M' : 'C';
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
    case 'MICRO_GENERAL':
      return tx.microGeneralDetails.update({ where: { reportId }, data });
    case 'MICRO_GENERAL_WATER':
      return tx.microGeneralWaterDetails.update({ where: { reportId }, data });
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

    function yymm(d: Date = new Date()): string {
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return yy + mm; // e.g. "2510"
    }

    // per-client running number
    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    // const formNumber = `${clientCode}-${String(seq.lastNumber).padStart(4, '0')}`;
    const n = String(seq.lastNumber).padStart(5, '0');
    const formNumber = `${clientCode}-${yymm()}${n}`;
    const prefix = getDeptLetterForForm(formType); // "M" for MICRO_*

    // remove non-details keys from body that would collide with Report fields
    const { formType: _ft, clientCode: _cc, ...rest } = body;

    const created = await this.prisma.report.create({
      data: {
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
        microGeneral: true,
        microGeneralWater: true,
      },
    });

    this.reportsGateway.notifyReportCreated(created);
    return flattenReport(created); // keep old shape convenient for UI
  }

  async get(id: string) {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: {
        microMix: true,
        microMixWater: true,
        microGeneral: true,
        microGeneralWater: true,
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
        microGeneral: true,
        microGeneralWater: true,
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
      ...patch
    } = { ...patchIn };

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

      function yymm(d: Date = new Date()): string {
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return yy + mm; // e.g. "2510"
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
        const n = String(seq.lastNumber).padStart(5, '0'); // NNNNN
        base.reportNumber = `${deptLetter}-${yymm()}${n}`; // M-YYMMNNNNN
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

    // do both updates in a transaction for consistency
    const ops: Prisma.PrismaPromise<any>[] = [
      this.prisma.report.update({
        where: { id },
        data: { ...base, updatedBy: user.userId },
        include: {
          microMix: true,
          microMixWater: true,
          microGeneral: true,
          microGeneralWater: true,
        },
      }),
    ];

    const detailsOp = updateDetailsByType(
      this.prisma,
      current.formType,
      id,
      details,
    );
    if (detailsOp) ops.push(detailsOp);

    const [updated] = await this.prisma.$transaction(ops);

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    return flattenReport(updated);
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

    function yymm(d: Date = new Date()): string {
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return yy + mm; // e.g. "2510"
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
        const n = String(seq.lastNumber).padStart(5, '0');
        patch.reportNumber = `${deptLetter}-${yymm()}${n}`;
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
        microGeneral: true,
        microGeneralWater: true,
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
      items: { fieldKey: string; message: string }[];
      targetStatus?: ReportStatus;
      reason?: string;
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
        microGeneral: true,
        microGeneralWater: true,
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
      resolvedAt: null as string | null,
      resolvedByUserId: null as string | null,
    }));
    const nextCorrections = [...existing, ...toAdd];

    await updateDetailsByType(this.prisma, report.formType, id, {
      corrections: nextCorrections,
    });

    if (body.targetStatus) {
      await this.update(user, id, {
        status: body.targetStatus,
        reason: body.reason || 'Corrections requested',
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
        microGeneral: true,
        microGeneralWater: true,
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
        microGeneral: true,
        microGeneralWater: true,
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
    ];
    if (!allowedResolvers.includes(user.role))
      throw new ForbiddenException('Not allowed to resolve');

    arr[idx] = {
      ...arr[idx],
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedByUserId: user.userId,
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
