// audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Prisma } from '@prisma/client';

const auditUserSelect = {
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
  },
};

type ListFilters = {
  entity?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  order?: 'asc' | 'desc';
};

type ListPagedFilters = ListFilters & {
  page: number;
  pageSize: number;
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // ✅ include user
  listForEntity(entity: string, entityId: string) {
    return this.prisma.auditTrail.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'asc' },
      include: { user: auditUserSelect },
    });
  }

  async exportCSV(entity: string, entityId: string) {
    const rows = await this.listForEntity(entity, entityId);
    return this.rowsToCsv(rows);
  }

  // ✅ paginated list with user included
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

    const safePage = Math.max(1, page || 1);
    const safePageSize = Math.min(Math.max(pageSize || 20, 1), 100);
    const skip = (safePage - 1) * safePageSize;

    const where: Prisma.AuditTrailWhereInput = {};

    if (entity) where.entity = entity;
    if (entityId) where.entityId = { contains: entityId, mode: 'insensitive' };
    if (userId) where.userId = { contains: userId, mode: 'insensitive' };
    if (action) where.action = action;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    const [items, total] = await Promise.all([
      this.prisma.auditTrail.findMany({
        where,
        orderBy: { createdAt: order },
        skip,
        take: safePageSize,
        include: { user: auditUserSelect }, // ✅ add this
      }),
      this.prisma.auditTrail.count({ where }),
    ]);

    return { items, total };
  }

  // ✅ export-all with user included
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
      include: { user: auditUserSelect }, // ✅ add this
    });

    return this.rowsToCsv(rows);
  }

  // ✅ update CSV columns to include name/email
  private rowsToCsv(rows: any[]) {
    const headers = [
      'createdAt',
      'userId',
      'userName',
      'userEmail',
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
        (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
        r.userId ?? '',
        r.user?.name ?? '',
        r.user?.email ?? '',
        r.role ?? r.user?.role ?? '',
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