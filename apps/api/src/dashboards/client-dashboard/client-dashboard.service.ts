import { ForbiddenException, Injectable } from '@nestjs/common';
import { FormType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

type ClientDashboardQuery = {
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

  pinnedIds?: string;
};

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// function parseDateStart(value?: string) {
//   if (!value) return undefined;
//   const d = new Date(`${value}T00:00:00.000Z`);
//   return Number.isNaN(d.getTime()) ? undefined : d;
// }

// function parseDateEnd(value?: string) {
//   if (!value) return undefined;
//   const d = new Date(`${value}T23:59:59.999Z`);
//   return Number.isNaN(d.getTime()) ? undefined : d;
// }

function parseDateStart(value?: string) {
  if (!value) return undefined;

  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDateEndExclusive(value?: string) {
  if (!value) return undefined;

  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;

  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function extractSequence(value?: string | number | null): number | null {
  if (value == null) return null;

  const match = String(value)
    .trim()
    .match(/(\d{5,})$/);
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

function parsePinnedIds(value?: string): string[] {
  if (!value) return [];

  return String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function withPinnedFilter(
  where: Prisma.DashboardReportWhereInput,
  pinnedIds: string[],
  mode: 'PINNED' | 'UNPINNED',
): Prisma.DashboardReportWhereInput {
  if (!pinnedIds.length) return where;

  return {
    AND: [
      where,
      {
        sourceId: mode === 'PINNED' ? { in: pinnedIds } : { notIn: pinnedIds },
      },
    ],
  };
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
  const allowed = ['dateSent', 'createdAt', 'updatedAt'];

  return allowed.includes(String(value)) ? String(value) : 'dateSent';
}

function safeSortBy(value?: string) {
  const allowed = ['dateSent', 'formNumber', 'createdAt', 'updatedAt'];

  return allowed.includes(String(value)) ? String(value) : 'formNumber';
}

function mapDashboardRow(r: any) {
  return {
    ...r,

    // IMPORTANT:
    // frontend View/Update/Status actions need real Report/ChemistryReport id
    id: r.sourceId,

    // optional, only for debugging
    dashboardId: r.id,
  };
}

@Injectable()
export class ClientDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(user: any, query: ClientDashboardQuery) {
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Client only');
    }

    if (!user.clientCode) {
      throw new ForbiddenException('Client code missing');
    }

    const page = toInt(query.page, 1);
    const perPage = Math.min(toInt(query.perPage, 10), 100);
    const skip = (page - 1) * perPage;

    const pinnedIds = parsePinnedIds(query.pinnedIds);
    const pinOrder = new Map(pinnedIds.map((id, index) => [id, index]));

    const form = query.form || 'ALL';
    const status = query.status || 'ALL';

    const client = String(query.client || '').trim();
    const reportSearch = String(query.report || '').trim();
    const q = String(query.q || '')
      .trim()
      .toLowerCase();

    const sortBy = safeSortBy(query.sortBy);
    const sortDir: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';

    const dateField = safeDateField(query.dateField);

    const where: Prisma.DashboardReportWhereInput = {
      clientCode: user.clientCode,
    };

    const mappedForm = mapFormFilter(form);
    if (form !== 'ALL' && mappedForm) {
      where.formType = mappedForm;
    }

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
      const lt = parseDateEndExclusive(query.to);

      if (gte) range.gte = gte;
      if (lt) range.lt = lt;

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
      if (!pinnedIds.length) {
        const [rows, total] = await Promise.all([
          this.prisma.dashboardReport.findMany({
            where,
            orderBy: {
              [dateField]: sortDir,
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

      const pinnedWhere = withPinnedFilter(where, pinnedIds, 'PINNED');
      const unpinnedWhere = withPinnedFilter(where, pinnedIds, 'UNPINNED');

      const [pinnedRowsRaw, total] = await Promise.all([
        this.prisma.dashboardReport.findMany({
          where: pinnedWhere,
          orderBy: {
            [dateField]: sortDir,
          } as any,
        }),
        this.prisma.dashboardReport.count({ where }),
      ]);

      const pinnedRows = pinnedRowsRaw.sort((a, b) => {
        const ai = pinOrder.get(String(a.sourceId)) ?? Number.MAX_SAFE_INTEGER;
        const bi = pinOrder.get(String(b.sourceId)) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });

      const pinnedCount = pinnedRows.length;

      let rows: any[] = [];

      if (skip < pinnedCount) {
        const pinnedSlice = pinnedRows.slice(skip, skip + perPage);
        const remaining = perPage - pinnedSlice.length;

        let unpinnedSlice: any[] = [];

        if (remaining > 0) {
          unpinnedSlice = await this.prisma.dashboardReport.findMany({
            where: unpinnedWhere,
            orderBy: {
              [dateField]: sortDir,
            } as any,
            skip: 0,
            take: remaining,
          });
        }

        rows = [...pinnedSlice, ...unpinnedSlice];
      } else {
        rows = await this.prisma.dashboardReport.findMany({
          where: unpinnedWhere,
          orderBy: {
            [dateField]: sortDir,
          } as any,
          skip: skip - pinnedCount,
          take: perPage,
        });
      }

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
        [sortBy]: sortDir,
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

    const orderedRows = pinnedIds.length
      ? [
          ...filteredRows
            .filter((r) => pinnedIds.includes(String(r.sourceId)))
            .sort((a, b) => {
              const ai =
                pinOrder.get(String(a.sourceId)) ?? Number.MAX_SAFE_INTEGER;
              const bi =
                pinOrder.get(String(b.sourceId)) ?? Number.MAX_SAFE_INTEGER;
              return ai - bi;
            }),
          ...filteredRows.filter(
            (r) => !pinnedIds.includes(String(r.sourceId)),
          ),
        ]
      : filteredRows;

    return {
      rows: orderedRows
        .slice(safeSkip, safeSkip + perPage)
        .map(mapDashboardRow),
      total,
      page: safePage,
      perPage,
      totalPages,
    };
  }
}
