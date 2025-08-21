import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ReportStatus, UserRole } from '@prisma/client';
const prisma = new PrismaClient();

// Which roles may edit which fields
const EDIT_MAP: Record<UserRole, string[]> = {
  SYSTEMADMIN: ['*'],
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
  CLIENT: [],
};

function allowedForRole(role: UserRole, fields: string[]) {
  if (EDIT_MAP[role]?.includes('*')) return [];
  const disallowed = fields.filter((f) => !EDIT_MAP[role]?.includes(f));
  return disallowed;
}

@Injectable()
export class ReportsService {
  async createDraft(user: { userId: string; role: UserRole }, body: any) {
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN', 'MICRO'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    // Always prefix = "M"
    const prefix = 'M';

    // Get last MICRO report
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

    const fields = Object.keys(patch);
    const bad = allowedForRole(user.role, fields);
    if (bad.length)
      throw new ForbiddenException(`You cannot edit: ${bad.join(', ')}`);

    // status transitions (QA controls)
    if (patch.status) {
      const allowedStatus: ReportStatus[] = [
        'DRAFT',
        'IN_REVIEW',
        'APPROVED',
        'LOCKED',
      ];
      if (!allowedStatus.includes(patch.status))
        throw new BadRequestException('Invalid status');
      if (!['QA', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
        throw new ForbiddenException(
          'Only QA/Admin/SystemAdmin can change status',
        );
      }
      if (current.status === 'LOCKED' && patch.status !== 'LOCKED') {
        throw new ForbiddenException('Locked report cannot be unlocked');
      }
      if (patch.status === 'LOCKED') {
        patch.lockedAt = new Date();
      }
    }

    return prisma.microMixReport.update({
      where: { id },
      data: { ...this._coerce(patch), updatedBy: user.userId },
    });
  }

  async findAll() {
    return prisma.microMixReport.findMany({
      orderBy: { reportNumber: 'desc' }, // newest first
    });
  }

  // Convert date strings (yyyy-mm-dd or mm/dd/yyyy) into Date
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
        copy[k] = null; // ✅ convert empty string to null
      } else if (typeof copy[k] === 'string') {
        const d = new Date(copy[k]);
        if (!isNaN(d.getTime())) {
          copy[k] = d; // ✅ valid ISO string becomes Date
        } else {
          copy[k] = null;
        }
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
