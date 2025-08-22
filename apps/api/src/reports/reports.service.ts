import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ReportStatus, UserRole } from '@prisma/client';

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
    'testSopNo',
  ],
  MICRO: [
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tbc_spec',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'tmy_spec',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'testedBy',
    'testedDate',
    'comments',
  ],
  CHEMISTRY: [
    'tbc_dilution',
    'tbc_gram',
    'tbc_result',
    'tbc_spec',
    'tmy_dilution',
    'tmy_gram',
    'tmy_result',
    'tmy_spec',
    'pathogens',
    'dateTested',
    'preliminaryResults',
    'preliminaryResultsDate',
    'testedBy',
    'testedDate',
    'comments',
  ],
  QA: ['dateCompleted', 'reviewedBy', 'reviewedDate', 'comments', 'status'],
  CLIENT: [
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'description',
    'lotNo',
    'manufactureDate',
    'testSopNo',
  ],
};

// ----------------------------
// Workflow transitions
// ----------------------------
const STATUS_TRANSITIONS: Record<
  ReportStatus,
  { next: ReportStatus[]; canSet: UserRole[]; nextEditableBy: UserRole[] }
> = {
  DRAFT: {
    canSet: ['CLIENT', 'FRONTDESK', 'ADMIN', 'SYSTEMADMIN'],
    next: ['SUBMITTED_BY_CLIENT', 'CLIENT_NEEDS_CORRECTION'],
    nextEditableBy: ['CLIENT', 'FRONTDESK'],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ['CLIENT'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK'],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ['FRONTDESK'],
    next: ['UNDER_TESTING_REVIEW', 'FRONTDESK_ON_HOLD', 'FRONTDESK_REJECTED'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ['FRONTDESK'],
    next: ['RECEIVED_BY_FRONTDESK'],
    nextEditableBy: ['FRONTDESK'],
  },
  FRONTDESK_REJECTED: {
    canSet: ['FRONTDESK'],
    next: ['CLIENT_NEEDS_CORRECTION'],
    nextEditableBy: ['CLIENT'],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ['CLIENT'],
    next: ['SUBMITTED_BY_CLIENT'],
    nextEditableBy: ['CLIENT'],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ['MICRO', 'CHEMISTRY'],
    next: ['TESTING_ON_HOLD', 'TESTING_REJECTED', 'UNDER_QA_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
  },
  TESTING_ON_HOLD: {
    canSet: ['MICRO', 'CHEMISTRY'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
  },
  TESTING_REJECTED: {
    canSet: ['MICRO', 'CHEMISTRY'],
    next: ['FRONTDESK_ON_HOLD', 'FRONTDESK_REJECTED'],
    nextEditableBy: ['FRONTDESK'],
  },
  UNDER_QA_REVIEW: {
    canSet: ['QA'],
    next: ['QA_NEEDS_CORRECTION', 'QA_REJECTED', 'UNDER_ADMIN_REVIEW'],
    nextEditableBy: ['QA'],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ['QA'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
  },
  QA_REJECTED: {
    canSet: ['QA'],
    next: ['UNDER_TESTING_REVIEW'],
    nextEditableBy: ['MICRO', 'CHEMISTRY'],
  },
  UNDER_ADMIN_REVIEW: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'APPROVED'],
    nextEditableBy: ['ADMIN', 'SYSTEMADMIN'],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
  },
  ADMIN_REJECTED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['UNDER_QA_REVIEW'],
    nextEditableBy: ['QA'],
  },
  APPROVED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: ['LOCKED'],
    nextEditableBy: [],
  },
  LOCKED: {
    canSet: ['ADMIN', 'SYSTEMADMIN'],
    next: [],
    nextEditableBy: [],
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

// ----------------------------
// Reports Service
// ----------------------------
@Injectable()
export class ReportsService {
  async createDraft(user: { userId: string; role: UserRole }, body: any) {
    if (
      !['FRONTDESK', 'ADMIN', 'SYSTEMADMIN', 'MICRO', 'CLIENT'].includes(
        user.role,
      )
    ) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const prefix = 'M';
    const last = await prisma.microMixReport.findFirst({
      where: { prefix },
      orderBy: { reportNumber: 'desc' },
    });
    const nextNumber = (last?.reportNumber ?? 0) + 1;

    return prisma.microMixReport.create({
      data: {
        ...this._coerce(body),
        status: 'DRAFT',
        createdBy: user.userId,
        updatedBy: user.userId,
        prefix,
        reportNumber: nextNumber,
      },
    });
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

      // patch.nextEditableBy = STATUS_TRANSITIONS[patch.status].nextEditableBy;

      if (patch.status === 'LOCKED') {
        patch.lockedAt = new Date();
      }
    }

    return prisma.microMixReport.update({
      where: { id },
      data: { ...this._coerce(patch), updatedBy: user.userId },
    });
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
      orderBy: { reportNumber: 'desc' },
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
      if (copy[k] === '' || copy[k] === undefined) {
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
}
