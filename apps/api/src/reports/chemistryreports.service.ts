import {
  BadRequestException,
  ConflictException,
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
import { ChemistryReportNotificationsService } from 'src/notifications/chemistryreport-notification.service';
import { ReportNotificationsService } from 'src/notifications/report-notifications.service';
import de from 'zod/v4/locales/de.js';
import th from 'zod/v4/locales/th.js';
import { ReportsGateway } from './reports.gateway';

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') ? 'OM' : 'BC';
}
type ChemistryFormType = Extract<FormType, 'CHEMISTRY_MIX' | 'COA'>;

const DETAILS_RELATIONS: Record<ChemistryFormType, 'chemistryMix' | 'coa'> = {
  CHEMISTRY_MIX: 'chemistryMix',
  COA: 'coa',
};

function detailsDelegate(prisma: PrismaService, t: FormType) {
  switch (t) {
    case 'CHEMISTRY_MIX':
      return prisma.chemistryMixDetails;
    case 'COA':
      return prisma.cOADetails;
    default:
      throw new BadRequestException(`Unsupported formType: ${t}`);
  }
}

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
  if (r.formType === 'COA') return r.coa ?? null;
  return r.chemistryMix ?? null;
}
function flattenReport(r: any) {
  const { chemistryMix, coa, ...base } = r;

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
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_REVIEW: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['CLIENT_NEEDS_CORRECTION', 'APPROVED'],
    nextEditableBy: ['ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_CLIENT_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: ['CLIENT', 'SYSTEMADMIN'],
  },

  RESUBMISSION_BY_CLIENT: {
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['ADMIN', 'QA', 'CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_REVIEW', 'FRONTDESK_ON_HOLD'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
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
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'UNDER_QA_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    canEdit: ['CHEMISTRY', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
  },
  TESTING_ON_HOLD: {
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ['CLIENT', 'SYSTEMADMIN'],
    next: ['UNDER_CLIENT_CORRECTION'],
    nextEditableBy: ['CLIENT', 'SYSTEMADMIN'],
    canEdit: [],
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    canSet: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    next: ['UNDER_RESUBMISSION_QA_REVIEW', 'QA_NEEDS_CORRECTION'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
    canEdit: ['CHEMISTRY', 'MC', 'ADMIN', 'QA', 'SYSTEMADMIN'],
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
    canSet: ['QA', 'SYSTEMADMIN', 'CHEMISTRY', 'MC'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CHEMISTRY', 'MC', 'SYSTEMADMIN'],
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
    canSet: ['ADMIN', 'SYSTEMADMIN', 'QA'],
    next: [],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN', 'QA'],
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
};

const EDIT_MAP: Record<UserRole, string[]> = {
  SYSTEMADMIN: ['*'],
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
    'coaRows',
  ],
  QA: [
    'dateReceived',
    'sop',
    'results',
    'dateTested',
    'initial',
    'comments',
    'actives',
    'dateCompleted',
  ],
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
    'stabilityNote',
    'comments',
    'actives',
    'formulaContent',
    'coaRows',
  ],
  MICRO: [],
  MC: [
    'dateReceived',
    'sop',
    'results',
    'dateTested',
    'initial',
    'comments',
    'testedBy',
    'testedDate',
    'actives',
    'coaRows',
  ],
};

const STATUSES_REQUIRING_ESIGN = new Set<ChemistryReportStatus>([
  'UNDER_CLIENT_REVIEW',
  'LOCKED',
  'VOID', // ✅ add
]);

const STATUSES_REQUIRING_REASON = new Set<ChemistryReportStatus>([
  'UNDER_CLIENT_REVIEW',
  'LOCKED',
  'VOID', // ✅ add
]);

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
      return tx.chemistryMixDetails.update({ where: { chemistryId }, data });

    case 'COA':
      return tx.cOADetails.update({ where: { chemistryId }, data }); // ✅ Prisma client name is cOADetails
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

function extractSelectedActives(actives: any): string[] {
  if (!Array.isArray(actives)) return [];
  return actives
    .filter((a) => a && (a.checked === true || a.selected === true))
    .map((a) => String(a.label ?? a.name ?? a.active ?? '').trim())
    .filter(Boolean);
}

@Injectable()
export class ChemistryReportsService {
  // Service methods would go here
  constructor(
    private readonly reportsGateway: ReportsGateway,
    private readonly prisma: PrismaService,
    private readonly esign: ESignService,
    private readonly attachments: ChemistryAttachmentsService,
    private readonly chemistryNotifications: ChemistryReportNotificationsService,
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
    if (!['ADMIN', 'CLIENT'].includes(user.role)) {
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
        clientCode,
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
      include: {
        chemistryMix: true, // ✅ REQUIRED
        coa: true,
      },
    });
    const flat = flattenReport(created);
    this.reportsGateway.notifyReportCreated(flat);
    return flat;
  }

  async get(id: string) {
    const r = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
        coa: true,
      },
    });
    if (!r) throw new NotFoundException('Report not found');
    return flattenReport(r);
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

  // async findAll() {
  //   const reports = await this.prisma.chemistryReport.findMany({
  //     orderBy: { createdAt: 'desc' },
  //     include: {
  //       chemistryMix: true,
  //     },
  //   });
  //   return reports.map(flattenReport);
  // }

  async findAll() {
    const reports = await this.prisma.chemistryReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        chemistryMix: true,
        coa: true,
      },
    });

    return reports.map((r) => {
      const flat = flattenReport(r);
      const selectedActives = extractSelectedActives((flat as any).actives);

      return {
        ...flat,
        selectedActives, // ✅ array
        selectedActivesText: selectedActives.join(', '), // ✅ optional string
      };
    });
  }

  async update(
    user: { userId: string; role: UserRole },
    id: string,
    patchIn: any,
  ) {
    const current = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: { chemistryMix: true, coa: true },
    });
    if (!current) throw new BadRequestException('Report not found');

    if (
      (current.status === 'LOCKED' || current.status === 'VOID') &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException(
        'Report is locked/void and cannot be edited',
      );
    }

    const ctx = getRequestContext() || {};

    const {
      reason: _reasonFromBody,
      eSignPassword: _pwdFromBody,
      expectedVersion,
      ...patch
    } = { ...patchIn };

    // ✅ optimistic locking: require version for non-admin edits
    if (
      !['ADMIN', 'SYSTEMADMIN'].includes(user.role) &&
      typeof expectedVersion !== 'number'
    ) {
      throw new BadRequestException('expectedVersion is required');
    }

    // field-level permissions (ignore 'status' here)
    const fieldKeys = Object.keys(patch).filter((f) => f !== 'status');

    // Clients can edit any field while in DRAFT
    // Clients and System Admin can edit any field while in DRAFT
    const canEditAnyDraft =
      (user.role === 'CLIENT' || user.role === 'SYSTEMADMIN') &&
      (current.status === 'DRAFT' || current.status === 'UNDER_DRAFT_REVIEW');

    if (!canEditAnyDraft) {
      const bad = allowedForRole(user.role, fieldKeys);
      if (bad.length) {
        throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);
      }
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
      const targetStatus = patchIn.status as ChemistryReportStatus;

      if (
        targetStatus === 'CHANGE_REQUESTED' ||
        targetStatus === 'CORRECTION_REQUESTED'
      ) {
        base.workflowReturnStatus = current.status; // 🔥 where to go back
        base.workflowRequestKind =
          targetStatus === 'CHANGE_REQUESTED' ? 'CHANGE' : 'CORRECTION';
        base.workflowRequestedByRole = user.role;
        base.workflowRequestedAt = new Date();
      }

      const isVoid = targetStatus === 'VOID';

      const CENTRAL_REQUEST_STATUSES: ChemistryReportStatus[] = [
        'CHANGE_REQUESTED',
        'CORRECTION_REQUESTED',
      ];

      const CENTRAL_UPDATE_STATUSES: ChemistryReportStatus[] = [
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

        const voidRule = STATUS_TRANSITIONS.VOID;

        const allowed: UserRole[] = (voidRule?.canSet as
          | UserRole[]
          | undefined) ?? ['ADMIN', 'SYSTEMADMIN', 'QA', 'CLIENT'];

        if (!allowed.includes(user.role)) {
          throw new ForbiddenException(`Role ${user.role} cannot VOID reports`);
        }
      } else if (isCentralStatus) {
        // ✅ use centralized rule itself, not current state's rule
        const centralRule = STATUS_TRANSITIONS[targetStatus];
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
        // normal transitions
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

        const actor = await this.prisma.user.findUnique({
          where: { id: user.userId },
          select: {
            name: true,
            userId: true,
            email: true,
          },
        });
        const now = new Date();
        const n = seqPad(seq.lastNumber);
        base.reportNumber = `${deptLetter}-${yyyy()}${n}`;
        base.ReportnumberAssignedAt = new Date();
        base.ReportnumberAssignedBy =
          actor?.name?.trim() ||
          actor?.userId?.trim() ||
          actor?.email?.trim() ||
          'Unknown';

        // ✅ Auto-fill dateReceived at the same time as BC number assignment
        const currentDetails = pickDetails(current);
        const alreadyHasDateReceived = !!currentDetails?.dateReceived;
        const incomingDateReceived = details.dateReceived;

        if (!alreadyHasDateReceived && !incomingDateReceived) {
          details.dateReceived = now;
        }
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

    // const ops: Prisma.PrismaPromise<any>[] = [
    //   this.prisma.chemistryReport.update({
    //     where: { id },
    //     data: {
    //       ...base,
    //       updatedBy: user.userId,
    //     },
    //     include: { chemistryMix: true },
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

    // const prevStatus = String(current.status);

    // if (patchIn.status) {
    //   this.reportsGateway.notifyStatusChange(id, patchIn.status);
    // } else {
    //   this.reportsGateway.notifyReportUpdate(updated);
    // }

    // ✅ Step 1: attempt base update with version check
    const baseRes = await this.prisma.chemistryReport.updateMany({
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
    const updated = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: { chemistryMix: true, coa: true },
    });
    if (!updated) throw new NotFoundException('Report not found after update');

    const prevStatus = String(current.status);

    const newStatus = patchIn.status ? String(patchIn.status) : null;

    if (newStatus && prevStatus !== newStatus) {
      const ctx = getRequestContext() || {};

      const reason =
        (ctx as any).reason ?? _reasonFromBody ?? patchIn?.reason ?? null;

      await this.logChemStatusChange({
        chemistryReportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
        from: current.status as ChemistryReportStatus,
        to: patchIn.status as ChemistryReportStatus,
        reason,
        actorUserId: user.userId,
        actorRole: user.role,
      });
    }

    if (patchIn.status) {
      this.reportsGateway.notifyStatusChange(id, patchIn.status);
    } else {
      this.reportsGateway.notifyReportUpdate(updated);
    }

    if (patchIn.status && String(current.status) !== String(patchIn.status)) {
      const slug =
        current.formType === 'CHEMISTRY_MIX'
          ? 'chemistry-mix'
          : current.formType === 'COA'
            ? 'coa'
            : 'chemistry-mix';

      current.formType === 'CHEMISTRY_MIX'
        ? 'chemistry-mix'
        : current.formType === 'COA'
          ? 'coa'
          : 'chemistry-mix';

      const clientCode = current.clientCode ?? null;
      const clientName = pickDetails(current)?.client ?? '-'; // or '-' if you prefer

      await this.chemistryNotifications.onStatusChanged({
        formType: current.formType,
        reportId: current.id,
        formNumber: current.formNumber,
        clientName,
        clientCode,
        oldStatus: prevStatus,
        newStatus: String(patchIn.status),
        reportUrl: `${process.env.APP_URL}/chemistry-reports/${slug}/${current.id}`,
        actorUserId: user.userId,
      });
    }

    return flattenReport(updated);
  }

  // async updateStatus(
  //   user: { userId: string; role: UserRole },
  //   id: string,
  //   status: ChemistryReportStatus,
  // ) {
  //   return this.update(user, id, { status });
  // }

  async updateStatus(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      status: ChemistryReportStatus;
      reason?: string;
      eSignPassword?: string;
      expectedVersion?: number;
    },
  ) {
    return this.update(user, id, body);
  }

  private async logChemStatusChange(args: {
    chemistryReportId: string;
    clientCode: string | null;
    formType: FormType;
    formNumber: string;
    reportNumber: string | null;
    from: ChemistryReportStatus;
    to: ChemistryReportStatus;
    reason: string | null;
    actorUserId: string;
    actorRole: UserRole;
  }) {
    const ctx = getRequestContext();
    if (ctx?.skipAudit) return;

    await this.prisma.$transaction([
      this.prisma.chemistryReportStatusHistory.create({
        data: {
          chemistryId: args.chemistryReportId,
          from: args.from,
          to: args.to,
          reason: args.reason ?? null,
          userId: args.actorUserId,
          role: args.actorRole,
          ipAddress: ctx?.ip ?? null,
        },
      }),
      this.prisma.auditTrail.create({
        data: {
          action: 'STATUS_CHANGE',
          entity: args.formType, // CHEMISTRY_MIX or COA
          entityId: args.chemistryReportId,
          userId: args.actorUserId,
          role: args.actorRole,
          ipAddress: ctx?.ip ?? null,
          clientCode: args.clientCode ?? null,
          details: `Status changed: ${args.from} → ${args.to}`,
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

  async changeStatus(
    user: { userId: string; role: UserRole },
    id: string,
    input: ChangeStatusInput,
  ) {
    const current = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: { chemistryMix: true, coa: true },
    });
    if (!current) throw new NotFoundException('Report not found');

    const prevStatus = current.status;

    if (!['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN/SYSTEMADMIN/QA can Change Status this directly',
      );
    }

    const target: ChemistryReportStatus =
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

    if (!eSignPassword) {
      throw new BadRequestException(
        'Electronic Signature (password) is required for status changes',
      );
    }
    await this.esign.verifyPassword(user.userId, String(eSignPassword));

    // // ✅ validate transition properly
    // const trans = STATUS_TRANSITIONS[prevStatus as ChemistryReportStatus];
    // if (!trans) {
    //   throw new BadRequestException(`Invalid current status: ${prevStatus}`);
    // }
    // if (!trans.canSet.includes(user.role)) {
    //   throw new ForbiddenException(
    //     `Role ${user.role} cannot change status from ${prevStatus}`,
    //   );
    // }
    // if (!trans.next.includes(target)) {
    //   throw new BadRequestException(
    //     `Invalid transition: ${prevStatus} → ${target}`,
    //   );
    // }

    const transitions = STATUS_TRANSITIONS;
    const trans = transitions[prevStatus as ChemistryReportStatus];

    if (!trans) {
      throw new BadRequestException(
        `No transition config for status: ${prevStatus}`,
      );
    }

    const isVoid = target === 'VOID';

    if (isVoid) {
      if (prevStatus === 'VOID') {
        throw new BadRequestException('Report is already VOID');
      }

      const voidRule = transitions.VOID;

      const allowed: UserRole[] = (voidRule?.canSet as
        | UserRole[]
        | undefined) ?? ['ADMIN', 'SYSTEMADMIN', 'QA', 'CLIENT'];

      if (!allowed.includes(user.role)) {
        throw new ForbiddenException(`Role ${user.role} cannot VOID reports`);
      }
    }
    //  else {
    //   if (!trans.canSet.includes(user.role)) {
    //     throw new ForbiddenException(
    //       `Role ${user.role} cannot change status from ${prevStatus}`,
    //     );
    //   }
    //   if (!trans.next.includes(target)) {
    //     throw new BadRequestException(
    //       `Invalid transition: ${prevStatus} → ${target}`,
    //     );
    //   }
    // }

    const patch: any = { status: target };

    // ✅ report number assignment (same behavior as update())
    function yyyy(d: Date = new Date()): string {
      return String(d.getFullYear());
    }
    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    if (target === 'UNDER_TESTING_REVIEW' && !current.reportNumber) {
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
      const now = new Date();
      patch.reportNumber = `${deptLetter}-${yyyy()}${seqPad(seq.lastNumber)}`;
      patch.ReportnumberAssignedAt = new Date();
      patch.ReportnumberAssignedBy =
        actor?.name?.trim() ||
        actor?.userId?.trim() ||
        actor?.email?.trim() ||
        'Unknown';

      const currentDetails = pickDetails(current);
      if (!currentDetails?.dateReceived) {
        await updateDetailsByType(this.prisma, current.formType, id, {
          dateReceived: now,
        });
      }
    }

    if (target === 'LOCKED') patch.lockedAt = new Date();

    const updated = await this.prisma.chemistryReport.update({
      where: { id },
      data: { ...patch, updatedBy: user.userId },
      include: { chemistryMix: true, coa: true },
    });

    // ✅ log StatusHistory + AuditTrail
    if (prevStatus !== target) {
      await this.logChemStatusChange({
        chemistryReportId: current.id,
        clientCode: current.clientCode ?? null,
        formType: current.formType,
        formNumber: current.formNumber,
        reportNumber: updated.reportNumber ?? current.reportNumber ?? null,
        from: prevStatus as ChemistryReportStatus,
        to: target,
        reason: reason ?? null,
        actorUserId: user.userId,
        actorRole: user.role,
      });
    }

    // ✅ websocket
    this.reportsGateway.notifyStatusChange(id, target);

    // ✅ OPTIONAL: send same email notification as update()
    if (prevStatus !== target) {
      const slug =
        current.formType === 'CHEMISTRY_MIX'
          ? 'chemistry-mix'
          : current.formType === 'COA'
            ? 'coa'
            : 'chemistry-mix';

      const clientName = pickDetails(current)?.client ?? '-';

      await this.chemistryNotifications.onStatusChanged({
        formType: current.formType,
        reportId: current.id,
        formNumber: current.formNumber,
        clientName,
        clientCode: current.clientCode ?? null,
        oldStatus: String(prevStatus),
        newStatus: String(target),
        reportUrl: `${process.env.APP_URL}/chemistry-reports/${slug}/${current.id}`,
        actorUserId: user.userId,
      });
    }

    return flattenReport(updated);
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

  // reports.service.ts
  async listAttachments(id: string) {
    return this.attachments.listForReport(id);
  }

  // POST /reports/:id/corrections
  async createCorrections(
    user: { userId: string; role: UserRole },
    id: string,
    body: {
      items: { fieldKey: string; message: string; oldValue?: any | null }[];
      targetStatus?: ChemistryReportStatus;
      reason?: string;
      expectedVersion?: number;
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
        coa: true,
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
      });
    }

    return nextCorrections;
  }

  async listCorrections(id: string) {
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id },
      include: {
        chemistryMix: true,
        coa: true,
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
        coa: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    const d = pickDetails(report) || { corrections: [] };
    const arr = this._getCorrectionsArray(d);
    const idx = arr.findIndex((c) => c.id === cid);
    if (idx < 0) throw new NotFoundException('Correction not found');

    const allowedResolvers: UserRole[] = [
      'CLIENT',
      'CHEMISTRY',
      'FRONTDESK',
      'MC',
      'QA',
      'ADMIN',
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
      await this.prisma.chemistryReport.update({
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

      await this.logChemStatusChange({
        chemistryReportId: report.id,
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

    // this.reportsGateway.notifyReportUpdate({ id });
    return { ok: true };
  }
}
