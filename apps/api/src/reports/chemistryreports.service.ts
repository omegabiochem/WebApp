import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ChemistryReportStatus,
  FormType,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { copy } from 'fs-extra';
import { get } from 'http';
import { PrismaService } from 'prisma/prisma.service';
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
    next: [
      'TESTING_ON_HOLD',
      'TESTING_NEEDS_CORRECTION',
      'UNDER_CLIENT_REVIEW',
    ],
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

@Injectable()
export class ChemistryReportsService {
  // Service methods would go here
  constructor(private readonly prisma: PrismaService) {}

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

    const dateKeys = [
      'dateSent',
      'manufactureDate',
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

    // const ctx = getRequestContext() || {};

    // Split base-vs-details
    const { base, details } = splitPatch(this._coerce(patchIn));

    if (patchIn.status) {
      const trans = STATUS_TRANSITIONS[current.status];
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
}
