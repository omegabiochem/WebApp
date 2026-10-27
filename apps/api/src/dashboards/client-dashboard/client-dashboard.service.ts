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
  discardedCorrectionIds?: string;
};

const PRIORITY_STATUSES = [
  'CORRECTION_REQUESTED',
  'UNDER_CORRECTION_UPDATE',
  'CHANGE_REQUESTED',
  'UNDER_CHANGE_UPDATE',
];

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
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
  const sequence = Number(match[1].slice(4));
  return Number.isFinite(sequence) ? sequence : null;
}
function isInRange(value: number | null, fromRaw?: string, toRaw?: string) {
  if (value == null) return false;
  const from = fromRaw?.trim() ? Number(fromRaw.trim()) : undefined;
  const to = toRaw?.trim() ? Number(toRaw.trim()) : undefined;
  if (from != null && Number.isFinite(from) && value < from) return false;
  if (to != null && Number.isFinite(to) && value > to) return false;
  return true;
}
function parseIds(value?: string): string[] {
  return [
    ...new Set(
      String(value || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}
function mapFormFilter(form?: string): FormType | undefined {
  switch (form) {
    case 'MICRO':
      return 'MICRO_MIX';
    case 'MICROWATER':
    case 'MICRO_WATER':
      return 'MICRO_MIX_WATER';
    case 'STERILITY':
      return 'STERILITY';
    case 'CHEMISTRY':
      return 'CHEMISTRY_MIX';
    case 'COA':
      return 'COA';
    case 'APE':
      return 'APE';
    default:
      return undefined;
  }
}
function safeDateField(value?: string) {
  return ['dateSent', 'createdAt', 'updatedAt'].includes(String(value))
    ? String(value)
    : 'dateSent';
}
function safeSortBy(value?: string) {
  return ['dateSent', 'formNumber', 'createdAt', 'updatedAt'].includes(
    String(value),
  )
    ? String(value)
    : 'formNumber';
}
function mapDashboardRow(r: any) {
  return { ...r, id: r.sourceId, dashboardId: r.id };
}

@Injectable()
export class ClientDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports(user: any, query: ClientDashboardQuery) {
    if (user.role !== UserRole.CLIENT)
      throw new ForbiddenException('Client only');
    if (!user.clientCode) throw new ForbiddenException('Client code missing');

    const page = toInt(query.page, 1);
    const perPage = Math.min(toInt(query.perPage, 10), 100);
    const pinnedIds = parseIds(query.pinnedIds);
    const discardedIds = parseIds(query.discardedCorrectionIds);
    const discardedSet = new Set(discardedIds);
    const pinOrder = new Map(pinnedIds.map((id, index) => [id, index]));
    const q = String(query.q || '')
      .trim()
      .toLowerCase();
    const client = String(query.client || '').trim();
    const reportSearch = String(query.report || '').trim();
    const sortBy = safeSortBy(query.sortBy);
    const sortDir: Prisma.SortOrder = query.sortDir === 'asc' ? 'asc' : 'desc';
    const dateField = safeDateField(query.dateField);

    // Required on every tier (including the numeric-range fallback).
    const where: Prisma.DashboardReportWhereInput = {
      clientCode: user.clientCode,
    };
    const mappedForm = mapFormFilter(query.form || 'ALL');
    if (mappedForm) where.formType = mappedForm;
    if (query.status && query.status !== 'ALL') where.status = query.status;

    const and: Prisma.DashboardReportWhereInput[] = [];
    if (q) and.push({ searchableText: { contains: q, mode: 'insensitive' } });
    if (client)
      and.push({
        OR: [
          { client: { contains: client, mode: 'insensitive' } },
          { clientCode: { contains: client, mode: 'insensitive' } },
        ],
      });
    if (reportSearch)
      and.push({
        OR: [
          { formNumber: { contains: reportSearch, mode: 'insensitive' } },
          { reportNumber: { contains: reportSearch, mode: 'insensitive' } },
        ],
      });
    const gte = parseDateStart(query.from);
    const lt = parseDateEndExclusive(query.to);
    if (gte || lt) {
      and.push({
        [dateField]: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) },
      });
    }
    if (and.length) where.AND = and;

    const rangeType = query.rangeType || 'FORM';
    const hasFormRange = Boolean(query.formFrom || query.formTo);
    const hasReportRange = Boolean(query.reportFrom || query.reportTo);
    const hasNumericRange =
      (rangeType === 'FORM' && hasFormRange) ||
      (rangeType === 'REPORT' && hasReportRange);
    const orderBy: Prisma.DashboardReportOrderByWithRelationInput[] = [
      { [sortBy]: sortDir },
      { id: 'asc' },
    ];

    // Legacy numeric sequence extraction cannot be expressed as a normal
    // Prisma where clause. Preserve its exact behavior until a numeric
    // sequence column is added and indexed in the database.
    if (hasNumericRange) {
      const rows = await this.prisma.dashboardReport.findMany({
        where,
        orderBy,
      });
      const filtered = rows.filter((r) =>
        rangeType === 'FORM'
          ? isInRange(
              extractSequence(r.formNumber),
              query.formFrom,
              query.formTo,
            )
          : isInRange(
              extractSequence(r.reportNumber),
              query.reportFrom,
              query.reportTo,
            ),
      );
      const corrections: typeof filtered = [];
      const pins: typeof filtered = [];
      const normal: typeof filtered = [];
      const pinSet = new Set(pinnedIds);
      for (const row of filtered) {
        const id = String(row.sourceId);
        if (
          PRIORITY_STATUSES.includes(String(row.status)) &&
          !discardedSet.has(id)
        )
          corrections.push(row);
        else if (pinSet.has(id)) pins.push(row);
        else normal.push(row);
      }
      pins.sort(
        (a, b) =>
          (pinOrder.get(String(a.sourceId)) ?? Infinity) -
          (pinOrder.get(String(b.sourceId)) ?? Infinity),
      );
      const ordered = [...corrections, ...pins, ...normal];
      const total = ordered.length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * perPage;
      return {
        rows: ordered.slice(skip, skip + perPage).map(mapDashboardRow),
        total,
        page: safePage,
        perPage,
        totalPages,
      };
    }

    // Disjoint priority tiers: active corrections, user's pins, then normal.
    const correctionCondition: Prisma.DashboardReportWhereInput = {
      status: { in: PRIORITY_STATUSES },
      ...(discardedIds.length ? { sourceId: { notIn: discardedIds } } : {}),
    };
    const correctionWhere: Prisma.DashboardReportWhereInput = {
      AND: [where, correctionCondition],
    };
    const pinnedWhere: Prisma.DashboardReportWhereInput = {
      AND: [
        where,
        { sourceId: { in: pinnedIds } },
        { NOT: correctionCondition },
      ],
    };
    const normalWhere: Prisma.DashboardReportWhereInput = {
      AND: [
        where,
        { NOT: correctionCondition },
        ...(pinnedIds.length ? [{ sourceId: { notIn: pinnedIds } }] : []),
      ],
    };

    const [correctionCount, pinnedRows, normalCount] = await Promise.all([
      this.prisma.dashboardReport.count({ where: correctionWhere }),
      pinnedIds.length
        ? this.prisma.dashboardReport.findMany({ where: pinnedWhere, orderBy })
        : this.prisma.dashboardReport.findMany({
            where: { AND: [where, { sourceId: { in: [] } }] },
            take: 0,
          }),
      this.prisma.dashboardReport.count({ where: normalWhere }),
    ]);
    pinnedRows.sort(
      (a, b) =>
        (pinOrder.get(String(a.sourceId)) ?? Infinity) -
        (pinOrder.get(String(b.sourceId)) ?? Infinity),
    );
    const total = correctionCount + pinnedRows.length + normalCount;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * perPage;
    const end = start + perPage;

    // Only retrieve the segments intersecting the requested page.
    const correctionSkip = Math.min(start, correctionCount);
    const correctionTake = Math.max(
      0,
      Math.min(end, correctionCount) - correctionSkip,
    );
    const pinnedStart = correctionCount;
    const pinnedEnd = pinnedStart + pinnedRows.length;
    const pinSlice = pinnedRows.slice(
      Math.max(0, start - pinnedStart),
      Math.max(0, Math.min(end, pinnedEnd) - pinnedStart),
    );
    const normalSkip = Math.max(0, start - pinnedEnd);
    const normalTake = Math.max(
      0,
      Math.min(end, total) - Math.max(start, pinnedEnd),
    );

    const [correctionRows, normalRows] = await Promise.all([
      correctionTake
        ? this.prisma.dashboardReport.findMany({
            where: correctionWhere,
            orderBy,
            skip: correctionSkip,
            take: correctionTake,
          })
        : Promise.resolve([] as typeof pinnedRows),
      normalTake
        ? this.prisma.dashboardReport.findMany({
            where: normalWhere,
            orderBy,
            skip: normalSkip,
            take: normalTake,
          })
        : Promise.resolve([] as typeof pinnedRows),
    ]);

    return {
      rows: [...correctionRows, ...pinSlice, ...normalRows].map(
        mapDashboardRow,
      ),
      total,
      page: safePage,
      perPage,
      totalPages,
    };
  }
}
