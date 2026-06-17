import { ForbiddenException, Injectable } from '@nestjs/common';
import { FormType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

type FrontdeskDashboardQuery = {
  form?: string;
  status?: string;
  client?: string;
  report?: string;
  q?: string;

  dateField?: string;
  from?: string;
  to?: string;

  rangeType?: string;
  formFrom?: string;
  formTo?: string;
  reportFrom?: string;
  reportTo?: string;

  page?: string;
  perPage?: string;
  sort?: string;
};

const FRONTDESK_STATUSES = [
  'RECEIVED_BY_FRONTDESK',
  'FRONTDESK_ON_HOLD',
  'FRONTDESK_NEEDS_CORRECTION',
];

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDateStart(value?: string) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEnd(value?: string) {
  if (!value) return undefined;
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function extractSequence(value?: string | number | null): number | null {
  if (value == null) return null;

  const match = String(value).trim().match(/(\d{5,})$/);
  if (!match) return null;

  const digits = match[1];
  if (digits.length < 5) return null;

  const sequence = Number(digits.slice(4));
  return Number.isFinite(sequence) ? sequence : null;
}

function isInRange(value: number | null, fromRaw?: string, toRaw?: string) {
  if (value == null) return false;

  const from =
    fromRaw && fromRaw.trim() !== '' ? Number(fromRaw.trim()) : undefined;

  const to = toRaw && toRaw.trim() !== '' ? Number(toRaw.trim()) : undefined;

  if (from != null && Number.isFinite(from) && value < from) return false;
  if (to != null && Number.isFinite(to) && value > to) return false;

  return true;
}

function mapFormFilter(form?: string): FormType | undefined {
  switch (form) {
    case 'MICRO':
      return 'MICRO_MIX';
    case 'MICROWATER':
      return 'MICRO_MIX_WATER';
    case 'STERILITY':
      return 'STERILITY';
    case 'CHEMISTRY':
      return 'CHEMISTRY_MIX';
    case 'COA':
      return 'COA';
    default:
      return undefined;
  }
}

function safeDateField(value?: string) {
  const allowed = [
    'dateSent',
    'dateTested',
    'dateReceived',
    'createdAt',
    'updatedAt',
  ];

  return allowed.includes(String(value)) ? String(value) : 'dateSent';
}

function mapDashboardRow(r: any) {
  return {
    ...r,
    id: r.sourceId,
    dashboardId: r.id,
  };
}

@Injectable()
export class FrontdeskDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(user: any, query: FrontdeskDashboardQuery) {
    if (
      user.role !== UserRole.FRONTDESK &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SYSTEMADMIN
    ) {
      throw new ForbiddenException('Frontdesk only');
    }

    const page = toInt(query.page, 1);
    const perPage = Math.min(toInt(query.perPage, 10), 100);
    const skip = (page - 1) * perPage;

    const form = query.form || 'ALL';
    const status = query.status || 'ALL';
    const q = String(query.q || '').trim().toLowerCase();
    const client = String(query.client || '').trim();
    const reportSearch = String(query.report || '').trim();

    const dateField = safeDateField(query.dateField);
    const sort: Prisma.SortOrder = query.sort === 'asc' ? 'asc' : 'desc';

    const where: Prisma.DashboardReportWhereInput = {
      status:
        status !== 'ALL'
          ? status
          : {
              in: FRONTDESK_STATUSES,
            },
    };

    const mappedForm = mapFormFilter(form);
    if (form !== 'ALL' && mappedForm) {
      where.formType = mappedForm;
    }

    const and: Prisma.DashboardReportWhereInput[] = [];

    if (q) {
  and.push({
    OR: [
      { searchableText: { contains: q, mode: 'insensitive' } },

      // direct dashboard columns
      { typeOfTest: { contains: q, mode: 'insensitive' } },
      { sampleType: { contains: q, mode: 'insensitive' } },
      { formulaNo: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { lotNo: { contains: q, mode: 'insensitive' } },
      { client: { contains: q, mode: 'insensitive' } },
      { clientCode: { contains: q, mode: 'insensitive' } },
      { formNumber: { contains: q, mode: 'insensitive' } },
      { reportNumber: { contains: q, mode: 'insensitive' } },

      // chemistry fields
      { sampleDescription: { contains: q, mode: 'insensitive' } },
      { lotBatchNo: { contains: q, mode: 'insensitive' } },
      { formulaId: { contains: q, mode: 'insensitive' } },
      { sampleSize: { contains: q, mode: 'insensitive' } },
      { numberOfActives: { contains: q, mode: 'insensitive' } },
      { selectedActivesText: { contains: q, mode: 'insensitive' } },

      // extra searchable fields
      { comments: { contains: q, mode: 'insensitive' } },
      { idNo: { contains: q, mode: 'insensitive' } },
      { testedBy: { contains: q, mode: 'insensitive' } },
      { reviewedBy: { contains: q, mode: 'insensitive' } },
      { status: { contains: q, mode: 'insensitive' } },
    ],
  });
}

    if (client) {
      and.push({
        OR: [
          { client: { contains: client, mode: 'insensitive' } },
          { clientCode: { contains: client, mode: 'insensitive' } },
          { formNumber: { contains: client, mode: 'insensitive' } },
        ],
      });
    }

    if (reportSearch) {
      and.push({
        OR: [
          { formNumber: { contains: reportSearch, mode: 'insensitive' } },
          { reportNumber: { contains: reportSearch, mode: 'insensitive' } },
        ],
      });
    }

    if (query.from || query.to) {
      const range: any = {};

      const gte = parseDateStart(query.from);
      const lte = parseDateEnd(query.to);

      if (gte) range.gte = gte;
      if (lte) range.lte = lte;

      if (Object.keys(range).length) {
        and.push({
          [dateField]: range,
        } as any);
      }
    }

    if (and.length) {
      where.AND = and;
    }

    const rangeType = query.rangeType || 'FORM';
    const hasFormRange = !!query.formFrom || !!query.formTo;
    const hasReportRange = !!query.reportFrom || !!query.reportTo;

    if (
      !(rangeType === 'FORM' && hasFormRange) &&
      !(rangeType === 'REPORT' && hasReportRange)
    ) {
      const [rows, total] = await Promise.all([
        this.prisma.dashboardReport.findMany({
          where,
          orderBy: {
            [dateField]: sort,
          } as any,
          skip,
          take: perPage,
        }),
        this.prisma.dashboardReport.count({ where }),
      ]);

      return {
        rows: rows.map(mapDashboardRow),
        total,
        page,
        perPage,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      };
    }

    const allRows = await this.prisma.dashboardReport.findMany({
      where,
      orderBy: {
        [dateField]: sort,
      } as any,
    });

    const filteredRows = allRows.filter((r) => {
      if (rangeType === 'FORM') {
        return isInRange(
          extractSequence(r.formNumber),
          query.formFrom,
          query.formTo,
        );
      }

      return isInRange(
        extractSequence(r.reportNumber),
        query.reportFrom,
        query.reportTo,
      );
    });

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const safeSkip = (safePage - 1) * perPage;

    return {
      rows: filteredRows
        .slice(safeSkip, safeSkip + perPage)
        .map(mapDashboardRow),
      total,
      page: safePage,
      perPage,
      totalPages,
    };
  }
}