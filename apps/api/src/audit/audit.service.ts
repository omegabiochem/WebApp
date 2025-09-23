import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

type ListFilters = {
  entity?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string; // ISO date-time string
  to?: string;   // ISO date-time string
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // ---------- existing ----------
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

  // ---------- NEW: list all (optionally filtered) ----------
  listAll(filters: ListFilters = {}) {
    const where: any = {};

    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    return this.prisma.auditTrail.findMany({
      where,
      orderBy: { createdAt: 'desc' }, // latest first for the “all” view
    });
  }

  // ---------- NEW: export all (optionally filtered) ----------
  async exportAllCSV(filters: ListFilters = {}) {
    const rows = await this.listAll(filters);
    return this.rowsToCsv(rows);
  }

  // ---------- shared CSV helper ----------
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
        .replace(/\r?\n/g, ' ')}"`; // flatten newlines to keep CSV tidy

    const body = rows.map((r) =>
      [
        (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
        r.userId ?? '',
        r.role ?? '',
        r.ipAddress ?? '',
        r.action ?? '',
        r.entity ?? '',
        r.entityId ?? '',
        // details/changes may be JSON or string; stringify to preserve content
        JSON.stringify(r.details ?? ''),
        JSON.stringify(r.changes ?? ''),
      ]
        .map(esc)
        .join(','),
    );

    return [headers.join(','), ...body].join('\n');
  }
}
