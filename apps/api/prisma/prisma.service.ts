// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getRequestContext } from 'src/common/request-context';

type AnyObj = Record<string, any>;

const OMIT_FIELDS = new Set(['updatedAt']); // reduce noise in diffs
const SKIP_MODELS = new Set(['AuditTrail']); // never audit the audit table itself

function isPlainObject(x: unknown): x is AnyObj {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && !(x instanceof Date);
}

function prune(input: unknown): unknown {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map((v) => prune(v));
  }

  if (input instanceof Date) {
    return input; // keep date as-is
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const out: AnyObj = {};
  for (const [k, v] of Object.entries(input)) {
    if (OMIT_FIELDS.has(k)) continue;
    out[k] = prune(v);
  }
  return out;
}

/**
 * PATCH-style diff: only compares keys present in afterPatch (params.args.data)
 */
function computeDiff(before: AnyObj, afterPatch: AnyObj) {
  const diff: { before: AnyObj; after: AnyObj } = { before: {}, after: {} };
  const beforeP = (prune(before) as AnyObj) || {};

  for (const [k, v] of Object.entries(afterPatch || {})) {
    if (OMIT_FIELDS.has(k)) continue;

    const prev = (beforeP as any)[k];

    const changed =
      (prev instanceof Date &&
        v instanceof Date &&
        prev.getTime() !== v.getTime()) ||
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

    const hasUse = typeof (this as any).$use === 'function';
    if (!hasUse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const v = require('@prisma/client/package.json')?.version;
        // eslint-disable-next-line no-console
        console.error(
          `[PrismaService] PrismaClient.$use is missing (version: ${v}). Audit middleware disabled.`,
        );
      } catch {
        // eslint-disable-next-line no-console
        console.error('[PrismaService] PrismaClient.$use is missing. Audit middleware disabled.');
      }
      return;
    }

    (this as any).$use(async (params: any, next: any) => {
      const entity = params.model as string | undefined;
      const action = params.action as string;

      if (!entity || SKIP_MODELS.has(entity)) {
        return next(params);
      }

      const AUDIT_ACTIONS = new Set(['create', 'update', 'delete', 'upsert']);
      if (!AUDIT_ACTIONS.has(action)) {
        return next(params);
      }

      const ctx = getRequestContext() || {};
      const where = params.args?.where || {};
      let entityId: string | null = where?.id ?? null;

      // -------- FETCH BEFORE (ONLY FOR OPS THAT MODIFY EXISTING) --------
      let before: any = null;
      try {
        if (action === 'update' || action === 'delete' || action === 'upsert') {
          if (where && Object.keys(where).length) {
            before = await (this as any)[entity].findUnique({ where });
          }
        }
      } catch {
        // swallow
      }

      // -------- DO MAIN OP --------
      const result = await next(params);

      if (!entityId && result?.id) entityId = result.id;

      // -------- BUILD AUDIT ROW --------
      let changes: any = null;
      let details = '';

      try {
        if (action === 'create') {
          changes = { after: prune(result) };
          details = `Created ${entity} ${entityId ?? ''}`.trim();
        }

        if (action === 'update') {
          const patch = params.args?.data || {};
          const diff = computeDiff(before || {}, patch);
          changes = diff || {};
          details = `Updated ${entity} ${entityId ?? ''}`.trim();
        }

        if (action === 'delete') {
          changes = { before: prune(before) };
          details = `Deleted ${entity} ${entityId ?? ''}`.trim();
        }

        if (action === 'upsert') {
          changes = before
            ? { before: prune(before), after: prune(result) }
            : { after: prune(result) };
          details = `Upserted ${entity} ${entityId ?? ''}`.trim();
        }
      } catch {
        changes = changes ?? {};
        details = `${details} (audit probe failed)`.trim();
      }

      if ((ctx as any).reason) {
        details = `${details} | reason: ${(ctx as any).reason}`;
      }

      // -------- WRITE AUDIT (BEST EFFORT) --------
      try {
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

      // =====================================================================
      // SPECIAL #1: Report status changes -> StatusHistory (MICRO + MICRO WATER)
      // =====================================================================
      try {
        if (entity === 'Report') {
          const prevStatus = before?.status ?? null;
          const nextStatus =
            result?.status ??
            params.args?.data?.status ??
            params.args?.update?.status ??
            null;

          if (prevStatus && nextStatus && prevStatus !== nextStatus) {
            const reason = (ctx as any).reason ?? null;

            await (this as any).statusHistory.create({
              data: {
                reportId: entityId ?? result?.id,
                from: prevStatus,
                to: nextStatus,
                reason,
                userId: (ctx as any).userId ?? null,
                role: (ctx as any).role ?? null,
                ipAddress: (ctx as any).ip ?? null,
              },
            });
          }
        }
      } catch {
        // swallow
      }

      // =====================================================================
      // SPECIAL #2: ChemistryReport status changes -> ChemistryReportStatusHistory
      // =====================================================================
      try {
        if (entity === 'ChemistryReport') {
          const prevStatus = before?.status ?? null;
          const nextStatus =
            result?.status ??
            params.args?.data?.status ??
            params.args?.update?.status ??
            null;

          if (prevStatus && nextStatus && prevStatus !== nextStatus) {
            const reason = (ctx as any).reason ?? null;

            await (this as any).chemistryReportStatusHistory.create({
              data: {
                chemistryId: entityId ?? result?.id,
                from: prevStatus,
                to: nextStatus,
                reason,
                userId: (ctx as any).userId ?? null,
                role: (ctx as any).role ?? null,
                ipAddress: (ctx as any).ip ?? null,
              },
            });
          }
        }
      } catch {
        // swallow
      }

      return result;
    });
  }
}
