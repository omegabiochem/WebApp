// audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from '@prisma/client';

type ListFilters = {
  entity?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
};

// ✅ new type for pagination
type ListPagedFilters = ListFilters & {
  page: number;
  pageSize: number;
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // existing
  listForEntity(entity: string, entityId: string) {
    return this.prisma.auditTrail.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async exportCSV(entity: string, entityId: string) {
    const rows = await this.listForEntity(entity, entityId);
    return this.rowsToCsv(rows);
  }

  // ✅ NEW: paginated list for /audit
  async listAllPaged(filters: ListPagedFilters) {
    const {
      entity,
      entityId,
      userId,
      action,
      from,
      to,
      order = 'desc',
      page,
      pageSize,
    } = filters;

    // safety
    const safePage = Math.max(1, page || 1);
    const safePageSize = Math.min(Math.max(pageSize || 20, 1), 100);
    const skip = (safePage - 1) * safePageSize;

    // where
    const where: Prisma.AuditTrailWhereInput = {};

    if (entity) where.entity = entity;

    // ✅ better search: partial + case-insensitive
    if (entityId) where.entityId = { contains: entityId, mode: 'insensitive' };
    if (userId) where.userId = { contains: userId, mode: 'insensitive' };

    if (action) where.action = action;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z'); // end-of-day
    }

    const [items, total] = await Promise.all([
      this.prisma.auditTrail.findMany({
        where,
        orderBy: { createdAt: order },
        skip,
        take: safePageSize,
      }),
      this.prisma.auditTrail.count({ where }),
    ]);

    return { items, total };
  }

  // existing export-all (no pagination)
  async exportAllCSV(filters: ListFilters = {}) {
    const where: Prisma.AuditTrailWhereInput = {};

    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId)
      where.entityId = { contains: filters.entityId, mode: 'insensitive' };
    if (filters.userId)
      where.userId = { contains: filters.userId, mode: 'insensitive' };
    if (filters.action) where.action = filters.action;

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to)
        where.createdAt.lte = new Date(filters.to + 'T23:59:59.999Z');
    }

    const rows = await this.prisma.auditTrail.findMany({
      where,
      orderBy: { createdAt: filters.order ?? 'desc' },
    });

    return this.rowsToCsv(rows);
  }

  // existing helper
  private rowsToCsv(rows: any[]) {
    const headers = [
      'createdAt',
      'userId',
      'role',
      'ipAddress',
      'action',
      'entity',
      'entityId',
      'details',
      'changes',
    ];

    const esc = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/"/g, '""')
        .replace(/\r?\n/g, ' ')}"`;

    const body = rows.map((r) =>
      [
        (r.createdAt instanceof Date
          ? r.createdAt
          : new Date(r.createdAt)
        ).toISOString(),
        r.userId ?? '',
        r.role ?? '',
        r.ipAddress ?? '',
        r.action ?? '',
        r.entity ?? '',
        r.entityId ?? '',
        JSON.stringify(r.details ?? ''),
        JSON.stringify(r.changes ?? ''),
      ]
        .map(esc)
        .join(','),
    );

    return [headers.join(','), ...body].join('\n');
  }
}
