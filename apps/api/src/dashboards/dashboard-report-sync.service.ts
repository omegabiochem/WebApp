import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class DashboardReportSyncService {
  constructor(private readonly prisma: PrismaService) {}

  private valueToText(value: any): string {
    if (value == null) return '';

    if (typeof value === 'string') return value;

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map((x) => this.valueToText(x)).join(' ');
    }

    if (typeof value === 'object') {
      return Object.values(value)
        .map((x) => this.valueToText(x))
        .join(' ');
    }

    return '';
  }

  private buildSearchText(input: Record<string, any>) {
    return Object.values(input)
      .map((v) => this.valueToText(v))
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private activesToText(value: any): string | null {
    if (value == null) return null;

    const getName = (x: any): string => {
      if (!x || typeof x !== 'object') return '';

      return String(
        x?.name ?? x?.active ?? x?.label ?? x?.title ?? x?.ingredient ?? '',
      ).trim();
    };

    const isSelected = (x: any): boolean => {
      if (!x || typeof x !== 'object') return false;

      return (
        x.selected === true ||
        x.checked === true ||
        x.enabled === true ||
        x.isSelected === true ||
        x.isChecked === true ||
        x.include === true ||
        x.included === true ||
        x.selected === 'true' ||
        x.checked === 'true' ||
        x.enabled === 'true' ||
        x.isSelected === 'true' ||
        x.isChecked === 'true' ||
        x.include === 'true' ||
        x.included === 'true'
      );
    };

    if (typeof value === 'string') {
      const text = value.trim();
      return text ? text : null;
    }

    if (Array.isArray(value)) {
      const selected = value
        .filter((x) => isSelected(x))
        .map((x) => getName(x))
        .filter(Boolean);

      return selected.length ? selected.join(', ') : null;
    }

    if (typeof value === 'object') {
      const selected = Object.values(value)
        .filter((x: any) => isSelected(x))
        .map((x: any) => getName(x))
        .filter(Boolean);

      return selected.length ? selected.join(', ') : null;
    }

    return null;
  }

  async syncMicroReport(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
      },
    });

    if (!report) {
      await this.removeMicroReport(reportId);
      return;
    }

    const details =
      report.microMix ?? report.microMixWater ?? report.sterility ?? null;

    const client = details?.client ?? null;

    const dateSent = details?.dateSent ?? null;
    const dateTested = details?.dateTested ?? null;

    const typeOfTest = (details as any)?.typeOfTest ?? null;
    const sampleType = (details as any)?.sampleType ?? null;
    const formulaNo = (details as any)?.formulaNo ?? null;
    const description = (details as any)?.description ?? null;
    const lotNo = (details as any)?.lotNo ?? null;
    const manufactureDate = (details as any)?.manufactureDate ?? null;
    const comments = (details as any)?.comments ?? null;
    const idNo = (details as any)?.idNo ?? null;
    const samplingDate = (details as any)?.samplingDate ?? null;
    const testedBy = (details as any)?.testedBy ?? null;
    const reviewedBy = (details as any)?.reviewedBy ?? null;

    const searchableText = this.buildSearchText({
      sourceType: 'MICRO_REPORT',
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber,
      client,
      clientCode: report.clientCode,
      status: report.status,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      idNo,
      samplingDate,
      testedBy,
      reviewedBy,
      comments,
      pathogens: (details as any)?.pathogens,
    });

    await this.prisma.dashboardReport.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: 'MICRO_REPORT',
          sourceId: report.id,
        },
      },
      create: {
        sourceType: 'MICRO_REPORT',
        sourceId: report.id,

        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber,
        client,
        clientCode: report.clientCode,
        status: String(report.status),
        version: report.version,

        dateSent,
        dateTested,
        dateReceived: null,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,

        typeOfTest,
        sampleType,
        formulaNo,
        description,
        lotNo,
        manufactureDate,
        comments,
        idNo,
        samplingDate,
        testedBy,
        reviewedBy,

        searchableText,
      },
      update: {
        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber,
        client,
        clientCode: report.clientCode,
        status: String(report.status),
        version: report.version,

        dateSent,
        dateTested,
        dateReceived: null,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,

        typeOfTest,
        sampleType,
        formulaNo,
        description,
        lotNo,
        manufactureDate,
        comments,
        idNo,
        samplingDate,
        testedBy,
        reviewedBy,

        searchableText,
      },
    });
  }

  async syncChemistryReport(chemistryId: string) {
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id: chemistryId },
      include: {
        chemistryMix: true,
        coa: true,
      },
    });

    if (!report) {
      await this.removeChemistryReport(chemistryId);
      return;
    }

    const details = report.chemistryMix ?? report.coa ?? null;

    const client = details?.client ?? null;

    const dateSent = details?.dateSent ?? null;
    const dateReceived = details?.dateReceived ?? null;
    const dateTested = (details as any)?.testedDate ?? null;

    const sampleDescription = (details as any)?.sampleDescription ?? null;
    const lotBatchNo = (details as any)?.lotBatchNo ?? null;
    const formulaId = (details as any)?.formulaId ?? null;
    const sampleSize = (details as any)?.sampleSize ?? null;
    const numberOfActives = (details as any)?.numberOfActives ?? null;
    const manufactureDate = (details as any)?.manufactureDate ?? null;
    const comments = (details as any)?.comments ?? null;
    const testedBy = (details as any)?.testedBy ?? null;
    const reviewedBy = (details as any)?.reviewedBy ?? null;

    const actives = (details as any)?.actives ?? null;
    const selectedActivesText = this.activesToText(actives);

    const searchableText = this.buildSearchText({
      sourceType: 'CHEMISTRY_REPORT',
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber,
      client,
      clientCode: report.clientCode,
      status: report.status,
      sampleDescription,
      lotBatchNo,
      formulaId,
      sampleSize,
      numberOfActives,
      comments,
      testedBy,
      reviewedBy,
      sampleTypes: (details as any)?.sampleTypes,
      testTypes: (details as any)?.testTypes,
      sampleCollected: (details as any)?.sampleCollected,
      actives,
      selectedActivesText,
      coaRows: (details as any)?.coaRows,
    });

    await this.prisma.dashboardReport.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: 'CHEMISTRY_REPORT',
          sourceId: report.id,
        },
      },
      create: {
        sourceType: 'CHEMISTRY_REPORT',
        sourceId: report.id,

        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber,
        client,
        clientCode: report.clientCode,
        status: String(report.status),
        version: report.version,

        dateSent,
        dateTested,
        dateReceived,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,

        sampleDescription,
        lotBatchNo,
        formulaId,
        sampleSize,
        numberOfActives,
        manufactureDate,
        comments,
        testedBy,
        reviewedBy,

        actives,
        selectedActivesText,

        // common aliases for dashboard columns/search
        description: sampleDescription,
        lotNo: lotBatchNo,
        formulaNo: formulaId,

        searchableText,
      },
      update: {
        formType: report.formType,
        formNumber: report.formNumber,
        reportNumber: report.reportNumber,
        client,
        clientCode: report.clientCode,
        status: String(report.status),
        version: report.version,

        dateSent,
        dateTested,
        dateReceived,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,

        sampleDescription,
        lotBatchNo,
        formulaId,
        sampleSize,
        numberOfActives,
        manufactureDate,
        comments,
        testedBy,
        reviewedBy,

        actives,
        selectedActivesText,

        description: sampleDescription,
        lotNo: lotBatchNo,
        formulaNo: formulaId,

        searchableText,
      },
    });
  }

  async removeMicroReport(reportId: string) {
    await this.prisma.dashboardReport.deleteMany({
      where: {
        sourceType: 'MICRO_REPORT',
        sourceId: reportId,
      },
    });
  }

  async removeChemistryReport(chemistryId: string) {
    await this.prisma.dashboardReport.deleteMany({
      where: {
        sourceType: 'CHEMISTRY_REPORT',
        sourceId: chemistryId,
      },
    });
  }

  async rebuildAll() {
    await this.prisma.dashboardReport.deleteMany({});

    const microReports = await this.prisma.report.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const r of microReports) {
      await this.syncMicroReport(r.id);
    }

    const chemistryReports = await this.prisma.chemistryReport.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const r of chemistryReports) {
      await this.syncChemistryReport(r.id);
    }

    return {
      micro: microReports.length,
      chemistry: chemistryReports.length,
      total: microReports.length + chemistryReports.length,
    };
  }
}
