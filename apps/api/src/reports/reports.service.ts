import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, ReportStatus } from '@prisma/client';
const prisma = new PrismaClient();

function isLocked(status: ReportStatus) {
  return status === 'LOCKED';
}

@Injectable()
export class ReportsService {
  async create(user: any, dto: any) {
    // FRONTDESK, ADMIN, SYSTEMADMIN
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create reports');
    }
    return prisma.report.create({
      data: {
        client: dto.client,
        dateSent: dto.dateSent ? new Date(dto.dateSent) : null,
        testType: dto.testType ?? null,
        sampleType: dto.sampleType ?? null,
        formulaNo: dto.formulaNo ?? null,
        description: dto.description ?? null,
        lotNo: dto.lotNo ?? null,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : null,
        testSop: dto.testSop ?? null,
        dateTested: dto.dateTested ? new Date(dto.dateTested) : null,
        preliminaryResults: dto.preliminaryResults ?? null,
        preliminaryDate: dto.preliminaryDate ? new Date(dto.preliminaryDate) : null,
        dateCompleted: dto.dateCompleted ? new Date(dto.dateCompleted) : null,
      }
    });
  }

  async get(id: string) {
    const r = await prisma.report.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async list() {
    return prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateHeader(user: any, id: string, dto: any) {
    const r = await this.get(id);
    if (isLocked(r.status)) throw new BadRequestException('Locked');

    if (!['FRONTDESK','ADMIN','SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed');
    }
    return prisma.report.update({
      where: { id },
      data: {
        client: dto.client ?? r.client,
        dateSent: dto.dateSent ? new Date(dto.dateSent) : r.dateSent,
        testType: dto.testType ?? r.testType,
        sampleType: dto.sampleType ?? r.sampleType,
        formulaNo: dto.formulaNo ?? r.formulaNo,
        description: dto.description ?? r.description,
        lotNo: dto.lotNo ?? r.lotNo,
        manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : r.manufactureDate,
        testSop: dto.testSop ?? r.testSop,
        dateTested: dto.dateTested ? new Date(dto.dateTested) : r.dateTested,
        preliminaryResults: dto.preliminaryResults ?? r.preliminaryResults,
        preliminaryDate: dto.preliminaryDate ? new Date(dto.preliminaryDate) : r.preliminaryDate,
        dateCompleted: dto.dateCompleted ? new Date(dto.dateCompleted) : r.dateCompleted,
      }
    });
  }

  async updateMicroChem(user: any, id: string, dto: any) {
    const r = await this.get(id);
    if (isLocked(r.status)) throw new BadRequestException('Locked');

    if (!['MICRO','CHEMISTRY','ADMIN','SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed');
    }
    return prisma.report.update({
      where: { id },
      data: {
        totalBacterialCount: dto.totalBacterialCount ?? r.totalBacterialCount,
        totalMoldYeastCount: dto.totalMoldYeastCount ?? r.totalMoldYeastCount,
        pathogen_ecoli: dto.pathogen_ecoli ?? r.pathogen_ecoli,
        pathogen_paeruginosa: dto.pathogen_paeruginosa ?? r.pathogen_paeruginosa,
        pathogen_saureus: dto.pathogen_saureus ?? r.pathogen_saureus,
        pathogen_salmonella: dto.pathogen_salmonella ?? r.pathogen_salmonella,
        pathogen_clostridia: dto.pathogen_clostridia ?? r.pathogen_clostridia,
        pathogen_calbicans: dto.pathogen_calbicans ?? r.pathogen_calbicans,
        pathogen_bcepacia: dto.pathogen_bcepacia ?? r.pathogen_bcepacia,
        pathogen_other: dto.pathogen_other ?? r.pathogen_other,
        comments: dto.comments ?? r.comments,
        testedByUserId: user.userId,
        testedAt: new Date(),
        status: r.status === 'DRAFT' ? 'SUBMITTED' : r.status, // auto-progress after data entry
      }
    });
  }

  async qaApprove(user: any, id: string) {
    const r = await this.get(id);
    if (isLocked(r.status)) throw new BadRequestException('Locked');

    if (!['QA','ADMIN','SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed');
    }
    if (r.status !== 'SUBMITTED') {
      throw new BadRequestException('Must be SUBMITTED first');
    }
    return prisma.report.update({
      where: { id },
      data: { reviewedByUserId: user.userId, reviewedAt: new Date(), status: 'QA_APPROVED' }
    });
  }

  async lock(user: any, id: string) {
    const r = await this.get(id);
    if (!['QA','ADMIN','SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException('Not allowed');
    }
    if (r.status !== 'QA_APPROVED') {
      throw new BadRequestException('Must be QA_APPROVED to lock');
    }
    return prisma.report.update({ where: { id }, data: { status: 'LOCKED' } });
  }
}
