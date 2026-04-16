// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getRequestContext } from 'src/common/request-context';

type AnyObj = Record<string, any>;

const OMIT_FIELDS = new Set(['updatedAt']); // reduce noise in diffs
const SKIP_MODELS = new Set([
  'AuditTrail',
  'StatusHistory',
  'ChemistryReportStatusHistory',
  'Notification',
  'NotificationOutbox',
  'MessageNotificationOutbox',
]); // never audit the audit table itself

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

function resolveAction(
  entity: string,
  action: string,
  before: any,
  after: any,
  patch: any,
  auditRef?: { reportNumber?: string | null; formNumber?: string | null },
) {
  if (entity === 'User') {
    if (action === 'create') return 'ACCOUNT_CREATED';

    if (action === 'update') {
      if ('passwordHash' in patch) return 'PASSWORD_RESET';
      if ('role' in patch) return 'USER_ROLE_CHANGED';
      if ('active' in patch)
        return patch.active ? 'USER_ENABLED' : 'USER_DISABLED';
      if ('passwordVersion' in patch) return 'FORCE_SIGNOUT';
      return 'USER_UPDATED';
    }

    if (action === 'delete') return 'ACCOUNT_DELETED';
  }

  const isRootReport = entity === 'Report' || entity === 'ChemistryReport';

  const isDetailReport =
    entity === 'MicroMixDetails' ||
    entity === 'MicroMixWaterDetails' ||
    entity === 'sterilityDetails' ||
    entity === 'ChemistryMixDetails' ||
    entity === 'COADetails';

  if (isRootReport) {
    const hasReportNumber =
      !!auditRef?.reportNumber ||
      !!before?.reportNumber ||
      !!after?.reportNumber ||
      !!patch?.reportNumber;

    if (action === 'create') {
      return hasReportNumber ? 'REPORT_CREATED' : 'FORM_CREATED';
    }

    if (action === 'update') {
      const reportNumberWasEmpty =
        !before?.reportNumber && !!(patch?.reportNumber || after?.reportNumber);

      if (reportNumberWasEmpty) {
        return 'REPORT_CREATED';
      }

      if ('status' in patch) {
        const next = patch.status;

        if (next === 'CHANGE_REQUESTED') return 'CHANGE_REQUESTED';
        if (next === 'CORRECTION_REQUESTED') return 'CORRECTION_REQUESTED';
        if (next === 'FINAL_APPROVED' || next === 'APPROVED')
          return 'REPORT_APPROVED';
        if (next === 'VOID') return 'REPORT_VOIDED';
        if (next === 'LOCKED') return 'REPORT_LOCKED';

        return 'STATUS_CHANGED';
      }

      return hasReportNumber ? 'REPORT_UPDATED' : 'FORM_UPDATED';
    }

    if (action === 'delete') {
      return hasReportNumber ? 'REPORT_DELETED' : 'FORM_DELETED';
    }
  }

  // if (isDetailReport) {
  //   if (action === 'create') return 'DETAILS_CREATED';
  //   if (action === 'update') return 'DETAILS_UPDATED';
  //   if (action === 'delete') return 'DETAILS_DELETED';
  // }

  if (isDetailReport) {
  const hasReportNumber =
    !!auditRef?.reportNumber ||
    !!before?.reportNumber ||
    !!after?.reportNumber ||
    !!patch?.reportNumber;

  if (action === 'create') {
    return hasReportNumber ? 'REPORT_CREATED' : 'FORM_CREATED';
  }

  if (action === 'update') {
    return hasReportNumber ? 'REPORT_UPDATED' : 'FORM_UPDATED';
  }

  if (action === 'delete') {
    return hasReportNumber ? 'REPORT_DELETED' : 'FORM_DELETED';
  }
}

  if (entity === 'ClientSequence') {
  if (action === 'upsert' || action === 'create' || action === 'update') {
    return 'FORM_NUMBER_ASSIGNED';
  }
}

if (entity === 'LabReportSequence') {
  if (action === 'upsert' || action === 'create' || action === 'update') {
    return 'REPORT_NUMBER_ASSIGNED';
  }
}

  if (entity === 'Notification') {
    if (action === 'create') return 'NOTIFICATION_CREATED';
    if (action === 'update') {
      if ('readAt' in patch) return 'NOTIFICATION_READ';
      return 'NOTIFICATION_UPDATED';
    }
    if (action === 'delete') return 'NOTIFICATION_DELETED';
  }

  if (entity === 'NotificationOutbox') {
    if (action === 'create') return 'NOTIFICATION_QUEUED';

    if (action === 'update') {
      if ('sentAt' in patch && patch.sentAt) return 'NOTIFICATION_SENT';
      if ('claimedAt' in patch) return 'NOTIFICATION_CLAIMED';
      if ('attempts' in patch) return 'NOTIFICATION_RETRY';
      return 'NOTIFICATION_OUTBOX_UPDATED';
    }

    if (action === 'delete') return 'NOTIFICATION_OUTBOX_DELETED';
  }

  if (entity === 'Attachment' || entity === 'ChemistryAttachment') {
    if (action === 'create') return 'ATTACHMENT_UPLOADED';
    if (action === 'delete') return 'ATTACHMENT_DELETED';
    if (action === 'update') return 'ATTACHMENT_UPDATED';
  }

  return action.toUpperCase();
}

