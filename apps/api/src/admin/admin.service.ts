import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

type ListArgs = { q: string };

type DailyActivityArgs = {
  q?: string;
  clientCode?: string;
  from?: string;
  to?: string;
};

type ClientReportDetailArgs = {
  clientCode?: string;
  range?: string;
  from?: string;
  to?: string;
  metric?: string;
  page?: number;
  pageSize?: number;
};

type ClientReportSummaryArgs = {
  clientCode?: string;
  range?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function getDateRange(range?: string, from?: string, to?: string) {
  const now = new Date();

  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  switch ((range ?? 'ALL').toUpperCase()) {
    case 'TODAY': {
      return { gte: startOfDay(now), lte: endOfDay(now) };
    }
    case 'YESTERDAY': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { gte: startOfDay(d), lte: endOfDay(d) };
    }
    case 'TOMORROW': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return { gte: startOfDay(d), lte: endOfDay(d) };
    }
    case 'LAST_7_DAYS': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { gte: startOfDay(d), lte: endOfDay(now) };
    }
    case 'LAST_30_DAYS': {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { gte: startOfDay(d), lte: endOfDay(now) };
    }
    case 'THIS_MONTH': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { gte: startOfDay(first), lte: endOfDay(last) };
    }
    case 'CUSTOM': {
      if (!from && !to) return undefined;
      return {
        ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
      };
    }
    case 'ALL':
    default:
      return undefined;
  }
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(args: ListArgs) {
    const qRaw = (args.q ?? '').trim();
    const q = qRaw.length ? qRaw : '';

    const take = 250;

    const microWhere: any = q
      ? {
          OR: [
            { formNumber: { contains: q, mode: 'insensitive' } },
            { reportNumber: { contains: q, mode: 'insensitive' } },
            { clientCode: { contains: q, mode: 'insensitive' } },
            {
              microMix: {
                is: { client: { contains: q, mode: 'insensitive' } },
              },
            },
            {
              microMixWater: {
                is: { client: { contains: q, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {};

    const micro = await this.prisma.report.findMany({
      where: microWhere,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        status: true,
        clientCode: true,
        createdAt: true,
      },
    });

    const chemWhere: any = q
      ? {
          OR: [
            { formNumber: { contains: q, mode: 'insensitive' } },
            { reportNumber: { contains: q, mode: 'insensitive' } },
            { clientCode: { contains: q, mode: 'insensitive' } },
            {
              chemistryMix: {
                is: { client: { contains: q, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {};

    const chem = await this.prisma.chemistryReport.findMany({
      where: chemWhere,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        formType: true,
        formNumber: true,
        reportNumber: true,
        status: true,
        clientCode: true,
        createdAt: true,
      },
    });

    const merged = [
      ...micro.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
      ...chem.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return merged;
  }

  async listClients(args: ListArgs) {
    const q = (args.q ?? '').trim().toUpperCase();

    const userRows = await this.prisma.user.findMany({
      where: {
        role: 'CLIENT',
        ...(q ? { clientCode: { contains: q } } : {}),
      },
      select: {
        clientCode: true,
        active: true,
      },
    });

    const byCode: Record<
      string,
      { clientCode: string; totalUsers: number; activeUsers: number }
    > = {};

    for (const u of userRows) {
      const code = (u.clientCode ?? '').trim();
      if (!code) continue;
      if (!byCode[code]) {
        byCode[code] = { clientCode: code, totalUsers: 0, activeUsers: 0 };
      }
      byCode[code].totalUsers += 1;
      if (u.active) byCode[code].activeUsers += 1;
    }

    const notifConfigs = await this.prisma.clientNotificationConfig.findMany({
      where: q ? { clientCode: { contains: q } } : {},
      include: {
        emails: true,
      },
    });

    for (const c of notifConfigs) {
      const code = c.clientCode;
      if (!byCode[code]) {
        byCode[code] = { clientCode: code, totalUsers: 0, activeUsers: 0 };
      }
    }

    const out = Object.values(byCode)
      .map((row) => {
        const cfg =
          notifConfigs.find((x) => x.clientCode === row.clientCode) ?? null;

        return {
          clientCode: row.clientCode,
          totalUsers: row.totalUsers,
          activeUsers: row.activeUsers,
          notificationsMode: cfg?.mode ?? undefined,
          customEmails: cfg?.emails?.length ?? 0,
        };
      })
      .sort((a, b) => a.clientCode.localeCompare(b.clientCode));

    return out;
  }

  async listDailyReportActivity(args: DailyActivityArgs) {
    const q = (args.q ?? '').trim();
    const clientCode = (args.clientCode ?? '').trim().toUpperCase();

    const fromDate = args.from
      ? new Date(`${args.from}T00:00:00.000Z`)
      : (() => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - 7);
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })();

    const toDate = args.to
      ? new Date(`${args.to}T23:59:59.999Z`)
      : (() => {
          const d = new Date();
          d.setUTCHours(23, 59, 59, 999);
          return d;
        })();

    const where: any = {
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
      entity: {
        in: ['REPORT', 'CHEMISTRY_REPORT'],
      },
    };

    if (clientCode) {
      where.clientCode = clientCode;
    }

    if (q) {
      where.OR = [
        { formNumber: { contains: q, mode: 'insensitive' } },
        { reportNumber: { contains: q, mode: 'insensitive' } },
        { clientCode: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.auditTrail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        action: true,
        details: true,
        changes: true,
        entity: true,
        entityId: true,
        clientCode: true,
        formNumber: true,
        reportNumber: true,
        formType: true,
        role: true,
        userId: true,
      },
    });

    const grouped = new Map<
      string,
      {
        day: string;
        clientCode: string;
        created: number;
        submitted: number;
        underReview: number;
        needsCorrection: number;
        approved: number;
        voided: number;
        totalActivities: number;
      }
    >();

    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      const code = (row.clientCode ?? '').trim() || '—';
      const key = `${day}__${code}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          day,
          clientCode: code,
          created: 0,
          submitted: 0,
          underReview: 0,
          needsCorrection: 0,
          approved: 0,
          voided: 0,
          totalActivities: 0,
        });
      }

      const bucket = grouped.get(key)!;
      bucket.totalActivities += 1;

      const action = String(row.action ?? '').toUpperCase();
      const details = String(row.details ?? '').toUpperCase();

      const changes: any = row.changes ?? {};
      const nextStatus = String(
        changes?.status?.to ?? changes?.newStatus ?? changes?.to ?? '',
      ).toUpperCase();

      // CREATED
      if (action.includes('CREATE') || details.includes('CREATED')) {
        bucket.created += 1;
      }

      // SUBMITTED
      if (
        nextStatus === 'SUBMITTED_BY_CLIENT' ||
        nextStatus === 'RESUBMISSION_BY_CLIENT' ||
        nextStatus === 'PRELIMINARY_RESUBMISSION_BY_CLIENT' ||
        nextStatus === 'FINAL_RESUBMISSION_BY_CLIENT' ||
        action.includes('SUBMIT')
      ) {
        bucket.submitted += 1;
      }

      // UNDER REVIEW
      if (nextStatus.includes('UNDER_') || action.includes('REVIEW')) {
        bucket.underReview += 1;
      }

      // NEEDS CORRECTION
      if (
        nextStatus.includes('NEEDS_CORRECTION') ||
        nextStatus.includes('NEEDS_PRELIMINARY_CORRECTION') ||
        nextStatus.includes('NEEDS_FINAL_CORRECTION') ||
        details.includes('NEEDS_CORRECTION') ||
        action.includes('CORRECTION')
      ) {
        bucket.needsCorrection += 1;
      }

      // APPROVED
      if (
        nextStatus === 'APPROVED' ||
        nextStatus === 'FINAL_APPROVED' ||
        nextStatus === 'PRELIMINARY_APPROVED' ||
        action.includes('APPROVE')
      ) {
        bucket.approved += 1;
      }

      // VOID
      if (
        nextStatus === 'VOID' ||
        details.includes('VOID') ||
        action.includes('VOID')
      ) {
        bucket.voided += 1;
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.day === b.day) return a.clientCode.localeCompare(b.clientCode);
      return a.day < b.day ? 1 : -1;
    });
  }

  async listClientReportSummary(args: ClientReportSummaryArgs) {
    const selectedClientCode = (args.clientCode ?? 'ALL').trim().toUpperCase();
    const createdAt = getDateRange(args.range, args.from, args.to);

    const page = Math.max(1, Number(args.page ?? 1));
    const pageSize = Math.max(1, Number(args.pageSize ?? 10));

    const microWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(selectedClientCode !== 'ALL'
        ? { clientCode: selectedClientCode }
        : {}),
    };

    const chemWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(selectedClientCode !== 'ALL'
        ? { clientCode: selectedClientCode }
        : {}),
    };

    const microRows = await this.prisma.report.findMany({
      where: microWhere,
      select: {
        clientCode: true,
        formType: true,
        createdAt: true,
      },
    });

    const chemRows = await this.prisma.chemistryReport.findMany({
      where: chemWhere,
      select: {
        clientCode: true,
        formType: true,
        createdAt: true,
      },
    });

    const byClient: Record<
      string,
      {
        clientCode: string;
        totalReports: number;
        microReports: number;
        microWaterReports: number;
        sterilityReports: number;
        chemistryReports: number;
        coaReports: number;
        latestReportAt: string | null;
      }
    > = {};

    function ensure(code: string) {
      if (!byClient[code]) {
        byClient[code] = {
          clientCode: code,
          totalReports: 0,
          microReports: 0,
          microWaterReports: 0,
          sterilityReports: 0,
          chemistryReports: 0,
          coaReports: 0,
          latestReportAt: null,
        };
      }
      return byClient[code];
    }

    for (const r of microRows) {
      const code = (r.clientCode ?? '').trim() || '—';
      const row = ensure(code);

      row.totalReports += 1;
      if (r.formType === 'MICRO_MIX') row.microReports += 1;
      if (r.formType === 'MICRO_MIX_WATER') row.microWaterReports += 1;
      if (r.formType === 'STERILITY') row.sterilityReports += 1;

      const iso = r.createdAt.toISOString();
      if (!row.latestReportAt || iso > row.latestReportAt) {
        row.latestReportAt = iso;
      }
    }

    for (const r of chemRows) {
      const code = (r.clientCode ?? '').trim() || '—';
      const row = ensure(code);

      row.totalReports += 1;
      if (r.formType === 'CHEMISTRY_MIX') row.chemistryReports += 1;
      if (r.formType === 'COA') row.coaReports += 1;

      const iso = r.createdAt.toISOString();
      if (!row.latestReportAt || iso > row.latestReportAt) {
        row.latestReportAt = iso;
      }
    }

    const allItems = Object.values(byClient).sort((a, b) => {
      if (b.totalReports !== a.totalReports) {
        return b.totalReports - a.totalReports;
      }
      return a.clientCode.localeCompare(b.clientCode);
    });

    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const items = allItems.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async listClientReportSummaryDetails(args: ClientReportDetailArgs) {
    const selectedClientCode = (args.clientCode ?? 'ALL').trim().toUpperCase();
    const metric = (args.metric ?? 'ALL').trim().toUpperCase();
    const createdAt = getDateRange(args.range, args.from, args.to);

    const page = Math.max(1, Number(args.page ?? 1));
    const pageSize = Math.max(1, Number(args.pageSize ?? 10));

    const microWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(selectedClientCode !== 'ALL'
        ? { clientCode: selectedClientCode }
        : {}),
      ...(metric !== 'ALL' &&
      ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY'].includes(metric)
        ? { formType: metric as any }
        : {}),
    };

    const chemWhere: any = {
      ...(createdAt ? { createdAt } : {}),
      ...(selectedClientCode !== 'ALL'
        ? { clientCode: selectedClientCode }
        : {}),
      ...(metric !== 'ALL' && ['CHEMISTRY_MIX', 'COA'].includes(metric)
        ? { formType: metric as any }
        : {}),
    };

    const shouldLoadMicro =
      metric === 'ALL' ||
      metric === 'MICRO_MIX' ||
      metric === 'MICRO_MIX_WATER' ||
      metric === 'STERILITY';

    const shouldLoadChem =
      metric === 'ALL' || metric === 'CHEMISTRY_MIX' || metric === 'COA';

    const micro = shouldLoadMicro
      ? await this.prisma.report.findMany({
          where: microWhere,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            formType: true,
            formNumber: true,
            reportNumber: true,
            status: true,
            clientCode: true,
            createdAt: true,
          },
        })
      : [];

    const chem = shouldLoadChem
      ? await this.prisma.chemistryReport.findMany({
          where: chemWhere,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            formType: true,
            formNumber: true,
            reportNumber: true,
            status: true,
            clientCode: true,
            createdAt: true,
          },
        })
      : [];

    const allItems = [
      ...micro.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
      ...chem.map((r) => ({
        id: r.id,
        formType: r.formType,
        formNumber: r.formNumber,
        reportNumber: r.reportNumber,
        status: String(r.status),
        clientCode: r.clientCode,
        createdAt: r.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const items = allItems.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async listClientCodes() {
    const [reportCodes, chemistryCodes, userCodes, notifCodes] =
      await Promise.all([
        this.prisma.report.findMany({
          where: {
            clientCode: {
              not: null,
            },
          },
          select: { clientCode: true },
          distinct: ['clientCode'],
        }),
        this.prisma.chemistryReport.findMany({
          where: {
            clientCode: {
              not: null,
            },
          },
          select: { clientCode: true },
          distinct: ['clientCode'],
        }),
        this.prisma.user.findMany({
          where: {
            clientCode: {
              not: null,
            },
          },
          select: { clientCode: true },
          distinct: ['clientCode'],
        }),
        this.prisma.clientNotificationConfig.findMany({
          select: { clientCode: true },
        }),
      ]);

    const codes = new Set<string>();

    for (const row of reportCodes) {
      const code = (row.clientCode ?? '').trim().toUpperCase();
      if (code) codes.add(code);
    }

    for (const row of chemistryCodes) {
      const code = (row.clientCode ?? '').trim().toUpperCase();
      if (code) codes.add(code);
    }

    for (const row of userCodes) {
      const code = (row.clientCode ?? '').trim().toUpperCase();
      if (code) codes.add(code);
    }

    for (const row of notifCodes) {
      const code = (row.clientCode ?? '').trim().toUpperCase();
      if (code) codes.add(code);
    }

    return ['ALL', ...Array.from(codes).sort((a, b) => a.localeCompare(b))];
  }
}
