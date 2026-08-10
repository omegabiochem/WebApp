import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
@Injectable()
export class DashboardReportSyncService {
  constructor(private readonly prisma: PrismaService) {}

  private jsonOrDbNull(
    value: any,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === null || value === undefined) {
      return Prisma.DbNull;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private enumArrayOrDbNull(
    value: any,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!Array.isArray(value)) {
      return Prisma.DbNull;
    }

    return value.map((x) => String(x));
  }

  private valueToText(value: any): string {
    if (value == null) return '';

    if (
      value === Prisma.DbNull ||
      value === Prisma.JsonNull ||
      value === Prisma.AnyNull
    ) {
      return '';
    }

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

  private rootMicroData(report: any) {
    return {
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber,
      prefix: report.prefix,
      clientCode: report.clientCode,
      status: String(report.status),
      version: report.version,

      sourceLockedAt: report.lockedAt,
      sourceCreatedBy: report.createdBy,
      sourceUpdatedBy: report.updatedBy,

      reportNumberAssignedAt: report.ReportnumberAssignedAt,
      reportNumberAssignedBy: report.ReportnumberAssignedBy,

      workflowReturnStatus: report.workflowReturnStatus
        ? String(report.workflowReturnStatus)
        : null,
      workflowRequestKind: report.workflowRequestKind,
      workflowRequestedByRole: report.workflowRequestedByRole,
      workflowRequestedAt: report.workflowRequestedAt,

      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private rootChemistryData(report: any) {
    return {
      formType: report.formType,
      formNumber: report.formNumber,
      reportNumber: report.reportNumber,
      prefix: report.prefix,
      clientCode: report.clientCode,
      status: String(report.status),
      version: report.version,

      sourceLockedAt: report.lockedAt,
      sourceCreatedBy: report.createdBy,
      sourceUpdatedBy: report.updatedBy,

      reportNumberAssignedAt: report.ReportnumberAssignedAt,
      reportNumberAssignedBy: report.ReportnumberAssignedBy,

      workflowReturnStatus: report.workflowReturnStatus
        ? String(report.workflowReturnStatus)
        : null,
      workflowRequestKind: report.workflowRequestKind,
      workflowRequestedByRole: report.workflowRequestedByRole,
      workflowRequestedAt: report.workflowRequestedAt,

      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  async syncMicroReport(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        microMix: true,
        microMixWater: true,
        sterility: true,
        ape: true,
      },
    });

    if (!report) {
      await this.removeMicroReport(reportId);
      return;
    }

    const details =
      report.microMix ?? report.microMixWater ?? report.sterility ?? report.ape ?? null;

    const client = details?.client ?? null;

    const dashboardData = {
      ...this.rootMicroData(report),

      // Detail common fields
      client,
      dateSent: details?.dateSent ?? null,
      dateTested: (details as any)?.dateTested ?? null,
      dateReceived: null,
      manufactureDate: (details as any)?.manufactureDate ?? null,

      typeOfTest: (details as any)?.typeOfTest ?? null,
      sampleType: (details as any)?.sampleType ?? null,
      formulaNo: (details as any)?.formulaNo ?? null,
      description: (details as any)?.description ?? null,
      lotNo: (details as any)?.lotNo ?? null,
      comments: (details as any)?.comments ?? null,

      testedBy: (details as any)?.testedBy ?? null,
      testedDate: (details as any)?.testedDate ?? null,
      reviewedBy: (details as any)?.reviewedBy ?? null,
      reviewedDate: (details as any)?.reviewedDate ?? null,

      // Root report status is the workflow source of truth.
      detailStatus: String(report.status),
      detailLockedAt: (details as any)?.lockedAt ?? null,
      detailCreatedBy: (details as any)?.createdBy ?? null,
      detailUpdatedBy: (details as any)?.updatedBy ?? null,
      detailCreatedAt: (details as any)?.createdAt ?? null,
      detailUpdatedAt: (details as any)?.updatedAt ?? null,

      corrections: this.jsonOrDbNull((details as any)?.corrections),

      footerRevNo: (details as any)?.footerRevNo ?? null,
      footerDateEffective: (details as any)?.footerDateEffective ?? null,

      // MicroMix + MicroMixWater fields
      testSopNo: (details as any)?.testSopNo ?? null,
      preliminaryResults: (details as any)?.preliminaryResults ?? null,
      preliminaryResultsDate: (details as any)?.preliminaryResultsDate ?? null,
      dateCompleted: (details as any)?.dateCompleted ?? null,

      tbc_dilution: (details as any)?.tbc_dilution ?? null,
      tbc_gram: (details as any)?.tbc_gram ?? null,
      tbc_result: (details as any)?.tbc_result ?? null,
      tbc_spec: (details as any)?.tbc_spec ?? null,

      tmy_dilution: (details as any)?.tmy_dilution ?? null,
      tmy_gram: (details as any)?.tmy_gram ?? null,
      tmy_result: (details as any)?.tmy_result ?? null,
      tmy_spec: (details as any)?.tmy_spec ?? null,

      pathogens: this.jsonOrDbNull((details as any)?.pathogens),

      // MicroMixWater-only fields
      idNo: (details as any)?.idNo ?? null,
      samplingDate: (details as any)?.samplingDate ?? null,

      // Sterility fields
      volumeTested: (details as any)?.volumeTested ?? null,
      ftm_turbidity: (details as any)?.ftm_turbidity ?? null,
      scdb_turbidity: (details as any)?.scdb_turbidity ?? null,
      ftm_observation: (details as any)?.ftm_observation ?? null,
      scdb_observation: (details as any)?.scdb_observation ?? null,
      ftm_result: (details as any)?.ftm_result ?? null,
      scdb_result: (details as any)?.scdb_result ?? null,

      // APE fields
      organisms: this.jsonOrDbNull((details as any)?.organisms),

      // Chemistry / COA fields should be null for micro dashboard rows
      sampleDescription: null,
      lotBatchNo: null,
      formulaId: null,
      sampleSize: null,
      numberOfActives: null,
      stabilityNote: null,
      sampleCollected: Prisma.DbNull,
      sampleTypes: Prisma.DbNull,
      testTypes: Prisma.DbNull,
      actives: Prisma.DbNull,
      selectedActivesText: null,
      coaVerification: null,
      coaRows: Prisma.DbNull,
    };

    const searchableText = this.buildSearchText({
      sourceType: 'MICRO_REPORT',
      sourceId: report.id,
      ...dashboardData,
    });

    const createData = {
      sourceType: 'MICRO_REPORT',
      sourceId: report.id,
      ...dashboardData,
      searchableText,
    } satisfies Prisma.DashboardReportUncheckedCreateInput;

    const updateData = {
      ...dashboardData,
      searchableText,
    } satisfies Prisma.DashboardReportUncheckedUpdateInput;

    await this.prisma.dashboardReport.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: 'MICRO_REPORT',
          sourceId: report.id,
        },
      },
      create: createData,
      update: updateData,
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
    const actives = (details as any)?.actives ?? null;
    const selectedActivesText = this.activesToText(actives);

    const sampleDescription = (details as any)?.sampleDescription ?? null;
    const lotBatchNo = (details as any)?.lotBatchNo ?? null;
    const formulaId = (details as any)?.formulaId ?? null;

    const dashboardData = {
      ...this.rootChemistryData(report),

      // Detail common fields
      client,
      dateSent: details?.dateSent ?? null,
      dateTested: (details as any)?.testedDate ?? null,
      dateReceived: (details as any)?.dateReceived ?? null,
      manufactureDate: (details as any)?.manufactureDate ?? null,

      // Common aliases for dashboard columns/search
      typeOfTest: null,
      sampleType: null,
      formulaNo: formulaId,
      description: sampleDescription,
      lotNo: lotBatchNo,
      comments: (details as any)?.comments ?? null,

      testedBy: (details as any)?.testedBy ?? null,
      testedDate: (details as any)?.testedDate ?? null,
      reviewedBy: (details as any)?.reviewedBy ?? null,
      reviewedDate: (details as any)?.reviewedDate ?? null,

      // Root report status is the workflow source of truth.
      detailStatus: String(report.status),
      detailLockedAt: (details as any)?.lockedAt ?? null,
      detailCreatedBy: (details as any)?.createdBy ?? null,
      detailUpdatedBy: (details as any)?.updatedBy ?? null,
      detailCreatedAt: (details as any)?.createdAt ?? null,
      detailUpdatedAt: (details as any)?.updatedAt ?? null,

      corrections: this.jsonOrDbNull((details as any)?.corrections),

      footerRevNo: (details as any)?.footerRevNo ?? null,
      footerDateEffective: (details as any)?.footerDateEffective ?? null,

      // Micro fields should be null for chemistry dashboard rows
      testSopNo: null,
      preliminaryResults: null,
      preliminaryResultsDate: null,
      dateCompleted: null,

      tbc_dilution: null,
      tbc_gram: null,
      tbc_result: null,
      tbc_spec: null,

      tmy_dilution: null,
      tmy_gram: null,
      tmy_result: null,
      tmy_spec: null,
      pathogens: Prisma.DbNull,
      idNo: null,
      samplingDate: null,

      // Sterility fields should be null for chemistry dashboard rows
      volumeTested: null,
      ftm_turbidity: null,
      scdb_turbidity: null,
      ftm_observation: null,
      scdb_observation: null,
      ftm_result: null,
      scdb_result: null,

      // APE fields should be null for chemistry dashboard rows
      organisms: Prisma.DbNull,

      // Chemistry / COA fields
      sampleDescription,
      lotBatchNo,
      formulaId,
      sampleSize: (details as any)?.sampleSize ?? null,
      numberOfActives: (details as any)?.numberOfActives ?? null,
      stabilityNote: (details as any)?.stabilityNote ?? null,

      sampleCollected: this.enumArrayOrDbNull(
        (details as any)?.sampleCollected,
      ),
      sampleTypes: this.enumArrayOrDbNull((details as any)?.sampleTypes),
      testTypes: this.enumArrayOrDbNull((details as any)?.testTypes),
      actives: this.jsonOrDbNull(actives),
      selectedActivesText,

      coaVerification: (details as any)?.coaVerification ?? null,
      coaRows: this.jsonOrDbNull((details as any)?.coaRows),
    };

    const searchableText = this.buildSearchText({
      sourceType: 'CHEMISTRY_REPORT',
      sourceId: report.id,
      ...dashboardData,
    });

    const createData = {
      sourceType: 'CHEMISTRY_REPORT',
      sourceId: report.id,
      ...dashboardData,
      searchableText,
    } satisfies Prisma.DashboardReportUncheckedCreateInput;

    const updateData = {
      ...dashboardData,
      searchableText,
    } satisfies Prisma.DashboardReportUncheckedUpdateInput;

    await this.prisma.dashboardReport.upsert({
      where: {
        sourceType_sourceId: {
          sourceType: 'CHEMISTRY_REPORT',
          sourceId: report.id,
        },
      },
      create: createData,
      update: updateData,
    });
  }


