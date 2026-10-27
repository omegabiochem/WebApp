import { ForbiddenException, Injectable } from '@nestjs/common';
import { FormType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
// import {
//   MICRO_ALLOWED_STATUSES,
//   STERILITY_APE_ALLOWED_STATUSES,
// } from '../utils/dashboardStatuses';

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

  pinnedIds?: string;
  discardedCorrectionIds?: string;
};

// function getAllowedStatusesFromQuery(form?: string): string[] {
//   switch (form) {
//     case 'MICRO':
//     case 'MICRO_WATER':
//     case 'MICROWATER':
//       return MICRO_ALLOWED_STATUSES;

//     case 'STERILITY':
//     case 'APE':
//       return STERILITY_APE_ALLOWED_STATUSES;

//     case 'ALL':
//     default:
//       return [
//         ...new Set([
//           ...MICRO_ALLOWED_STATUSES,
//           ...STERILITY_APE_ALLOWED_STATUSES,
//         ]),
//       ];
//   }
// }

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

function isCorrectionPriorityStatus(status: string) {
  return [
    'CORRECTION_REQUESTED',
    'UNDER_CORRECTION_UPDATE',
    'CHANGE_REQUESTED',
    'UNDER_CHANGE_UPDATE',
  ].includes(String(status));
}

function safeDateField(value?: string) {
  const allowed = ['dateSent', 'dateTested', 'createdAt', 'updatedAt'];

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

    case 'APE':
      return ['APE'];

    case 'ALL':
    default:
      return ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY', 'APE'];
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

    const pinnedIds = parsePinnedIds(query.pinnedIds);
    const discardedCorrectionIds = parsePinnedIds(query.discardedCorrectionIds);
    const discardedCorrectionSet = new Set(discardedCorrectionIds);

    const pinOrder = new Map(pinnedIds.map((id, index) => [id, index]));

    const status = query.status || 'ALL';
    const q = String(query.q || '')
      .trim()
      .toLowerCase();
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

    // const allowedStatuses = getAllowedStatusesFromQuery(query.form);

    // if (status !== 'ALL') {
    //   where.status = status;
    // } else {
    //   where.status = {
    //     in: allowedStatuses,
    //   };
    // }
    // ✅ ALL means all statuses.
    // Only filter when a specific status is selected.
    if (status !== 'ALL') {
      where.status = status;
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

    /*
     * Load all matching Micro / Micro Water / Sterility / APE rows first.
     * Correction and pin priority must be applied before pagination.
     */
    const allRows = await this.prisma.dashboardReport.findMany({
      where,
      orderBy: {
        [dateField]: sort,
      } as any,
    });

    /*
     * Apply optional form/report number range.
     */
    const filteredRows =
      rangeType === 'FORM' && hasFormRange
        ? allRows.filter((r) =>
            isInRange(
              extractSequence(r.formNumber),
              query.formFrom,
              query.formTo,
            ),
          )
        : rangeType === 'REPORT' && hasReportRange
          ? allRows.filter((r) =>
              isInRange(
                extractSequence(r.reportNumber),
                query.reportFrom,
                query.reportTo,
              ),
            )
          : allRows;

    /*
     * Priority:
     * 1. Active centralized correction/change not dismissed by this user
     * 2. Pinned reports
     * 3. Normal reports
     */
    const correctionRows: typeof filteredRows = [];
    const pinnedRows: typeof filteredRows = [];
    const normalRows: typeof filteredRows = [];

    for (const row of filteredRows) {
      const sourceId = String(row.sourceId);

      const correctionImportant =
        isCorrectionPriorityStatus(String(row.status)) &&
        !discardedCorrectionSet.has(sourceId);

      if (correctionImportant) {
        correctionRows.push(row);
        continue;
      }

      if (pinnedIds.includes(sourceId)) {
        pinnedRows.push(row);
        continue;
      }

      normalRows.push(row);
    }

    /*
     * Preserve explicit user pin order.
     */
    pinnedRows.sort((a, b) => {
      const ai = pinOrder.get(String(a.sourceId)) ?? Number.MAX_SAFE_INTEGER;
      const bi = pinOrder.get(String(b.sourceId)) ?? Number.MAX_SAFE_INTEGER;

      return ai - bi;
    });

    const orderedRows = [...correctionRows, ...pinnedRows, ...normalRows];

    /*
     * Pagination last.
     */
    const total = orderedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const safeSkip = (safePage - 1) * perPage;

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
