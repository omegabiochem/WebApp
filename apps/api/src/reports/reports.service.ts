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

// import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaClient, ReportStatus } from '@prisma/client';

// const prisma = new PrismaClient();

// function isLocked(status: ReportStatus) { return status === 'LOCKED'; }

// @Injectable()
// export class ReportsService {
//   // CREATE — Frontdesk/Admin/SystemAdmin only
//   async create(user: any, dto: any) {
//     this.mustHaveRole(user, ['FRONTDESK','ADMIN','SYSTEMADMIN']);
//     return prisma.report.create({
//       data: {
//         client: dto.client,
//         dateSent: this.d(dto.dateSent),
//         testType: dto.testType ?? null,
//         sampleType: dto.sampleType ?? null,
//         formulaNo: dto.formulaNo ?? null,
//         description: dto.description ?? null,
//         lotNo: dto.lotNo ?? null,
//         manufactureDate: this.d(dto.manufactureDate),
//         testSop: dto.testSop ?? null,
//         dateTested: this.d(dto.dateTested),
//         preliminaryResults: dto.preliminaryResults ?? null,
//         preliminaryDate: this.d(dto.preliminaryDate),
//         dateCompleted: this.d(dto.dateCompleted),
//       }
//     });
//   }

//   async get(id: string) {
//     const r = await prisma.report.findUnique({ where: { id } });
//     if (!r) throw new NotFoundException('Report not found');
//     return r;
//   }

//   list() {
//     return prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
//   }

//   // HEADER — Frontdesk/Admin/SystemAdmin, not LOCKED
//   async updateHeader(user: any, id: string, dto: any) {
//     const r = await this.get(id);
//     this.mustNotBeLocked(r);
//     this.mustHaveRole(user, ['FRONTDESK','ADMIN','SYSTEMADMIN']);

//     return prisma.report.update({
//       where: { id },
//       data: {
//         client: dto.client ?? r.client,
//         dateSent: this.d(dto.dateSent, r.dateSent),
//         testType: this.s(dto.testType, r.testType),
//         sampleType: this.s(dto.sampleType, r.sampleType),
//         formulaNo: this.s(dto.formulaNo, r.formulaNo),
//         description: this.s(dto.description, r.description),
//         lotNo: this.s(dto.lotNo, r.lotNo),
//         manufactureDate: this.d(dto.manufactureDate, r.manufactureDate),
//         testSop: this.s(dto.testSop, r.testSop),
//         dateTested: this.d(dto.dateTested, r.dateTested),
//         preliminaryResults: this.s(dto.preliminaryResults, r.preliminaryResults),
//         preliminaryDate: this.d(dto.preliminaryDate, r.preliminaryDate),
//         dateCompleted: this.d(dto.dateCompleted, r.dateCompleted),
//       }
//     });
//   }

//   // MICRO/CHEM — Micro/Chem/Admin/SystemAdmin, not LOCKED
//   async updateMicro(user: any, id: string, dto: any) {
//     const r = await this.get(id);
//     this.mustNotBeLocked(r);
//     this.mustHaveRole(user, ['MICRO','CHEMISTRY','ADMIN','SYSTEMADMIN']);

//     const updated = await prisma.report.update({
//       where: { id },
//       data: {
//         tbcDilution: this.s(dto.tbcDilution, r.tbcDilution),
//         tbcGramStain: this.s(dto.tbcGramStain, r.tbcGramStain),
//         tbcResult: this.s(dto.tbcResult, r.tbcResult),

//         tmycDilution: this.s(dto.tmycDilution, r.tmycDilution),
//         tmycGramStain: this.s(dto.tmycGramStain, r.tmycGramStain),
//         tmycResult: this.s(dto.tmycResult, r.tmycResult),

