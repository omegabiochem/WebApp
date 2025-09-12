import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ReportStatus, UserRole } from '@prisma/client';
import { ReportsGateway } from './reports.gateway';

const prisma = new PrismaClient();

// ----------------------------
// Which roles may edit which fields
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
    'pathogens'
  ],
};

// ----------------------------
// Workflow transitions
// ----------------------------
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
    canSet: ['CLIENT', 'FRONTDESK', 'ADMIN', 'SYSTEMADMIN'],
    next: ['SUBMITTED_BY_CLIENT', 'CLIENT_NEEDS_CORRECTION'],
    nextEditableBy: ['CLIENT', 'FRONTDESK'],
    canEdit: ['CLIENT'],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['FRONTDESK', 'MICRO'],
    next: ['RECEIVED_BY_FRONTDESK', 'UNDER_TESTING_REVIEW'],
    nextEditableBy: ['FRONTDESK', 'MICRO'],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['UNDER_TESTING_REVIEW', 'FRONTDESK_ON_HOLD', 'FRONTDESK_REJECTED', 'SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
    canEdit: ['FRONTDESK'],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK'],
    canEdit: ['FRONTDESK'],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  FRONTDESK_REJECTED: {
    canSet: ['FRONTDESK', 'ADMIN'],
    next: ['CLIENT_NEEDS_CORRECTION'],
    nextEditableBy: ['CLIENT'],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ['CLIENT', 'ADMIN'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['CLIENT'],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ['MICRO', 'CHEMISTRY', 'ADMIN'],
    next: ['TESTING_ON_HOLD', "TESTING_NEEDS_CORRECTION", 'UNDER_QA_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
    canEdit: ['MICRO', 'CHEMISTRY'],
  },
  TESTING_ON_HOLD: {
    canSet: ['MICRO', 'CHEMISTRY', 'ADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ['MICRO', 'CHEMISTRY', 'ADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['CLIENT'],
    canEdit: ['CLIENT'],
  },
  TESTING_REJECTED: {
    canSet: ['MICRO', 'CHEMISTRY', 'ADMIN'],
    next: ['FRONTDESK_ON_HOLD', 'FRONTDESK_REJECTED'],
    nextEditableBy: ['FRONTDESK'],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ['QA', 'ADMIN'],
    next: ['QA_NEEDS_CORRECTION', 'QA_REJECTED', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: ['QA'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ['QA', 'ADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
    canEdit: [],
  },
  QA_REJECTED: {
    canSet: ['QA', 'ADMIN'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
    canEdit: [],
  },
  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'APPROVED'],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
    canEdit: [],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: [],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
    canEdit: [],
  },
  APPROVED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['LOCKED'],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
};

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
    case "MICRO":
      return "M";
    case "CHEMISTRY":
      return "C";
    default:
      return ""; // roles like ADMIN, QA, CLIENT don’t get lab letters
  }
}

// ----------------------------
// Reports Service
// ----------------------------
@Injectable()
export class ReportsService {
  constructor(private readonly reportsGateway: ReportsGateway) { }
  async createDraft(user: { userId: string; role: UserRole; clientCode?: string }, body: any) {
    if (
      !['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(
        user.role,
      )
    ) {
      throw new ForbiddenException('Not allowed to create report');
    }

    // ✅ get clientCode (must exist if CLIENT)
    const clientCode = user.clientCode ?? body.clientCode;
    if (!clientCode) {
      throw new BadRequestException('Client code is required to create a report');
    }


    // increment per-client sequence atomically
    const seq = await prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    const nextNumber = seq.lastNumber;
    const formNumber = `${clientCode}-${nextNumber.toString().padStart(4, '0')}`;


    // const prefix = 'M';
    // const last = await prisma.microMixReport.findFirst({
    //   where: { prefix },
    //   orderBy: { reportNumber: 'desc' },
    // });
    // const nextNumber = (last?.reportNumber ?? 0) + 1;

    const created = await prisma.microMixReport.create({
      data: {
        ...this._coerce(body),
        status: 'DRAFT',
        formNumber,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });

    // 🔥 notify in real-time
    this.reportsGateway.notifyReportCreated(created);

    return created;
  }

  async get(id: string) {
    const r = await prisma.microMixReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async update(
    user: { userId: string; role: UserRole },
    id: string,
    patch: any,
  ) {
    const current = await this.get(id);

    if (
      current.status === 'LOCKED' &&
      !['ADMIN', 'SYSTEMADMIN', 'QA'].includes(user.role)
    ) {
      throw new ForbiddenException('Report is locked');
    }

    // check field-level permissions
    const fields = Object.keys(patch).filter((f) => f !== 'status');
    // 👇 special rule: clients may edit ANY field while in draft
    if (!(user.role === 'CLIENT' && current.status === 'DRAFT')) {
      const bad = allowedForRole(user.role, fields);
      if (bad.length) {
        throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);
      }
    }

    // 🚨 New status-based editing check
    // 🚨 New status-based editing check (only for fields)
    if (fields.length > 0) {
      const transition = STATUS_TRANSITIONS[current.status];
      if (!transition) {
        throw new BadRequestException(
          `Invalid current status: ${current.status}`,
        );
      }

      if (!transition.canEdit.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} cannot edit report in status ${current.status}`,);
      }
    }

    // handle status transitions
    if (patch.status) {
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

      if (!currentTransition.next.includes(patch.status)) {
        throw new BadRequestException(
          `Invalid transition: ${current.status} → ${patch.status}`,
        );
      }


      if (patch.status === 'UNDER_TESTING_REVIEW') {
        const deptLetter = getDepartmentLetter(user.role);
        console.log('User role:', user.role);
        console.log('Department letter:', deptLetter);

        if (deptLetter) {
          // increment sequence per department
          const seq = await prisma.labReportSequence.upsert({
            where: { department: deptLetter },
            update: { lastNumber: { increment: 1 } },
            create: { department: deptLetter, lastNumber: 1 },
          });
          console.log('Sequence after upsert:', seq);

          // assign report number with prefix

          patch.reportNumber = `${deptLetter}-${seq.lastNumber
            .toString()
            .padStart(4, '0')}`;
        }
      }

      // patch.nextEditableBy = STATUS_TRANSITIONS[patch.status].nextEditableBy;

      if (patch.status === 'LOCKED') {
        patch.lockedAt = new Date();
      }
    }

    const updated = await prisma.microMixReport.update({
      where: { id },
      data: { ...this._coerce(patch), updatedBy: user.userId },
    });
    // 🔥 notify in real-time
    if (patch.status) {
      this.reportsGateway.notifyStatusChange(id, patch.status);
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
    // Reuse the same validation logic from update()
    return this.update(user, id, { status });
  }

  async findAll() {
    return prisma.microMixReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------
  // Coerce dates and JSON
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
      } catch { }
    }
    return copy;
  }
}