  private async assertDashboardSnapshot(
    sourceType: 'MICRO_REPORT' | 'CHEMISTRY_REPORT',
    sourceId: string,
    expectedStatus: string,
    expectedVersion: number,
  ) {
    const row = await this.prisma.dashboardReport.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
      select: {
        status: true,
        version: true,
      },
    });

    if (
      !row ||
      row.status !== expectedStatus ||
      row.version !== expectedVersion
    ) {
      throw new Error(
        `Dashboard synchronization mismatch for ${sourceType}:${sourceId}. ` +
          `Expected ${expectedStatus}/${expectedVersion}, received ` +
          `${row?.status ?? 'MISSING'}/${row?.version ?? 'MISSING'}`,
      );
    }
  }

  async syncMicroReportAndVerify(reportId: string) {
    const source = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        status: true,
        version: true,
        updatedAt: true,
        workflowReturnStatus: true,
        workflowRequestKind: true,
        workflowRequestedByRole: true,
        workflowRequestedAt: true,
      },
    });

    if (!source) {
      await this.removeMicroReport(reportId);
      return;
    }

    try {
      await this.syncMicroReport(reportId);
    } catch (error) {
      const fallback = await this.prisma.dashboardReport.updateMany({
        where: {
          sourceType: 'MICRO_REPORT',
          sourceId: reportId,
        },
        data: {
          status: String(source.status),
          detailStatus: String(source.status),
          version: source.version,
          updatedAt: source.updatedAt,
          workflowReturnStatus: source.workflowReturnStatus
            ? String(source.workflowReturnStatus)
            : null,
          workflowRequestKind: source.workflowRequestKind,
          workflowRequestedByRole: source.workflowRequestedByRole,
          workflowRequestedAt: source.workflowRequestedAt,
        },
      });

      if (fallback.count === 0) throw error;
    }

    await this.assertDashboardSnapshot(
      'MICRO_REPORT',
      reportId,
      String(source.status),
      source.version,
    );
  }

  async syncChemistryReportAndVerify(chemistryId: string) {
    const source = await this.prisma.chemistryReport.findUnique({
      where: { id: chemistryId },
      select: {
        status: true,
        version: true,
        updatedAt: true,
        workflowReturnStatus: true,
        workflowRequestKind: true,
        workflowRequestedByRole: true,
        workflowRequestedAt: true,
      },
    });

    if (!source) {
      await this.removeChemistryReport(chemistryId);
      return;
    }

    try {
      await this.syncChemistryReport(chemistryId);
    } catch (error) {
      const fallback = await this.prisma.dashboardReport.updateMany({
        where: {
          sourceType: 'CHEMISTRY_REPORT',
          sourceId: chemistryId,
        },
        data: {
          status: String(source.status),
          detailStatus: String(source.status),
          version: source.version,
          updatedAt: source.updatedAt,
          workflowReturnStatus: source.workflowReturnStatus
            ? String(source.workflowReturnStatus)
            : null,
          workflowRequestKind: source.workflowRequestKind,
          workflowRequestedByRole: source.workflowRequestedByRole,
          workflowRequestedAt: source.workflowRequestedAt,
        },
      });

      if (fallback.count === 0) throw error;
    }

    await this.assertDashboardSnapshot(
      'CHEMISTRY_REPORT',
      chemistryId,
      String(source.status),
      source.version,
    );
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
    // Do not delete the dashboard table first. Each sync method already uses
    // upsert, so rebuilding can safely repair missing/stale snapshots while
    // users continue working.
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