//         pathogen_ecoli: this.s(dto.pathogen_ecoli, r.pathogen_ecoli),
//         pathogen_paeruginosa: this.s(dto.pathogen_paeruginosa, r.pathogen_paeruginosa),
//         pathogen_saureus: this.s(dto.pathogen_saureus, r.pathogen_saureus),
//         pathogen_salmonella: this.s(dto.pathogen_salmonella, r.pathogen_salmonella),
//         pathogen_clostridia: this.s(dto.pathogen_clostridia, r.pathogen_clostridia),
//         pathogen_calbicans: this.s(dto.pathogen_calbicans, r.pathogen_calbicans),
//         pathogen_bcepacia: this.s(dto.pathogen_bcepacia, r.pathogen_bcepacia),
//         pathogen_other: this.s(dto.pathogen_other, r.pathogen_other),

//         comments: this.s(dto.comments, r.comments),

//         testedByUserId: user.userId,
//         testedAt: new Date(),

//         // auto-progress once Micro/Chem enters data
//         status: r.status === 'DRAFT' ? 'SUBMITTED' : r.status,
//       }
//     });

//     return updated;
//   }

//   // QA APPROVE — QA/Admin/SystemAdmin only; from SUBMITTED
//   async qaApprove(user: any, id: string) {
//     const r = await this.get(id);
//     this.mustHaveRole(user, ['QA','ADMIN','SYSTEMADMIN']);
//     if (r.status !== 'SUBMITTED') throw new BadRequestException('Must be SUBMITTED first');

//     return prisma.report.update({
//       where: { id },
//       data: { reviewedByUserId: user.userId, reviewedAt: new Date(), status: 'QA_APPROVED' }
//     });
//   }

//   // LOCK — QA/Admin/SystemAdmin only; from QA_APPROVED
//   async lock(user: any, id: string) {
//     const r = await this.get(id);
//     this.mustHaveRole(user, ['QA','ADMIN','SYSTEMADMIN']);
//     if (r.status !== 'QA_APPROVED') throw new BadRequestException('Must be QA_APPROVED to lock');

//     return prisma.report.update({ where: { id }, data: { status: 'LOCKED' } });
//   }

//   // --- helpers ---
//   private mustHaveRole(user: any, roles: string[]) {
//     if (!user?.role || !roles.includes(user.role)) throw new ForbiddenException('Not allowed');
//   }
//   private mustNotBeLocked(r: { status: ReportStatus }) {
//     if (isLocked(r.status)) throw new BadRequestException('Report is locked');
//   }
//   private d(v?: string, fallback?: Date | null) { return v ? new Date(v) : (fallback ?? null); }
//   private s(v?: string, fallback?: string | null) { return v ?? (fallback ?? null); }
// }

// // import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
// // import { PrismaClient, ReportStatus } from '@prisma/client';
// // const prisma = new PrismaClient();

// // function isLocked(status: ReportStatus) {
// //   return status === 'LOCKED';
// // }

// // @Injectable()
// // export class ReportsService {
// //   async create(user: any, dto: any) {
// //     // FRONTDESK, ADMIN, SYSTEMADMIN
// //     if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
// //       throw new ForbiddenException('Not allowed to create reports');
// //     }
// //     return prisma.report.create({
// //       data: {
// //         client: dto.client,
// //         dateSent: dto.dateSent ? new Date(dto.dateSent) : null,
// //         testType: dto.testType ?? null,
// //         sampleType: dto.sampleType ?? null,
// //         formulaNo: dto.formulaNo ?? null,
// //         description: dto.description ?? null,
// //         lotNo: dto.lotNo ?? null,
// //         manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : null,
// //         testSop: dto.testSop ?? null,
// //         dateTested: dto.dateTested ? new Date(dto.dateTested) : null,
// //         preliminaryResults: dto.preliminaryResults ?? null,
// //         preliminaryDate: dto.preliminaryDate ? new Date(dto.preliminaryDate) : null,
// //         dateCompleted: dto.dateCompleted ? new Date(dto.dateCompleted) : null,
// //       }
// //     });
// //   }

// //   async get(id: string) {
// //     const r = await prisma.report.findUnique({ where: { id } });
// //     if (!r) throw new NotFoundException('Report not found');
// //     return r;
// //   }

// //   async list() {
// //     return prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
// //   }

// //   async updateHeader(user: any, id: string, dto: any) {
// //     const r = await this.get(id);
// //     if (isLocked(r.status)) throw new BadRequestException('Locked');

