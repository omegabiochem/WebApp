import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChemistryReportStatus,
  FormType,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { copy } from 'fs-extra';
import { get } from 'http';
import { PrismaService } from 'prisma/prisma.service';
import { ChemistryAttachmentsService } from 'src/attachments/chemistryattachments.service';
import { ESignService } from 'src/auth/esign.service';
import { getRequestContext } from 'src/common/request-context';
import de from 'zod/v4/locales/de.js';
import th from 'zod/v4/locales/th.js';

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') ? 'OM' : 'BC';
}

type ChemistryFormType = Extract<FormType, 'CHEMISTRY_MIX'>;

const DETAILS_RELATIONS: Record<ChemistryFormType, 'chemistryMix'> = {
  CHEMISTRY_MIX: 'chemistryMix',
};

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

// to pick existed related report
function pickDetails(r: any) {
  return r.chemistryMix ?? null;
}

function flattenReport(r: any) {
  const { chemistryMix, ...base } = r;

  const dRaw = pickDetails(r) || {};

  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)),
  );
  return { ...base, ...d };
}

// 🔁 Keep this in sync with backend
const STATUS_TRANSITIONS: Record<
  ChemistryReportStatus,
  {
    canSet: UserRole[];
    next: ChemistryReportStatus[];
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
    canSet: ['CHEMISTRY'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY'],
    canEdit: [],
  },
  UNDER_CLIENT_REVIEW: {
    canSet: ['CLIENT'],
    next: ['CLIENT_NEEDS_CORRECTION', 'APPROVED'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ['CHEMISTRY'],
    next: ['UNDER_RESUBMISSION_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'ADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['RESUBMISSION_BY_CLIENT'],
    nextEditableBy: ['CHEMISTRY', 'ADMIN'],
    canEdit: ['CLIENT'],
  },

  RESUBMISSION_BY_CLIENT: {
    canSet: ['CHEMISTRY'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'CHEMISTRY'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK'],
    next: ['UNDER_CLIENT_REVIEW', 'FRONTDESK_ON_HOLD'],
    nextEditableBy: ['CHEMISTRY'],
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
  UNDER_TESTING_REVIEW: {
    canSet: ['CHEMISTRY'],
    next: ['TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['CHEMISTRY'],
    canEdit: ['CHEMISTRY', 'ADMIN'],
  },
  TESTING_ON_HOLD: {
    canSet: ['CHEMISTRY'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'ADMIN'],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['UNDER_CLIENT_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['CHEMISTRY'],
    next: ['RESUBMISSION_BY_TESTING'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['CHEMISTRY', 'ADMIN'],
  },
  RESUBMISSION_BY_TESTING: {
    canSet: ['CLIENT'],
    next: ['UNDER_CLIENT_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ['CHEMISTRY'],
    next: ['QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['QA'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ['QA'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY'],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
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
  UNDER_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ['ADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['ADMIN'],
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
};

const EDIT_MAP: Record<UserRole, string[]> = {
  SYSTEMADMIN: [],
  ADMIN: ['*'],
  FRONTDESK: [],
  CHEMISTRY: [
    'dateReceived',
    'sop',
    'results',
    'dateTested',
    'initial',
    'comments',
    'testedBy',
    'testedDate',
    'actives',
  ],
  QA: ['dateCompleted', 'reviewedBy', 'reviewedDate'],
  CLIENT: [
    'client',
    'dateSent',
    'sampleDescription',
    'testTypes',
    'sampleCollected',
    'lotBatchNo',
    'manufactureDate',
    'formulaId',
    'sampleSize',
    'numberOfActives',
    'sampleTypes',
    'comments',
    'actives',
    'formulaContent',
  ],
  MICRO: [],
};

type ChangeStatusInput =
  | ChemistryReportStatus
  | { status: ChemistryReportStatus; reason?: string; eSignPassword?: string };

function splitPatch(patch: Record<string, any>) {
  const base: any = {};
  const details: any = {};
  for (const [k, v] of Object.entries(patch)) {
    (BASE_FIELDS.has(k) ? base : details)[k] = v;
  }
  return { base, details };
}

function updateDetailsByType(
  tx: PrismaService,
  formType: FormType,
  chemistryId: string,
  data: Record<string, any>,
): Prisma.PrismaPromise<any> | null {
  if (!data || Object.keys(data).length === 0) return null;

  switch (formType) {
    case 'CHEMISTRY_MIX':
      return tx.chemistryMixDetails.update({
        where: { chemistryId },
        data,
      });
    default:
      throw new BadRequestException(`Unsupported formType: ${formType}`);
  }
}

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
  'status',
]);

type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: 'OPEN' | 'RESOLVED';
  requestedByUserId: string;
  requestedByRole: UserRole;

  createdAt: string; // ✅ keep as ISO string (you already store string)
  oldValue?: any | null; // ✅ snapshot at time of request (string | number | array | object)
  resolvedAt?: string | null; // ✅ ISO
  resolvedByUserId?: string | null;

  resolutionNote?: string | null; // optional
};

function _getCorrectionsArray(r: any): CorrectionItem[] {
  const raw = (r.corrections ?? []) as CorrectionItem[];
  return Array.isArray(raw) ? raw : [];
}
@Injectable()
export class ChemistryReportsService {
  // Service methods would go here
  constructor(
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly attachments: ChemistryAttachmentsService,
  ) {}

  // 👇 add this inside the class
  private _getCorrectionsArray(r: any): CorrectionItem[] {
    const raw = r?.corrections;
    if (!raw) return [];
    if (!Array.isArray(raw)) return [];
    return raw as CorrectionItem[];
  }

  async createChemistryReportDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    if (!['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const formType: FormType = body?.formType;
    if (!formType) throw new BadRequestException('formType is required');

    const relationKey = DETAILS_RELATIONS[formType as ChemistryFormType];
    if (!relationKey) {
      throw new BadRequestException(`Unsupported formType: ${formType}`);
    }

    const clientCode = user.clientCode ?? body.clientCode;
    if (!clientCode) {
      throw new BadRequestException(
        'Client code is required to create a report',
      );
    }

    function yyyy(d: Date = new Date()): string {
      const yyyy = String(d.getFullYear());
      return yyyy;
    }

    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    const n = seqPad(seq.lastNumber);
    const formNumber = `${clientCode}-${yyyy()}${n}`;
    const prefix = getDeptLetterForForm(formType);

    // remove non-details keys from body that would collide with Report fields
    const { formType: _ft, clientCode: _cc, ...rest } = body;

    const created = await this.prisma.chemistryReport.create({
      data: {
        formType,
        formNumber,
        prefix,
        status: 'DRAFT',
        createdBy: user.userId,
        updatedBy: user.userId,
        [relationKey]: {
          create: this._coerce(rest),
        },
      },
    });
    return flattenReport(created);
  }

  private _coerce(obj: any) {
    const copy = { ...obj };

    // ✅ enums: empty string should not be sent to Prisma
    if ('sampleCollected' in copy) {
      if (copy.sampleCollected === '' || copy.sampleCollected == null) {
        copy.sampleCollected = null; // requires Prisma field to be optional
      }
    }

    const dateKeys = [
      'dateSent',
      'manufactureDate',
      'dateReceived',
      'testedDate',
      'reviewedDate',
    ];

    for (const k of dateKeys) {
      if (!(k in copy)) continue;

      if (copy[k] === '' || copy[k] === null) {
        copy[k] = null;
      } else if (typeof copy[k] === 'string') {
        const d = new Date(copy[k]);
        copy[k] = isNaN(d.getTime()) ? null : d;
      }
    }
    return copy;
  }

  // TO get list of reports

  async findAll() {
    const reports = await this.prisma.chemistryReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        chemistryMix: true,
      },
    });
    return reports.map(flattenReport);
  }

  async update(
    user: { userId: string; role: UserRole },
    id: string,
    patchIn: any,
  ) {
    const current = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: { chemistryMix: true },
    });
    if (!current) throw new BadRequestException('Report not found');

    if (
      current.status === 'LOCKED' &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException('Report is locked and cannot be edited');
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

    if (patchIn.status) {
      const trans = STATUS_TRANSITIONS[current.status as ChemistryReportStatus];
      if (!trans) {
        throw new BadRequestException(
          `Invalid status transition from ${current.status}`,
        );
      }
      if (!trans.canSet.includes(user.role)) {
        throw new ForbiddenException(
          `User role ${user.role} cannot set status to ${patchIn.status}`,
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

      function seqPad(num: number): string {
        const width = Math.max(4, String(num).length);
        return String(num).padStart(width, '0');
      }

      if (patchIn.status === 'UNDER_TESTING_REVIEW' && !current.reportNumber) {
        const deptLetter = getDeptLetterForForm(current.formType);
        const seq = await this.prisma.labReportSequence.upsert({
          where: { department: deptLetter },
          update: { lastNumber: { increment: 1 } },
          create: { department: deptLetter, lastNumber: 1 },
        });
        const n = seqPad(seq.lastNumber);
        base.reportNumber = `${deptLetter}-${yyyy()}${n}`;
      }

      // e-sign requirements
      if (
        patchIn.status === 'UNDER_CLIENT_REVIEW' ||
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

    const ops: Prisma.PrismaPromise<any>[] = [
      this.prisma.chemistryReport.update({
        where: { id },
        data: {
          ...base,
          updatedBy: user.userId,
        },
        include: { chemistryMix: true },
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

    return flattenReport(updated);
  }

  async updateStatus(
    user: { userId: string; role: UserRole },
    id: string,
    status: ChemistryReportStatus,
  ) {
    return this.update(user, id, { status });
  }

  async get(id: string) {
    const r = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
      },
    });
    if (!r) throw new NotFoundException('Report not found');
    return flattenReport(r);
  }

  // TO CHANGE STATUS

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

    const target: ChemistryReportStatus =
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

    if (!eSignPassword) {
      throw new BadRequestException(
        'Electronic Signature (password) is required for status changes',
      );
    }

    await this.esign.verifyPassword(user.userId, String(eSignPassword));

    const trans = STATUS_TRANSITIONS[current.status as ChemistryReportStatus];
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

    if (target === 'UNDER_TESTING_REVIEW' && !current.reportNumber) {
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

    const updated = await this.prisma.chemistryReport.update({
      where: { id },
      data: { ...patch, updatedBy: user.userId },
    });

    // this.reportsGateway.notifyStatusChange(id, target);
    return updated;
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
      chemistryId: id,
      file,
      kind: (body.kind as any) ?? 'OTHER',
      source: body.source ?? 'upload',
      pages: body.pages ? Number(body.pages) : undefined,
      providedChecksum: body.checksum, // you already added this
      createdBy: body.createdBy ?? user?.userId ?? 'web',
      meta: typeof body.meta === 'string' ? JSON.parse(body.meta) : body.meta, // ⬅ pass meta
    });
  }

  // POST /reports/:id/corrections
  async createCorrections(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      items: { fieldKey: string; message: string; oldValue?: any | null }[];
      targetStatus?: ChemistryReportStatus;
      reason?: string;
    },
  ) {
    if (!body.items?.length) {
      throw new BadRequestException(
        'At least one correction item is required.',
      );
    }

    const report = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
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
      });
    }

    return nextCorrections;
  }

  async listCorrections(id: string) {
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
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
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
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
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: user.userId,
      resolutionNote: body?.resolutionNote ?? null,
    };

    await updateDetailsByType(this.prisma, report.formType, id, {
      corrections: arr,
    });

    // this.reportsGateway.notifyReportUpdate({ id });
    return { ok: true };
  }
}
