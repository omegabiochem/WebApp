// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { getMeta } from 'src/common/request-context';

function normalize(v: any) {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object') {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return null;
    }
  }
  return v ?? null;
}

function buildDiff(before: any, after: any): Prisma.InputJsonValue | null {
  const b = before ?? {};
  const a = after ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const out: Record<string, { from: any; to: any }> = {};
  for (const k of keys) {
    const from = normalize(b[k]);
    const to = normalize(a[k]);
    if (JSON.stringify(from) !== JSON.stringify(to)) out[k] = { from, to };
  }
  return Object.keys(out).length ? { fields: out } : null;
}

const WRITE_OPS = new Set([
  'create',
  'update',
  'upsert',
  'delete',
  'updateMany',
  'deleteMany',
  'createMany',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  // ...
  async onModuleInit() {
    await this.$connect();

    (this as any).$use(async (params: any, next: any) => {
      if (params.model === 'AuditTrail') return next(params);
      if (!WRITE_OPS.has(params.action)) return next(params);

      const entity = params.model!;
      let before: any = null;

      const where = (params.args?.where ?? null) as any;
      if (where && 'id' in where && ['update', 'delete', 'upsert'].includes(params.action)) {
        try {
          before = await (this as any)[entity].findUnique({ where });
        } catch { }
      }

      return next(params).then(async (result: any) => {
        const meta = getMeta();
        const action = params.action.toUpperCase();
        const after = ['delete', 'deleteMany'].includes(params.action) ? null : result;

        const entityId = (after as any)?.id ?? (before as any)?.id ?? null;

        const changes = ['createMany', 'updateMany', 'deleteMany'].includes(params.action)
          ? null
          : buildDiff(before, after);

        const details =
          params.action === 'update' && before
            ? `Updated fields on ${entity}(${entityId})`
            : `${entity} ${action}`;

        await (this as any).auditTrail.create({
          data: {
            action,
            entity,
            entityId,
            details,
            changes,
            userId: meta.userId ?? null,
            role: meta.role ?? null,
            ipAddress: (meta.ip as any) ?? null,
          },
        });

        return result;
      });
    });
  }


  async onModuleDestroy() {
    await this.$disconnect();
  }
}