// //     if (!['FRONTDESK','ADMIN','SYSTEMADMIN'].includes(user.role)) {
// //       throw new ForbiddenException('Not allowed');
// //     }
// //     return prisma.report.update({
// //       where: { id },
// //       data: {
// //         client: dto.client ?? r.client,
// //         dateSent: dto.dateSent ? new Date(dto.dateSent) : r.dateSent,
// //         testType: dto.testType ?? r.testType,
// //         sampleType: dto.sampleType ?? r.sampleType,
// //         formulaNo: dto.formulaNo ?? r.formulaNo,
// //         description: dto.description ?? r.description,
// //         lotNo: dto.lotNo ?? r.lotNo,
// //         manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : r.manufactureDate,
// //         testSop: dto.testSop ?? r.testSop,
// //         dateTested: dto.dateTested ? new Date(dto.dateTested) : r.dateTested,
// //         preliminaryResults: dto.preliminaryResults ?? r.preliminaryResults,
// //         preliminaryDate: dto.preliminaryDate ? new Date(dto.preliminaryDate) : r.preliminaryDate,
// //         dateCompleted: dto.dateCompleted ? new Date(dto.dateCompleted) : r.dateCompleted,
// //       }
// //     });
// //   }

// //   async updateMicroChem(user: any, id: string, dto: any) {
// //     const r = await this.get(id);
// //     if (isLocked(r.status)) throw new BadRequestException('Locked');

// //     if (!['MICRO','CHEMISTRY','ADMIN','SYSTEMADMIN'].includes(user.role)) {
// //       throw new ForbiddenException('Not allowed');
// //     }
// //     return prisma.report.update({
// //       where: { id },
// //       data: {
// //         totalBacterialCount: dto.totalBacterialCount ?? r.totalBacterialCount,
// //         totalMoldYeastCount: dto.totalMoldYeastCount ?? r.totalMoldYeastCount,
// //         pathogen_ecoli: dto.pathogen_ecoli ?? r.pathogen_ecoli,
// //         pathogen_paeruginosa: dto.pathogen_paeruginosa ?? r.pathogen_paeruginosa,
// //         pathogen_saureus: dto.pathogen_saureus ?? r.pathogen_saureus,
// //         pathogen_salmonella: dto.pathogen_salmonella ?? r.pathogen_salmonella,
// //         pathogen_clostridia: dto.pathogen_clostridia ?? r.pathogen_clostridia,
// //         pathogen_calbicans: dto.pathogen_calbicans ?? r.pathogen_calbicans,
// //         pathogen_bcepacia: dto.pathogen_bcepacia ?? r.pathogen_bcepacia,
// //         pathogen_other: dto.pathogen_other ?? r.pathogen_other,
// //         comments: dto.comments ?? r.comments,
// //         testedByUserId: user.userId,
// //         testedAt: new Date(),
// //         status: r.status === 'DRAFT' ? 'SUBMITTED' : r.status, // auto-progress after data entry
// //       }
// //     });
// //   }

// //   async qaApprove(user: any, id: string) {
// //     const r = await this.get(id);
// //     if (isLocked(r.status)) throw new BadRequestException('Locked');

// //     if (!['QA','ADMIN','SYSTEMADMIN'].includes(user.role)) {
// //       throw new ForbiddenException('Not allowed');
// //     }
// //     if (r.status !== 'SUBMITTED') {
// //       throw new BadRequestException('Must be SUBMITTED first');
// //     }
// //     return prisma.report.update({
// //       where: { id },
// //       data: { reviewedByUserId: user.userId, reviewedAt: new Date(), status: 'QA_APPROVED' }
// //     });
// //   }

// //   async lock(user: any, id: string) {
// //     const r = await this.get(id);
// //     if (!['QA','ADMIN','SYSTEMADMIN'].includes(user.role)) {
// //       throw new ForbiddenException('Not allowed');
// //     }
// //     if (r.status !== 'QA_APPROVED') {
// //       throw new BadRequestException('Must be QA_APPROVED to lock');
// //     }
// //     return prisma.report.update({ where: { id }, data: { status: 'LOCKED' } });
// //   }
// // }
