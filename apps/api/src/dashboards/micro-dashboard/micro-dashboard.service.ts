import { ForbiddenException, Injectable } from '@nestjs/common';
import { FormType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

type MicroDashboardQuery = {
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
  sortBy?: string;
  sortDir?: string;
};

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

function safeDateField(value?: string) {
  const allowed = [
    'dateSent',
    'dateTested',
    'createdAt',
    'updatedAt',
  ];

  return allowed.includes(String(value)) ? String(value) : 'dateSent';
}

function getFormTypesFromQuery(form?: string): FormType[] {
  switch (form) {
    case 'MICRO':
      return ['MICRO_MIX'];

    case 'MICRO_WATER':
    case 'MICROWATER':
      return ['MICRO_MIX_WATER'];

    case 'STERILITY':
      return ['STERILITY'];

    case 'ALL':
    default:
      return ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY'];
  }
}

function mapDashboardRow(r: any) {
  return {
    ...r,
    id: r.sourceId,
    dashboardId: r.id,
  };
}

@Injectable()
export class MicroDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(user: any, query: MicroDashboardQuery) {
    if (
      user.role !== UserRole.MICRO &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SYSTEMADMIN
    ) {
      throw new ForbiddenException('Micro only');
    }

    const page = toInt(query.page, 1);
    const perPage = Math.min(toInt(query.perPage, 10), 100);
    const skip = (page - 1) * perPage;

    const status = query.status || 'ALL';
    const q = String(query.q || '').trim().toLowerCase();
    const client = String(query.client || '').trim();
    const reportSearch = String(query.report || '').trim();

    const formTypes = getFormTypesFromQuery(query.form);

    const dateField = safeDateField(query.dateField || query.sortBy);
    const sort: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';

    const where: Prisma.DashboardReportWhereInput = {
      formType: {
        in: formTypes,
      },
    };

    if (status !== 'ALL') {
      where.status = status;
    }

    const and: Prisma.DashboardReportWhereInput[] = [];

    if (q) {
      and.push({
        searchableText: {
          contains: q,
          mode: 'insensitive',
        },
      });
    }

    if (client) {
      and.push({
        OR: [
          { client: { contains: client, mode: 'insensitive' } },
          { clientCode: { contains: client, mode: 'insensitive' } },
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