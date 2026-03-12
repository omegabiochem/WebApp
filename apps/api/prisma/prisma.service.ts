// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getRequestContext } from 'src/common/request-context';

type AnyObj = Record<string, any>;

const OMIT_FIELDS = new Set(['updatedAt']); // reduce noise in diffs
const SKIP_MODELS = new Set(['AuditTrail']); // never audit the audit table itself

function isPlainObject(x: unknown): x is AnyObj {
  return (
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    !(x instanceof Date)
  );
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

type AuditRef = {
  entityId: string | null;
  formNumber: string | null;
  reportNumber: string | null;
  formType: any | null;
  clientCode: string | null;
};

async function resolveAuditRef(
  prisma: PrismaClient,
  entity: string,
  row: any,
): Promise<AuditRef> {
  if (!row) {
    return {
      entityId: null,
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: null,
    };
  }

  // --------------------------------------------------
  // Base MICRO/WATER/STERILITY Report
  // --------------------------------------------------
  if (entity === 'Report') {
    return {
      entityId: row.id ?? null,
      formNumber: row.formNumber ?? null,
      reportNumber: row.reportNumber ?? null,
      formType: row.formType ?? null,
      clientCode: row.clientCode ?? null,
    };
  }

  // --------------------------------------------------
  // Base CHEMISTRY/COA report
  // --------------------------------------------------
  if (entity === 'ChemistryReport') {
    return {
      entityId: row.id ?? null,
      formNumber: row.formNumber ?? null,
      reportNumber: row.reportNumber ?? null,
      formType: row.formType ?? null,
      clientCode: row.clientCode ?? null,
    };
  }

  // --------------------------------------------------
  // MICRO detail models -> Report
  // --------------------------------------------------
  if (
    entity === 'MicroMixDetails' ||
    entity === 'MicroMixWaterDetails' ||
    entity === 'sterilityDetails'
  ) {
    const reportId = row.reportId ?? null;
    if (!reportId) {
      return {
        entityId: null,
        formNumber: null,
        reportNumber: null,
        formType: null,
        clientCode: null,
      };
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        formNumber: true,
        reportNumber: true,
        formType: true,
        clientCode: true,
      },
    });

    return {
      entityId: report?.id ?? reportId,
      formNumber: report?.formNumber ?? null,
      reportNumber: report?.reportNumber ?? null,
      formType: report?.formType ?? null,
      clientCode: report?.clientCode ?? null,
    };
  }

  // --------------------------------------------------
  // CHEM detail models -> ChemistryReport
  // --------------------------------------------------
  if (entity === 'ChemistryMixDetails' || entity === 'COADetails') {
    const chemistryId = row.chemistryId ?? null;
    if (!chemistryId) {
      return {
        entityId: null,
        formNumber: null,
        reportNumber: null,
        formType: null,
        clientCode: null,
      };
    }

    const chem = await prisma.chemistryReport.findUnique({
      where: { id: chemistryId },
      select: {
        id: true,
        formNumber: true,
        reportNumber: true,
        formType: true,
        clientCode: true,
      },
    });

    return {
      entityId: chem?.id ?? chemistryId,
      formNumber: chem?.formNumber ?? null,
      reportNumber: chem?.reportNumber ?? null,
      formType: chem?.formType ?? null,
      clientCode: chem?.clientCode ?? null,
    };
  }

  // --------------------------------------------------
  // Attachments
  // --------------------------------------------------
  if (entity === 'Attachment') {
    const reportId = row.reportId ?? null;
    if (reportId) {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          formNumber: true,
          reportNumber: true,
          formType: true,
          clientCode: true,
        },
      });

      return {
        entityId: report?.id ?? reportId,
        formNumber: report?.formNumber ?? null,
        reportNumber: report?.reportNumber ?? null,
        formType: report?.formType ?? null,
        clientCode: report?.clientCode ?? null,
      };
    }
  }

  if (entity === 'ChemistryAttachment') {
    const chemistryId = row.chemistryId ?? null;
    if (chemistryId) {
      const chem = await prisma.chemistryReport.findUnique({
        where: { id: chemistryId },
        select: {
          id: true,
          formNumber: true,
          reportNumber: true,
          formType: true,
          clientCode: true,
        },
      });

      return {
        entityId: chem?.id ?? chemistryId,
        formNumber: chem?.formNumber ?? null,
        reportNumber: chem?.reportNumber ?? null,
        formType: chem?.formType ?? null,
        clientCode: chem?.clientCode ?? null,
      };
    }
  }

  // --------------------------------------------------
  // Status history models
  // --------------------------------------------------
  if (entity === 'StatusHistory') {
    const reportId = row.reportId ?? null;
    if (reportId) {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          formNumber: true,
          reportNumber: true,
          formType: true,
          clientCode: true,
        },
      });

      return {
        entityId: report?.id ?? reportId,
        formNumber: report?.formNumber ?? null,
        reportNumber: report?.reportNumber ?? null,
        formType: report?.formType ?? null,
        clientCode: report?.clientCode ?? null,
      };
    }
  }

  if (entity === 'ChemistryReportStatusHistory') {
    const chemistryId = row.chemistryId ?? null;
    if (chemistryId) {
      const chem = await prisma.chemistryReport.findUnique({
        where: { id: chemistryId },
        select: {
          id: true,
          formNumber: true,
          reportNumber: true,
          formType: true,
          clientCode: true,
        },
      });

      return {
        entityId: chem?.id ?? chemistryId,
        formNumber: chem?.formNumber ?? null,
        reportNumber: chem?.reportNumber ?? null,
        formType: chem?.formType ?? null,
        clientCode: chem?.clientCode ?? null,
      };
    }
  }

  // --------------------------------------------------
  // Fallback
  // --------------------------------------------------
  return {
    entityId:
      row.id ?? row.reportId ?? row.chemistryId ?? row.clientCode ?? null,
    formNumber: null,
    reportNumber: null,
    formType: null,
    clientCode: row.clientCode ?? null,
  };
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
        console.error(
          '[PrismaService] PrismaClient.$use is missing. Audit middleware disabled.',
        );
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

      // ✅ do not write audit trail rows for this prisma operation
      if ((ctx as any).skipAudit === true) {
        return next(params);
      }

      const where = params.args?.where || {};
      let entityId: string | null = null;
      let formNumber: string | null = null;
      let reportNumber: string | null = null;
      let formType: any | null = null;
      let clientCode: string | null = null;

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

      try {
        const refSource = result ??
          before ?? {
            id: where?.id,
            reportId: where?.reportId,
            chemistryId: where?.chemistryId,
            clientCode: where?.clientCode,
          };

        const ref = await resolveAuditRef(this as any, entity, refSource);

        entityId = ref.entityId;
        formNumber = ref.formNumber;
        reportNumber = ref.reportNumber;
        formType = ref.formType;
        clientCode = ref.clientCode;
      } catch {
        entityId =
          result?.id ??
          result?.reportId ??
          result?.chemistryId ??
          where?.id ??
          where?.reportId ??
          where?.chemistryId ??
          where?.clientCode ??
          null;

        formNumber = null;
        reportNumber = null;
        formType = null;
        clientCode =
          result?.clientCode ?? before?.clientCode ?? where?.clientCode ?? null;
      }

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

      // ✅ If saving report + details together, skip base Report audit (keep details audit)
      if (
        entity === 'Report' ||
        (entity === 'ChemistryReport' && action === 'update')
      ) {
        const patch = params.args?.data || {};
        const keys = Object.keys(patch);

        // your ReportsService always sets updatedBy in base update
        const onlyMeta = keys.length === 1 && keys[0] === 'updatedBy';

        // If the base update is just "updatedBy", it's a split-save bookkeeping update.
        // We skip its audit so you only see MicroMixDetails audit.
        if (onlyMeta) {
          return result;
        }
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

            formNumber,
            reportNumber,
            formType,
            clientCode,

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
