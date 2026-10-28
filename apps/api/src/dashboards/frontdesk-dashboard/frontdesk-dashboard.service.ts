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

  pinnedIds?: string;
  discardedCorrectionIds?: string;
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

function mapFormFilter(form?: string): FormType | undefined {
  switch (form) {
    case 'MICRO':
      return 'MICRO_MIX';

    case 'MICROWATER':
      return 'MICRO_MIX_WATER';

    case 'STERILITY':
      return 'STERILITY';

    case 'APE':
      return 'APE';

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

  private async addAttachmentCounts(rows: any[]) {
    if (!rows.length) return [];

    const microIds = rows
      .filter((r) => r.sourceType === 'MICRO_REPORT')
      .map((r) => String(r.sourceId))
      .filter(Boolean);

    const chemistryIds = rows
      .filter((r) => r.sourceType === 'CHEMISTRY_REPORT')
      .map((r) => String(r.sourceId))
      .filter(Boolean);

    const [microCounts, chemistryCounts] = await Promise.all([
      microIds.length
        ? this.prisma.attachment.groupBy({
            by: ['reportId'],
            where: {
              reportId: {
                in: microIds,
              },
            },
            _count: {
              _all: true,
            },
          })
        : Promise.resolve([]),

      chemistryIds.length
        ? this.prisma.chemistryAttachment.groupBy({
            by: ['chemistryId'],
            where: {
              chemistryId: {
                in: chemistryIds,
              },
            },
            _count: {
              _all: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const microCountMap = new Map<string, number>(
      microCounts.map((x: any): [string, number] => [
        String(x.reportId),
        Number(x._count?._all ?? 0),
      ]),
    );

    const chemistryCountMap = new Map<string, number>(
      chemistryCounts.map((x: any): [string, number] => [
        String(x.chemistryId),
        Number(x._count?._all ?? 0),
      ]),
    );

    return rows.map((r) => {
      let attachmentsCount = 0;

      if (r.sourceType === 'MICRO_REPORT') {
        attachmentsCount = microCountMap.get(String(r.sourceId)) ?? 0;
      } else if (r.sourceType === 'CHEMISTRY_REPORT') {
        attachmentsCount = chemistryCountMap.get(String(r.sourceId)) ?? 0;
      }

      return {
        ...mapDashboardRow(r),
        attachmentsCount,
      };
    });
  }

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

    const pinnedIds = parsePinnedIds(query.pinnedIds);
    const discardedCorrectionIds = parsePinnedIds(query.discardedCorrectionIds);
    const discardedCorrectionSet = new Set(discardedCorrectionIds);

    const pinOrder = new Map<string, number>(
      pinnedIds.map((id, index): [string, number] => [id, index]),
    );

    const form = query.form || 'ALL';
    const status = query.status || 'ALL';
    const q = String(query.q || '')
      .trim()
      .toLowerCase();
    const client = String(query.client || '').trim();
    const reportSearch = String(query.report || '').trim();

    const dateField = safeDateField(query.dateField);
    const sort: Prisma.SortOrder = query.sort === 'asc' ? 'asc' : 'desc';

    const where: Prisma.DashboardReportWhereInput = {
      // Whitelist every response, including requests supplying a status directly.
      // Centralized correction/change states are never shown on Frontdesk.
      status:
        status === 'ALL'
          ? { in: FRONTDESK_STATUSES }
          : FRONTDESK_STATUSES.includes(status)
            ? status
            : { in: [] },
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

    // Numeric sequence ranges cannot be represented safely by string comparison.
    // Retain the exact legacy sequence matching only for these explicit searches.
    const useSequenceFallback =
      (rangeType === 'FORM' && hasFormRange) ||
      (rangeType === 'REPORT' && hasReportRange);

    const orderBy: Prisma.DashboardReportOrderByWithRelationInput[] = [
      { [dateField]: sort } as Prisma.DashboardReportOrderByWithRelationInput,
      { id: 'asc' },
    ];

    if (useSequenceFallback) {
      const allRows = await this.prisma.dashboardReport.findMany({
        where,
        orderBy,
      });
      const filteredRows = allRows.filter((r) =>
        rangeType === 'FORM'
          ? isInRange(extractSequence(r.formNumber), query.formFrom, query.formTo)
          : isInRange(extractSequence(r.reportNumber), query.reportFrom, query.reportTo),
      );

      const corrections: typeof filteredRows = [];
      const pins: typeof filteredRows = [];
      const normal: typeof filteredRows = [];
      const pinnedSet = new Set(pinnedIds);
      for (const row of filteredRows) {
        const id = String(row.sourceId);
        if (
          isCorrectionPriorityStatus(String(row.status)) &&
          !discardedCorrectionSet.has(id)
        ) corrections.push(row);
        else if (pinnedSet.has(id)) pins.push(row);
        else normal.push(row);
      }
      pins.sort((a, b) =>
        (pinOrder.get(String(a.sourceId)) ?? Number.MAX_SAFE_INTEGER) -
        (pinOrder.get(String(b.sourceId)) ?? Number.MAX_SAFE_INTEGER),
      );
      const ordered = [...corrections, ...pins, ...normal];
      const total = ordered.length;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * perPage;
      return {
        rows: await this.addAttachmentCounts(ordered.slice(skip, skip + perPage)),
        total,
        page: safePage,
        perPage,
        totalPages,
      };
    }

    // Mutually exclusive tiers implement the existing global ordering:
    // active corrections, then user pins, then remaining reports.
    const correctionWhere: Prisma.DashboardReportWhereInput = {
      AND: [
        where,
        { status: { in: [
          'CORRECTION_REQUESTED', 'UNDER_CORRECTION_UPDATE',
          'CHANGE_REQUESTED', 'UNDER_CHANGE_UPDATE',
        ] } },
        ...(discardedCorrectionIds.length
          ? [{ sourceId: { notIn: discardedCorrectionIds } }]
          : []),
      ],
    };

    const notCorrection: Prisma.DashboardReportWhereInput = {
      NOT: correctionWhere,
    };
    const pinnedWhere: Prisma.DashboardReportWhereInput = {
      AND: [
        where,
        notCorrection,
        { sourceId: { in: pinnedIds.length ? pinnedIds : ['__no_pins__'] } },
      ],
    };
    const normalWhere: Prisma.DashboardReportWhereInput = {
      AND: [
        where,
        notCorrection,
        ...(pinnedIds.length ? [{ sourceId: { notIn: pinnedIds } }] : []),
      ],
    };

    const [correctionCount, pinCount, normalCount] = await Promise.all([
      this.prisma.dashboardReport.count({ where: correctionWhere }),
      pinnedIds.length
        ? this.prisma.dashboardReport.count({ where: pinnedWhere })
        : Promise.resolve(0),
      this.prisma.dashboardReport.count({ where: normalWhere }),
    ]);

    const total = correctionCount + pinCount + normalCount;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    let offset = (safePage - 1) * perPage;
    let remaining = perPage;
    const rows: Awaited<ReturnType<typeof this.prisma.dashboardReport.findMany>> = [];

    const takeTier = async (
      tierWhere: Prisma.DashboardReportWhereInput,
      count: number,
      orderedPins = false,
    ) => {
      if (!remaining) return;
      const tierOffset = Math.min(offset, count);
      offset -= tierOffset;
      if (tierOffset >= count) return;

      if (orderedPins) {
        // Pin order is based on saved client preference, not a DB column.
        // Query only the pin tier (normally small), then slice it.
        const pinRows = await this.prisma.dashboardReport.findMany({
          where: tierWhere,
          orderBy,
        });
        pinRows.sort((a, b) =>
          (pinOrder.get(String(a.sourceId)) ?? Number.MAX_SAFE_INTEGER) -
          (pinOrder.get(String(b.sourceId)) ?? Number.MAX_SAFE_INTEGER),
        );
        const batch = pinRows.slice(tierOffset, tierOffset + remaining);
        rows.push(...batch);
        remaining -= batch.length;
        return;
      }

      const batch = await this.prisma.dashboardReport.findMany({
        where: tierWhere,
        orderBy,
        skip: tierOffset,
        take: remaining,
      });
      rows.push(...batch);
      remaining -= batch.length;
    };

    await takeTier(correctionWhere, correctionCount);
    if (pinnedIds.length) await takeTier(pinnedWhere, pinCount, true);
    await takeTier(normalWhere, normalCount);

    return {
      rows: await this.addAttachmentCounts(rows),
      total,
      page: safePage,
      perPage,
      totalPages,
    };
  }
}