function resolveDetails(
  entity: string,
  action: string,
  before: any,
  after: any,
  patch: any,
  auditRef?: { reportNumber?: string | null; formNumber?: string | null },
) {
  if (entity === 'User') {
    const name =
      after?.name || after?.userId || after?.email || before?.name || 'User';

    if (action === 'ACCOUNT_CREATED') {
      return `Created user ${name}`;
    }

    if (action === 'PASSWORD_RESET') {
      return `Reset password for user ${name}`;
    }

    if (action === 'USER_ROLE_CHANGED') {
      return `Changed role for ${name} from ${before?.role} → ${after?.role}`;
    }

    if (action === 'USER_DISABLED') {
      return `Disabled user ${name}`;
    }

    if (action === 'USER_ENABLED') {
      return `Enabled user ${name}`;
    }

    if (action === 'FORCE_SIGNOUT') {
      return `Forced signout for ${name}`;
    }
  }
  const isRootReport = entity === 'Report' || entity === 'ChemistryReport';

  const isDetailReport =
    entity === 'MicroMixDetails' ||
    entity === 'MicroMixWaterDetails' ||
    entity === 'sterilityDetails' ||
    entity === 'ChemistryMixDetails' ||
    entity === 'COADetails';

  if (isRootReport) {
    const hasReportNumber =
      !!auditRef?.reportNumber ||
      !!before?.reportNumber ||
      !!after?.reportNumber ||
      !!patch?.reportNumber;

    const label = hasReportNumber
      ? auditRef?.reportNumber ||
        after?.reportNumber ||
        before?.reportNumber ||
        auditRef?.formNumber ||
        after?.formNumber ||
        before?.formNumber ||
        ''
      : auditRef?.formNumber || after?.formNumber || before?.formNumber || '';

    if (patch?.status) {
      return `Status changed from ${before?.status} → ${patch.status}`;
    }

    if (action === 'FORM_CREATED') return `Created form ${label}`;
    if (action === 'FORM_UPDATED') return `Updated form ${label}`;
    if (action === 'FORM_DELETED') return `Deleted form ${label}`;

    if (action === 'REPORT_CREATED') return `Created report ${label}`;
    if (action === 'REPORT_UPDATED') return `Updated report ${label}`;
    if (action === 'REPORT_DELETED') return `Deleted report ${label}`;
  }

  // if (isDetailReport) {
  //   const label =
  //     auditRef?.reportNumber ||
  //     auditRef?.formNumber ||
  //     after?.reportNumber ||
  //     after?.formNumber ||
  //     before?.reportNumber ||
  //     before?.formNumber ||
  //     '';

  //   if (action === 'DETAILS_CREATED') return `Created details for ${label}`;
  //   if (action === 'DETAILS_UPDATED') return `Updated details for ${label}`;
  //   if (action === 'DETAILS_DELETED') return `Deleted details for ${label}`;
  // }

  if (isDetailReport) {
  const hasReportNumber =
    !!auditRef?.reportNumber ||
    !!before?.reportNumber ||
    !!after?.reportNumber ||
    !!patch?.reportNumber;

  const label = hasReportNumber
    ? auditRef?.reportNumber ||
      after?.reportNumber ||
      before?.reportNumber ||
      auditRef?.formNumber ||
      after?.formNumber ||
      before?.formNumber ||
      ''
    : auditRef?.formNumber || after?.formNumber || before?.formNumber || '';

  if (action === 'FORM_CREATED') return `Created form ${label}`;
  if (action === 'FORM_UPDATED') return `Updated form ${label}`;
  if (action === 'FORM_DELETED') return `Deleted form ${label}`;

  if (action === 'REPORT_CREATED') return `Created report ${label}`;
  if (action === 'REPORT_UPDATED') return `Updated report ${label}`;
  if (action === 'REPORT_DELETED') return `Deleted report ${label}`;
}

  if (entity === 'ClientSequence') {
  const client =
    after?.clientCode || before?.clientCode || patch?.clientCode || 'client';

  const assigned =
    after?.lastNumber ?? patch?.lastNumber ?? before?.lastNumber ?? '';

  return `Assigned form number for ${client}${assigned !== '' ? ` (${assigned})` : ''}`;
}

if (entity === 'LabReportSequence') {
  const client =
    after?.clientCode || before?.clientCode || patch?.clientCode || 'client';

  const assigned =
    after?.lastNumber ?? patch?.lastNumber ?? before?.lastNumber ?? '';

  return `Assigned report number for ${client}${assigned !== '' ? ` (${assigned})` : ''}`;
}

  if (entity === 'Notification') {
    const label =
      after?.title ||
      before?.title ||
      after?.kind ||
      before?.kind ||
      'notification';

    if (action === 'NOTIFICATION_CREATED') {
      return `Notification created: ${label}`;
    }

    if (action === 'NOTIFICATION_READ') {
      return `Notification read: ${label}`;
    }

    if (action === 'NOTIFICATION_UPDATED') {
      return `Notification updated: ${label}`;
    }

    if (action === 'NOTIFICATION_DELETED') {
      return `Notification deleted: ${label}`;
    }
  }

  if (entity === 'NotificationOutbox') {
    const label =
      after?.formNumber ||
      before?.formNumber ||
      after?.newStatus ||
      before?.newStatus ||
      'notification';

    if (action === 'NOTIFICATION_QUEUED') {
      return `Notification queued: ${label}`;
    }

    if (action === 'NOTIFICATION_SENT') {
      return `Notification sent: ${label}`;
    }

    if (action === 'NOTIFICATION_CLAIMED') {
      return `Notification claimed: ${label}`;
    }

    if (action === 'NOTIFICATION_RETRY') {
      return `Notification retry: ${label}`;
    }

    if (action === 'NOTIFICATION_OUTBOX_UPDATED') {
      return `Notification outbox updated: ${label}`;
    }

    if (action === 'NOTIFICATION_OUTBOX_DELETED') {
      return `Notification outbox deleted: ${label}`;
    }
  }

  if (entity === 'Attachment' || entity === 'ChemistryAttachment') {
    const label = after?.filename || before?.filename || 'attachment';

    if (action === 'ATTACHMENT_UPLOADED') {
      return `Attachment uploaded: ${label}`;
    }

    if (action === 'ATTACHMENT_DELETED') {
      return `Attachment deleted: ${label}`;
    }

    if (action === 'ATTACHMENT_UPDATED') {
      return `Attachment updated: ${label}`;
    }
  }

  return `${action} ${entity}`;
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
      // const SKIP_DETAIL_AUDIT = new Set([
      //   'MicroMixDetails',
      //   'MicroMixWaterDetails',
      //   'sterilityDetails',
      //   'ChemistryMixDetails',
      //   'COADetails',
      // ]);

      // if (entity && SKIP_DETAIL_AUDIT.has(entity)) {
      //   return next(params);
      // }
      const action = params.action as string;
      if (entity === 'Attachment' || entity === 'ChemistryAttachment') {
        return next(params);
      }

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
        const patch = params.args?.data || {};

        if (action === 'create') {
          changes = { after: prune(result) };
        }

        if (action === 'update') {
          const diff = computeDiff(before || {}, patch);
          changes = diff || {};
        }

        if (action === 'delete') {
          changes = { before: prune(before) };
        }

        if (action === 'upsert') {
          changes = before
            ? { before: prune(before), after: prune(result) }
            : { after: prune(result) };
        }

        // const resolvedAction = resolveAction(
        //   entity,
        //   action,
        //   before,
        //   result,
        //   patch,
        // );
        // details = resolveDetails(entity, resolvedAction, before, result, patch);
      } catch {
        changes = changes ?? {};
        details =
          `${action.toUpperCase()} ${entity} (audit probe failed)`.trim();
      }

      if ((ctx as any).reason) {
        details = `${details} | reason: ${(ctx as any).reason}`;
      }

      // ✅ If saving report + details together, skip base Report audit (keep details audit)
      const isAttachment =
        entity === 'Attachment' || entity === 'ChemistryAttachment';

      // Skip only base report metadata updates (not attachments)
      if (
        !isAttachment &&
        (entity === 'Report' ||
          (entity === 'ChemistryReport' && action === 'update'))
      ) {
        const patch = params.args?.data || {};
        const keys = Object.keys(patch);

        const onlyMeta = keys.length === 1 && keys[0] === 'updatedBy';

        if (onlyMeta) {
          return result;
        }
      }

      if (entity === 'User' && action === 'update') {
        const patch = params.args?.data || {};

        const keys = Object.keys(patch).sort();

        const authOnlyKeys = [
          'failedLoginCount',
          'lockedUntil',
          'lastFailedLoginAt',
          'lastLoginAt',
          'lastActivityAt',
          'refreshTokenHash',
          'refreshTokenExpAt',
          'refreshTokenRotatedAt',
          'twoFactorCodeHash',
          'twoFactorExpiresAt',
          'twoFactorAttempts',
        ].sort();

        const isAuthBookkeeping =
          keys.length > 0 && keys.every((k) => authOnlyKeys.includes(k));

        if (isAuthBookkeeping) {
          return result;
        }
      }
      const patch = params.args?.data || {};
      const auditRefMeta = { reportNumber, formNumber };

      const resolvedAction = resolveAction(
        entity,
        action,
        before,
        result,
        patch,
        auditRefMeta,
      );

      const resolvedDetails = resolveDetails(
        entity,
        resolvedAction,
        before,
        result,
        patch,
        auditRefMeta,
      );

      // -------- WRITE AUDIT (BEST EFFORT) --------

      const rawUserId = (ctx as any).userId;
      const auditUserId =
        rawUserId && !String(rawUserId).startsWith('m2m:') ? rawUserId : null;
      try {
        await (this as any).auditTrail.create({
          data: {
            action: resolvedAction,
            entity: String(entity),
            entityId,
            changes,
            details: (ctx as any).reason
              ? `${resolvedDetails} | reason: ${(ctx as any).reason}`
              : resolvedDetails,

            formNumber,
            reportNumber,
            formType,
            clientCode,

            role: (ctx as any).role ?? 'SYSTEMADMIN',
            userId: auditUserId,
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
                userId: auditUserId,
                role: (ctx as any).role ?? 'SYSTEMADMIN',
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
                userId: auditUserId,
                role: (ctx as any).role ?? 'SYSTEMADMIN',
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
