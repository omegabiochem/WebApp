// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getRequestContext } from 'src/common/request-context';

type Writable = Record<string, any>;
const OMIT_FIELDS = new Set(['updatedAt']); // avoid noisy diffs

function prune(obj: Writable | null | undefined) {
  if (!obj || typeof obj !== 'object') return obj as any;
  const out: Writable = {};
  for (const [k, v] of Object.entries(obj)) {
    if (OMIT_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function computeDiff(before: Writable, afterPatch: Writable) {
  const diff: { before: Writable; after: Writable } = { before: {}, after: {} };
  const beforeP = prune(before) || {};
  for (const [k, v] of Object.entries(afterPatch || {})) {
    if (OMIT_FIELDS.has(k)) continue;
    const prev = (beforeP as any)[k];
    const changed =
      (prev instanceof Date && v instanceof Date && prev.getTime() !== v.getTime()) ||
      (!(prev instanceof Date) && JSON.stringify(prev) !== JSON.stringify(v));
    if (changed) {
      diff.before[k] = prev === undefined ? null : prev;
      diff.after[k] = v;
    }
  }
  return Object.keys(diff.after).length ? diff : null;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Some environments end up resolving an older Prisma client at runtime.
    // Guard it so the app starts even if $use is missing.
    const hasUse = typeof (this as any).$use === 'function';
    if (!hasUse) {
      // Optional: log the detected @prisma/client version for troubleshooting
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const v = require('@prisma/client/package.json')?.version;
        // eslint-disable-next-line no-console
        console.error(
          `[PrismaService] PrismaClient.$use is missing (version detected: ${v}). ` +
          'Audit middleware disabled. Make sure @prisma/client and prisma are the same 5.x version at runtime.'
        );
      } catch {
        // eslint-disable-next-line no-console
        console.error(
          '[PrismaService] PrismaClient.$use is missing. Audit middleware disabled.'
        );
      }
      return;
    }

    // ---------- GLOBAL AUDIT MIDDLEWARE ----------
    (this as any).$use(async (params: any, next: any) => {
      const result = await next(params);

      const entity = params.model as string | undefined;
      const action = params.action as string;

      // Skip non-domain models and the audit table itself
      if (!entity || entity === 'AuditTrail') return result;
      if (!['create', 'update', 'delete', 'upsert'].includes(action)) return result;

      const ctx = getRequestContext() || {};
      const entityId =
        (result && (result as any).id) ||
        (params.args?.where && (params.args.where as any).id) ||
        null;

      let changes: any = null;
      let details = '';

      try {
        if (action === 'create') {
          changes = { after: prune(result) };
          details = `Created ${entity} ${entityId ?? ''}`;
        } else if (action === 'update') {
          // best-effort fetch previous
          let before: any = null;
          try {
            if (entityId) {
              // @ts-ignore dynamic access
              before = await (this as any)[entity].findUnique({ where: { id: entityId } });
            }
          } catch { /* ignore */ }
          const diff = computeDiff(before || {}, params.args?.data || {});
          changes = diff || {};
          details = `Updated ${entity} ${entityId ?? ''}`;
        } else if (action === 'delete') {
          let before: any = null;
          try {
            if (entityId) {
              // @ts-ignore dynamic access
              before = await (this as any)[entity].findUnique({ where: { id: entityId } });
            }
          } catch { /* ignore */ }
          changes = { before: prune(before) };
          details = `Deleted ${entity} ${entityId ?? ''}`;
        } else if (action === 'upsert') {
          changes = { after: prune(result) };
          details = `Upserted ${entity} ${entityId ?? ''}`;
        }
      } catch {
        details = `${details} (audit probe failed)`;
      }

      if ((ctx as any).reason) {
        details = `${details} | reason: ${(ctx as any).reason}`;
      }

      // Write the audit row (do not block main op on failure)
      try {
        // @ts-ignore dynamic access
        await (this as any).auditTrail.create({
          data: {
            action: action.toUpperCase(),
            entity: String(entity),
            entityId,
            changes,
            details,
            role: (ctx as any).role ?? null,
            userId: (ctx as any).userId ?? null,
            ipAddress: (ctx as any).ip ?? null,
          },
        });
      } catch {
        // swallow
      }

      return result;
    });
  }
}
