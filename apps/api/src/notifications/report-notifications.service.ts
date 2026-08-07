import { Injectable, Logger } from '@nestjs/common';
import {
  ChemistryReportStatus,
  FormType,
  ReportStatus,
  UserRole,
} from '@prisma/client';

import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from 'src/mail/notification-recipients.service';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationService } from './inAppNotifications/notification.service';

type NotifyArgs = {
  formType: FormType;
  reportId: string;
  formNumber: string;
  clientName: string;
  clientCode?: string | null;
  clientEmail?: string | null;
  oldStatus: string;
  newStatus: string;
  reportUrl?: string;
  actorUserId?: string | null;
};

type WorkflowRequestKind = 'CHANGE' | 'CORRECTION';

type DeliveryOptions = {
  forceImmediate?: boolean;

  roles?: UserRole[];
  emailRoles?: UserRole[];

  extraMeta?: Record<string, any>;

  // Optional wording overrides for correction/change approvals.
  subject?: string;
  badgeText?: string;
  badgeTone?: NotificationTone;
  priorityLine?: string;
};

const APPROVAL_ROLES: UserRole[] = ['ADMIN', 'SYSTEMADMIN', 'QA'];

function nice(s: string) {
  return String(s).replace(/_/g, ' ');
}

function deptForFormType(formType: FormType) {
  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY' ||
    formType === 'APE'
  ) {
    return 'MICRO';
  }

  if (formType === 'CHEMISTRY_MIX' || formType === 'COA') {
    return 'CHEMISTRY';
  }

  return 'LAB';
}

function normalizeEmails(emails: string[]) {
  return [
    ...new Set(
      emails
        .flatMap((email) => String(email ?? '').split(/[;,]/))
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  ].sort();
}

// ✅ your Option C policy
// function isUrgentStatus(s: ReportStatus) {
//   // “requires human action right now”
//   // if (s === 'SUBMITTED_BY_CLIENT') return true;

//   // anything “needs correction”
//   if (String(s).includes('NEEDS_CORRECTION')) return true;

//   // you can add more if needed (optional)
//   return false;
// }

// add near top helpers
function isCorrectionOrChangeRequestedStatus(status: string) {
  return (
    status === 'CHANGE_REQUESTED' ||
    status === 'CORRECTION_REQUESTED' ||
    status.includes('NEEDS_CORRECTION')
  );
}

function isCorrectionOrChangeUpdateStatus(status: string) {
  return (
    status === 'UNDER_CHANGE_UPDATE' || status === 'UNDER_CORRECTION_UPDATE'
  );
}

// replace isUrgentStatus
function isUrgentStatus(s: ReportStatus) {
  const str = String(s);

  if (
    str.includes('NEEDS_CORRECTION') ||
    str === 'CORRECTION_REQUESTED' ||
    str === 'CHANGE_REQUESTED' ||
    str === 'UNDER_CORRECTION_UPDATE' ||
    str === 'UNDER_CHANGE_UPDATE'
  ) {
    return true;
  }

  return false;
}

function highlightForStatus(status: string) {
  if (
    status.includes('NEEDS_CORRECTION') ||
    status === 'CORRECTION_REQUESTED' ||
    status === 'CHANGE_REQUESTED'
  ) {
    return {
      badgeText: 'Action Required',
      badgeTone: 'RED' as const,
      priorityLine:
        'Action required: Please review and address the requested changes or corrections.',
    };
  }

  if (
    status === 'UNDER_CORRECTION_UPDATE' ||
    status === 'UNDER_CHANGE_UPDATE'
  ) {
    return {
      badgeText: 'Update in Progress',
      badgeTone: 'ORANGE' as const,
      priorityLine:
        'Update is in progress based on requested corrections or changes.',
    };
  }

  if (status === 'SUBMITTED_BY_CLIENT') {
    return {
      badgeText: 'New Submission',
      badgeTone: 'BLUE' as const,
      priorityLine:
        'Action required: Please review and start processing this submission.',
    };
  }

  // if (
  //   status === 'UNDER_CLIENT_PRELIMINARY_REVIEW' ||
  //   status === 'UNDER_CLIENT_FINAL_REVIEW' ||
  //   status === 'UNDER_CLIENT_REVIEW'
  // ) {
  //   return {
  //     badgeText: 'Review Required',
  //     badgeTone: 'ORANGE' as const,
  //     priorityLine:
  //       'Action required: Please review the report and approve or request corrections.',
  //   };
  // }

  if (status === 'UNDER_CLIENT_PRELIMINARY_REVIEW') {
    return {
      badgeText: 'Preliminary Results Ready',
  badgeTone: 'DARK_GREEN' as const,
      priorityLine:
        'Action required: Preliminary results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'UNDER_CLIENT_FINAL_REVIEW') {
    return {
      badgeText: 'Final Results Ready',
    badgeTone: 'DARK_GREEN' as const,
      priorityLine:
        'Action required: Final results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'UNDER_CLIENT_REVIEW') {
    return {
      badgeText: 'Results Ready',
    badgeTone: 'DARK_GREEN' as const,
      priorityLine:
        'Action required:  Results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'APPROVED' || status === 'FINAL_APPROVED') {
    return {
      badgeText: 'Approved',
      badgeTone: 'GREEN' as const,
      priorityLine: 'This report has been approved.',
    };
  }

  return {
    badgeText: 'Update',
    badgeTone: 'GRAY' as const,
    priorityLine: undefined,
  };
}

type NotificationTone =
  | 'RED'
  | 'ORANGE'
  | 'BLUE'
  | 'GRAY'
  | 'GREEN'
  | 'DARK_GREEN'
  | 'LIGHT_GREEN'
  | 'PURPLE';

function subjectMarkerForTone(tone: NotificationTone): string {
  switch (tone) {
    case 'RED':
      return '🔴';

    case 'ORANGE':
      return '🟠';

    case 'BLUE':
      return '🔵';

    case 'GREEN':
      return '🟢';
      case 'DARK_GREEN':
  return '🟢';

case 'LIGHT_GREEN':
  return '🟩';

case 'PURPLE':
  return '🟣';

    case 'GRAY':
    default:
      return '⚪';
  }
}

function buildNotificationSubject(args: {
  badgeText: string;
  badgeTone: NotificationTone;
  title: string;
  formNumber: string;
}) {
  const marker = subjectMarkerForTone(args.badgeTone);

  return `${marker} ${args.badgeText} — Omega LIMS — ${args.title} (${args.formNumber})`;
}

function uniqueRoles(roles: UserRole[]) {
  return [...new Set(roles)];
}

function rolesForLabByFormType(formType: FormType): UserRole[] {
  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY' ||
    formType === 'APE'
  ) {
    return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC', 'MICRO']);
  }

  if (formType === 'CHEMISTRY_MIX' || formType === 'COA') {
    return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC', 'CHEMISTRY']);
  }

  return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC']);
}

function rolesForWorkingLabByFormType(formType: FormType): UserRole[] {
  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY' ||
    formType === 'APE'
  ) {
    return uniqueRoles(['MICRO', 'MC']);
  }

  if (formType === 'CHEMISTRY_MIX' || formType === 'COA') {
    return uniqueRoles(['CHEMISTRY', 'MC']);
  }

  return uniqueRoles(['MC']);
}

// function rolesForFrontdeskRelated(status: String): UserRole[] {
//   if (status === 'RECEIVED_BY_FRONTDESK') {
//     return uniqueRoles(['FRONTDESK']);
//   }
// }

function rolesForQaRelated(): UserRole[] {
  return uniqueRoles(['QA', 'SYSTEMADMIN', 'ADMIN']);
}

function rolesForAdminRelated(): UserRole[] {
  return uniqueRoles(['ADMIN', 'SYSTEMADMIN']);
}

function buildFrontendReportUrl(args: {
  formType: FormType;
  reportId: string;
}) {
  switch (args.formType) {
    case 'MICRO_MIX':
      return `/reports/micro-mix/${args.reportId}`;

    case 'MICRO_MIX_WATER':
      return `/reports/micro-mix-water/${args.reportId}`;

    case 'STERILITY':
      return `/reports/sterility/${args.reportId}`;

    case 'APE':
      return `/reports/ape/${args.reportId}`;

    case 'CHEMISTRY_MIX':
      return `/chemistry-reports/chemistry-mix/${args.reportId}`;

    case 'COA':
      return `/chemistry-reports/coa/${args.reportId}`;

    default:
      return `/results`;
  }
}

function isFrontdeskStatus(s: ReportStatus) {
  return (
    s === 'RECEIVED_BY_FRONTDESK' ||
    s === 'FRONTDESK_ON_HOLD' ||
    s === 'FRONTDESK_NEEDS_CORRECTION'
  );
}

function frontdeskHighlightForStatus(status: ReportStatus) {
  if (status === 'RECEIVED_BY_FRONTDESK') {
    return {
      badgeText: 'Received by Frontdesk',
      badgeTone: 'BLUE' as const,
      priorityLine:
        'Action required: This report has been received by frontdesk.',
    };
  }

  if (status === 'FRONTDESK_ON_HOLD') {
    return {
      badgeText: 'Frontdesk On Hold',
      badgeTone: 'ORANGE' as const,
      priorityLine:
        'Action required: This report is on hold at frontdesk and needs attention.',
    };
  }

  if (status === 'FRONTDESK_NEEDS_CORRECTION') {
    return {
      badgeText: 'Frontdesk Needs Correction',
      badgeTone: 'RED' as const,
      priorityLine:
        'Action required: Frontdesk requested correction for this report.',
    };
  }

  return {
    badgeText: 'Frontdesk Update',
    badgeTone: 'GRAY' as const,
    priorityLine: undefined,
  };
}

function rolesForFrontdeskRelated(): UserRole[] {
  return uniqueRoles(['FRONTDESK']);
}
@Injectable()
export class ReportNotificationsService {
  private readonly log = new Logger(ReportNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly recipients: NotificationRecipientsService,
    private readonly inAppNotifications: NotificationService,
  ) {}

  private labTo() {
    return process.env.LAB_NOTIFY_TO || 'tech@omegabiochemlab.com';
  }
  private microTo() {
    return process.env.MICRO_NOTIFY_TO || this.labTo();
  }
  private qaTo() {
    return process.env.QA_NOTIFY_TO || this.labTo();
  }
  private frontdeskTo() {
    return process.env.FRONTDESK_NOTIFY_TO || this.labTo();
  }
  private adminTo() {
    return process.env.ADMIN_NOTIFY_TO || this.labTo();
  }
  private chemistryTo() {
    return process.env.CHEMISTRY_NOTIFY_TO || this.labTo();
  }

  async onStatusChanged(args: NotifyArgs) {
    const newStatus = args.newStatus as ReportStatus;
    this.log.warn(
      `[MIC NOTIFY] hit onStatusChanged form=${args.formNumber} status=${newStatus} clientCode=${args.clientCode}`,
    );
    const dept = deptForFormType(args.formType);

    const reportUrl = buildFrontendReportUrl({
      formType: args.formType,
      reportId: args.reportId,
    });

    const labRecipient = () => {
      return dept === 'MICRO'
        ? this.microTo()
        : dept === 'CHEMISTRY'
          ? this.chemistryTo()
          : this.labTo();
    };

    const requireClientEmail = () => {
      if (!args.clientEmail) {
        this.log.warn(
          `${newStatus} but no clientEmail for form ${args.formNumber} (reportId=${args.reportId})`,
        );
        return null;
      }
      return args.clientEmail;
    };

    const notifyLab = async (
      title: string,
      tag: string,
      options: DeliveryOptions = {},
    ) => {
      const emailRoles = uniqueRoles(options.emailRoles ?? []);
      const roleEmailRecipients = emailRoles.length
        ? normalizeEmails(
            await this.recipients.getRoleNotificationEmails(emailRoles),
          )
        : [];

      const fallbackEmailRecipients = normalizeEmails([labRecipient()]);
      const emailRecipients =
        roleEmailRecipients.length > 0
          ? roleEmailRecipients
          : fallbackEmailRecipients;

      if (emailRoles.length > 0 && roleEmailRecipients.length === 0) {
        this.log.warn(
          `No active email users found for roles=${emailRoles.join(',')}; ` +
            `using department fallback for ${args.formNumber}`,
        );
      }

      const immediate = options.forceImmediate || isUrgentStatus(newStatus);
      const defaultHighlight = highlightForStatus(String(newStatus));

      const hi = {
        badgeText: options.badgeText ?? defaultHighlight.badgeText,
        badgeTone: options.badgeTone ?? defaultHighlight.badgeTone,
        priorityLine: options.priorityLine ?? defaultHighlight.priorityLine,
      };
      const roles = options.roles ?? rolesForLabByFormType(args.formType);
      const extraMeta = options.extraMeta ?? {};

      if (immediate && emailRecipients.length > 0) {
        await this.mail.sendStatusNotificationEmail({
          to: emailRecipients,
          subject:
            options.subject ??
            buildNotificationSubject({
              badgeText: hi.badgeText,
              badgeTone: hi.badgeTone,
              title,
              formNumber: args.formNumber,
            }),
          title,
          badgeText: hi.badgeText,
          badgeTone: hi.badgeTone,
          priorityLine: hi.priorityLine,
          lines: [
            `Form #: ${args.formNumber}`,
            `Client: ${args.clientName}${args.clientCode ? ` (${args.clientCode})` : ''}`,
            `Form Type: ${args.formType}`,
            `Status: ${nice(args.newStatus)}`,
          ],
          actionUrl: reportUrl,
          actionLabel: 'Open report',
          tag,
          metadata: {
            reportId: args.reportId,
            formNumber: args.formNumber,
            formType: args.formType,
            status: args.newStatus,
            clientCode: args.clientCode ?? '',
            highlightKind: hi.badgeText,
            ...extraMeta,
          },
        });

        this.log.log(
          `Email sent IMMEDIATE (TO LAB): ${newStatus} → ${emailRecipients.join(', ')} (${args.formNumber})`,
        );
      }

      await this.inAppNotifications.createForRoles({
        roles,
        kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
        severity:
          hi.badgeTone === 'RED'
            ? 'ERROR'
            : hi.badgeTone === 'GREEN'
              ? 'SUCCESS'
              : hi.badgeTone === 'ORANGE'
                ? 'WARNING'
                : 'INFO',
        title,
        body:
          hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode: args.clientCode ?? null,
          ...extraMeta,
        },
      });

      if (immediate) return;

      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'LAB',
          dept,
          clientCode: args.clientCode ?? null,
          recipientsKey: JSON.stringify(emailRecipients),
          tag,
          reportId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          clientName: args.clientName,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          reportUrl,
          actorUserId: args.actorUserId ?? null,
        },
      });

      this.log.log(
        `Queued DIGEST (TO LAB): ${newStatus} → ${emailRecipients.join(', ')} (${args.formNumber})`,
      );
    };

    const notifyClient = async (
      title: string,
      tag: string,
      options: DeliveryOptions = {},
    ) => {
      const clientCode = args.clientCode?.trim();
      if (!clientCode) {
        this.log.warn(
          `${newStatus} but no clientCode for form ${args.formNumber}`,
        );
        return;
      }

      const defaultHighlight = highlightForStatus(String(newStatus));

      const hi = {
        badgeText: options.badgeText ?? defaultHighlight.badgeText,
        badgeTone: options.badgeTone ?? defaultHighlight.badgeTone,
        priorityLine: options.priorityLine ?? defaultHighlight.priorityLine,
      };
      const extraMeta = options.extraMeta ?? {};
      const emailsRaw =
        await this.recipients.getClientNotificationEmails(clientCode);
      const emails = normalizeEmails(emailsRaw);

      this.log.warn(
        `[CLIENT EMAIL DEBUG] ` +
          `form=${args.formNumber} ` +
          `status=${newStatus} ` +
          `clientCode=${clientCode} ` +
          `emails=${emails.length ? emails.join(',') : 'NONE'}`,
      );

      if (emails.length === 0) {
        this.log.warn(
          `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
        );
      }

      const immediate = options.forceImmediate || isUrgentStatus(newStatus);

      if (immediate && emails.length > 0) {
        await this.mail.sendStatusNotificationEmail({
          to: emails,
          subject:
            options.subject ??
            buildNotificationSubject({
              badgeText: hi.badgeText,
              badgeTone: hi.badgeTone,
              title,
              formNumber: args.formNumber,
            }),
          title,
          badgeText: hi.badgeText,
          badgeTone: hi.badgeTone,
          priorityLine: hi.priorityLine,
          lines: [
            `Form #: ${args.formNumber}`,
            `Client: ${args.clientName} (${clientCode})`,
            `Form Type: ${args.formType}`,
            `Status: ${nice(args.newStatus)}`,
          ],
          actionUrl: reportUrl,
          actionLabel: 'Open report',
          tag,
          metadata: {
            reportId: args.reportId,
            formNumber: args.formNumber,
            formType: args.formType,
            status: args.newStatus,
            clientCode,
            highlightKind: hi.badgeText,
            ...extraMeta,
          },
        });

        this.log.log(
          `Email sent IMMEDIATE (TO CLIENT): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
        );
      }

      await this.inAppNotifications.createForClientCode({
        clientCode,
        kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
        severity:
          hi.badgeTone === 'RED'
            ? 'ERROR'
            : hi.badgeTone === 'GREEN'
              ? 'SUCCESS'
              : hi.badgeTone === 'ORANGE'
                ? 'WARNING'
                : 'INFO',
        title,
        body:
          hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode,
          ...extraMeta,
        },
      });

      if (immediate || emails.length === 0) return;

      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'CLIENT',
          dept,
          clientCode,
          recipientsKey: JSON.stringify(emails),
          tag,
          reportId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          clientName: args.clientName,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          reportUrl,
          actorUserId: args.actorUserId ?? null,
        },
      });

      this.log.log(
        `Queued DIGEST (TO CLIENT): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
      );
    };

    const notifyApprovalTeam = async (args2: {
      requestKind: WorkflowRequestKind;
      requestedByRole: UserRole | null;
      workflowReturnStatus?: string | null;
    }) => {
      const title = `${args2.requestKind === 'CHANGE' ? 'Change' : 'Correction'} Request Awaiting Approval`;
      const badgeText = 'Approval Required';
      const badgeTone: NotificationTone = 'RED';
      const priorityLine =
        'Action required: ADMIN, SYSTEMADMIN, or QA must review and approve this request.';

      const configuredEmails =
        await this.recipients.getRoleNotificationEmails(APPROVAL_ROLES);

      const fallbackEmails = normalizeEmails([
        this.adminTo(),
        this.qaTo(),
        process.env.SYSTEMADMIN_NOTIFY_TO ?? '',
      ]);

      const to =
        configuredEmails.length > 0 ? configuredEmails : fallbackEmails;

      if (to.length > 0) {
        await this.mail.sendStatusNotificationEmail({
          to,
          subject: buildNotificationSubject({
            badgeText,
            badgeTone,
            title,
            formNumber: args.formNumber,
          }),
          title,
          badgeText,
          badgeTone,
          priorityLine,
          lines: [
            `Form #: ${args.formNumber}`,
            `Client: ${args.clientName}${args.clientCode ? ` (${args.clientCode})` : ''}`,
            `Form Type: ${args.formType}`,
            `Request Type: ${args2.requestKind}`,
            `Requested By Role: ${args2.requestedByRole ?? 'UNKNOWN'}`,
            `Return Status: ${args2.workflowReturnStatus ?? args.oldStatus}`,
            `Current Status: ${nice(args.newStatus)}`,
          ],
          actionUrl: reportUrl,
          actionLabel: 'Review request',
          tag: `${args2.requestKind.toLowerCase()}-request-approval`,
          metadata: {
            reportId: args.reportId,
            formNumber: args.formNumber,
            formType: args.formType,
            status: args.newStatus,
            clientCode: args.clientCode ?? '',
            requestKind: args2.requestKind,
            requestedByRole: args2.requestedByRole ?? 'UNKNOWN',
            workflowReturnStatus: args2.workflowReturnStatus ?? '',
          },
        });
      }

      await this.inAppNotifications.createForRoles({
        roles: APPROVAL_ROLES,
        kind: `${args2.requestKind}_APPROVAL_REQUIRED`,
        severity: 'ERROR',
        title,
        body: `${args2.requestKind} request from ${args2.requestedByRole ?? 'unknown role'} requires approval for ${args.formNumber}.`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode: args.clientCode ?? null,
          requestKind: args2.requestKind,
          requestedByRole: args2.requestedByRole,
          workflowReturnStatus: args2.workflowReturnStatus ?? null,
        },
      });

      this.log.log(
        `Approval notification sent: ${args2.requestKind} → ${APPROVAL_ROLES.join(',')} (${args.formNumber})`,
      );
    };

    const notifyFrontdesk = async (title: string) => {
      const hi = frontdeskHighlightForStatus(newStatus);

      await this.inAppNotifications.createForRoles({
        roles: rolesForFrontdeskRelated(),
        kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
        severity:
          hi.badgeTone === 'RED'
            ? 'ERROR'
            : hi.badgeTone === 'BLUE'
              ? 'SUCCESS'
              : hi.badgeTone === 'ORANGE'
                ? 'WARNING'
                : 'INFO',
        title,
        body:
          hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: args.reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode: args.clientCode ?? null,
        },
      });

      this.log.log(
        `In-app notification sent (FRONTDESK): ${newStatus} (${args.formNumber})`,
      );
    };

    // =========================
    // STATUS ROUTING
    // =========================

    // const actorUser = args.actorUserId
    //   ? await this.prisma.user.findUnique({
    //       where: { id: args.actorUserId },
    //       select: { id: true, role: true, clientCode: true },
    //     })
    //   : null;

    const actorUser = args.actorUserId
      ? await this.prisma.user.findFirst({
          where: {
            OR: [{ id: args.actorUserId }, { userId: args.actorUserId }],
          },
          select: {
            id: true,
            userId: true,
            role: true,
            clientCode: true,
          },
        })
      : null;

    const workflow = await this.prisma.report.findUnique({
      where: { id: args.reportId },
      select: {
        workflowRequestKind: true,
        workflowRequestedByRole: true,
        workflowReturnStatus: true,
        workflowRequestedAt: true,
      },
    });

    this.log.warn(
      `[WORKFLOW DEBUG] ` +
        `form=${args.formNumber} ` +
        `oldStatus=${args.oldStatus} ` +
        `newStatus=${args.newStatus} ` +
        `clientCode=${args.clientCode ?? 'NULL'} ` +
        `requestKind=${workflow?.workflowRequestKind ?? 'NULL'} ` +
        `requestedByRole=${workflow?.workflowRequestedByRole ?? 'NULL'} ` +
        `returnStatus=${workflow?.workflowReturnStatus ?? 'NULL'} ` +
        `actorId=${args.actorUserId ?? 'NULL'} ` +
        `actorRole=${actorUser?.role ?? 'NULL'}`,
    );

    const inferRequestKind = (): WorkflowRequestKind | null => {
      if (
        workflow?.workflowRequestKind === 'CHANGE' ||
        workflow?.workflowRequestKind === 'CORRECTION'
      ) {
        return workflow.workflowRequestKind;
      }

      if (
        newStatus === 'CHANGE_REQUESTED' ||
        newStatus === 'UNDER_CHANGE_UPDATE' ||
        args.oldStatus === 'CHANGE_REQUESTED'
      ) {
        return 'CHANGE';
      }

      if (
        newStatus === 'CORRECTION_REQUESTED' ||
        newStatus === 'UNDER_CORRECTION_UPDATE' ||
        args.oldStatus === 'CORRECTION_REQUESTED'
      ) {
        return 'CORRECTION';
      }

      return null;
    };

    const resolveOriginalRequesterRole = async (
      requestKind: WorkflowRequestKind,
    ): Promise<UserRole | null> => {
      if (workflow?.workflowRequestedByRole) {
        return workflow.workflowRequestedByRole;
      }

      if (
        newStatus === 'CHANGE_REQUESTED' ||
        newStatus === 'CORRECTION_REQUESTED'
      ) {
        return actorUser?.role ?? null;
      }

      const requestStatus: ReportStatus =
        requestKind === 'CHANGE' ? 'CHANGE_REQUESTED' : 'CORRECTION_REQUESTED';

      const history = await this.prisma.statusHistory.findFirst({
        where: {
          reportId: args.reportId,
          to: requestStatus,
        },
        orderBy: { createdAt: 'desc' },
        select: { role: true },
      });

      return history?.role ?? null;
    };

    const routeApprovedRequest = async (args2: {
      requestKind: WorkflowRequestKind;
      requestedByRole: UserRole;
    }) => {
      const requestedByClient = args2.requestedByRole === 'CLIENT';
      const workingLabRoles = rolesForWorkingLabByFormType(args.formType);

      const recipientSide =
        args2.requestKind === 'CHANGE'
          ? requestedByClient
            ? 'CLIENT'
            : 'LAB'
          : requestedByClient
            ? 'LAB'
            : 'CLIENT';

      this.log.log(
        `Routing approved ${args2.requestKind} request for ${args.formNumber}: ` +
          `requestedBy=${args2.requestedByRole}, ` +
          `approvedBy=${actorUser?.role ?? 'UNKNOWN'}, ` +
          `recipientSide=${recipientSide}`,
      );

      const extraMeta = {
        requestKind: args2.requestKind,
        requestedByRole: args2.requestedByRole,
        workflowReturnStatus: workflow?.workflowReturnStatus ?? null,
        approvedByRole: actorUser?.role ?? null,
      };

      /*
       * CHANGE:
       * Client raised change -> client performs the change.
       * Lab raised change -> lab performs the change.
       */
      if (args2.requestKind === 'CHANGE') {
        const title = 'Change Request Approved';
        const subject = `🟠 Change Request Approved — Omega LIMS — ${args.formNumber}`;

        if (requestedByClient) {
          await notifyClient(title, 'approved-change-to-client', {
            forceImmediate: true,
            subject,
            badgeText: 'CHANGE REQUEST APPROVED',
            badgeTone: 'ORANGE',
            priorityLine:
              'Your change request was approved. Please make the requested changes and resubmit the report.',
            extraMeta,
          });
        } else {
          await notifyLab(title, 'approved-change-to-lab', {
            forceImmediate: true,
            roles: workingLabRoles,
            emailRoles: workingLabRoles,
            subject,
            badgeText: 'CHANGE REQUEST APPROVED',
            badgeTone: 'ORANGE',
            priorityLine:
              'The change request was approved. Please make the requested changes to the report.',
            extraMeta,
          });
        }

        return;
      }

      /*
       * CORRECTION:
       * Client raised correction -> lab corrects the report.
       * Lab raised correction -> client corrects the report.
       */
      const title = 'Correction Required';
      const subject = `🔴 Correction Required — Omega LIMS — ${args.formNumber}`;

      if (requestedByClient) {
        await notifyLab(title, 'approved-correction-to-lab', {
          forceImmediate: true,
          roles: workingLabRoles,
          emailRoles: workingLabRoles,
          subject,
          badgeText: 'CORRECTION REQUIRED',
          badgeTone: 'RED',
          priorityLine:
            'Action required: The correction request was approved. Please correct the report and resubmit it.',
          extraMeta,
        });
      } else {
        await notifyClient(title, 'approved-correction-to-client', {
          forceImmediate: true,
          subject,
          badgeText: 'CORRECTION REQUIRED',
          badgeTone: 'RED',
          priorityLine:
            'Action required: The correction request was approved. Please correct the report and resubmit it.',
          extraMeta,
        });
      }
    };

    // ✅ SUBMITTED_BY_CLIENT (client -> lab)
    if (newStatus === 'SUBMITTED_BY_CLIENT') {
      await notifyLab('New Submission from Client', 'client-to-lab-submitted');
      return;
    }

    // ✅ CLIENT_NEEDS_PRELIMINARY_CORRECTION (client -> lab)
    if (newStatus === 'CLIENT_NEEDS_PRELIMINARY_CORRECTION') {
      await notifyLab(
        'Client Raised Preliminary Correction',
        'client-to-lab-prelim-correction',
      );
      return;
    }

    // ✅ CLIENT_NEEDS_FINAL_CORRECTION (client -> lab)
    if (newStatus === 'CLIENT_NEEDS_FINAL_CORRECTION') {
      await notifyLab(
        'Client Raised Final Correction',
        'client-to-lab-final-correction',
      );
      return;
    }

    // ✅ PRELIMINARY_RESUBMISSION_BY_CLIENT (client -> lab)
    if (newStatus === 'PRELIMINARY_RESUBMISSION_BY_CLIENT') {
      await notifyLab(
        'Preliminary Resubmission by Client',
        'client-to-lab-prelim-resubmission',
      );
      return;
    }

    // ✅ FINAL_RESUBMISSION_BY_CLIENT (client -> lab)
    if (newStatus === 'FINAL_RESUBMISSION_BY_CLIENT') {
      await notifyLab(
        'Final Resubmission by Client',
        'client-to-lab-final-resubmission',
      );
      return;
    }

    // ✅ UNDER_CLIENT_PRELIMINARY_REVIEW (lab -> client)
    if (newStatus === 'UNDER_CLIENT_PRELIMINARY_REVIEW') {
      await notifyClient(
        'Client Preliminary Review Required',
        'lab-to-client-under-client-preliminary-review',
      );
      return;
    }

    // ✅ UNDER_CLIENT_FINAL_REVIEW (lab -> client)
    if (newStatus === 'UNDER_CLIENT_FINAL_REVIEW') {
      await notifyClient(
        'Client Final Review Required',
        'lab-to-client-under-client-final-review',
      );
      return;
    }

    // ✅ PRELIMINARY_TESTING_NEEDS_CORRECTION (lab -> client)
    if (newStatus === 'PRELIMINARY_TESTING_NEEDS_CORRECTION') {
      await notifyClient(
        'Preliminary Testing Needs Correction',
        'lab-to-client-prelim-testing-needs-correction',
      );
      return;
    }

    // ✅ PRELIMINARY_RESUBMISSION_BY_TESTING (lab -> client)
    if (newStatus === 'PRELIMINARY_RESUBMISSION_BY_TESTING') {
      await notifyClient(
        'Preliminary Resubmission Completed by Lab',
        'lab-to-client-prelim-resubmission-by-testing',
      );
      return;
    }

    // ✅ FINAL_TESTING_NEEDS_CORRECTION (lab -> client)
    if (newStatus === 'FINAL_TESTING_NEEDS_CORRECTION') {
      await notifyClient(
        'Final Testing Needs Correction',
        'lab-to-client-final-testing-needs-correction',
      );
      return;
    }

    // ✅ FINAL_RESUBMISSION_BY_TESTING (lab -> client)
    if (newStatus === 'FINAL_RESUBMISSION_BY_TESTING') {
      await notifyClient(
        'Final Resubmission Completed by Lab',
        'lab-to-client-final-resubmission-by-testing',
      );
      return;
    }

    // ✅ FINAL_APPROVED (client -> lab)  <-- as you requested
    if (newStatus === 'FINAL_APPROVED') {
      await notifyLab(
        'Final Approved (Client Action)',
        'client-to-lab-final-approved',
      );
      return;
    }

    // ✅ CLIENT_NEEDS_PRELIMINARY_CORRECTION (client -> lab)
    if (newStatus === 'CLIENT_NEEDS_CORRECTION') {
      await notifyLab('Client Raised Correction', 'client-to-lab-correction');
      return;
    }

    // ✅ PRELIMINARY_RESUBMISSION_BY_CLIENT (client -> lab)
    if (newStatus === 'RESUBMISSION_BY_CLIENT') {
      await notifyLab('Resubmission by Client', 'client-to-lab-resubmission');
      return;
    }

    // ✅ UNDER_CLIENT_PRELIMINARY_REVIEW (lab -> client)
    if (newStatus === 'UNDER_CLIENT_REVIEW') {
      await notifyClient(
        'Client Review Required',
        'lab-to-client-under-client-review',
      );
      return;
    }

    // ✅ PRELIMINARY_TESTING_NEEDS_CORRECTION (lab -> client)
    if (newStatus === 'TESTING_NEEDS_CORRECTION') {
      await notifyClient(
        'Testing Needs Correction',
        'lab-to-client-testing-needs-correction',
      );
      return;
    }

    // ✅ FINAL_APPROVED (client -> lab)  <-- as you requested
    if (newStatus === 'APPROVED') {
      await notifyLab('Approved (Client Action)', 'client-to-lab-approved');
      return;
    }

    if (
      newStatus === 'CHANGE_REQUESTED' ||
      newStatus === 'CORRECTION_REQUESTED'
    ) {
      const requestKind = inferRequestKind();
      if (!requestKind) {
        this.log.error(
          `Unable to determine request kind for ${args.formNumber}`,
        );
        return;
      }

      const requestedByRole = await resolveOriginalRequesterRole(requestKind);

      await notifyApprovalTeam({
        requestKind,
        requestedByRole,
        workflowReturnStatus: workflow?.workflowReturnStatus ?? args.oldStatus,
      });
      return;
    }

    if (
      newStatus === 'UNDER_CHANGE_UPDATE' ||
      newStatus === 'UNDER_CORRECTION_UPDATE'
    ) {
      const requestKind = inferRequestKind();
      if (!requestKind) {
        this.log.error(
          `Unable to determine approved request kind for ${args.formNumber}`,
        );
        return;
      }

      const requestedByRole = await resolveOriginalRequesterRole(requestKind);

      if (!requestedByRole) {
        this.log.error(
          `Missing original requester role for ${requestKind} request on ${args.formNumber}`,
        );

        await notifyApprovalTeam({
          requestKind,
          requestedByRole: null,
          workflowReturnStatus: workflow?.workflowReturnStatus ?? null,
        });
        return;
      }

      await routeApprovedRequest({
        requestKind,
        requestedByRole,
      });
      return;
    }

    // =========================
    // FRONTDESK IN-APP ONLY
    // =========================
    if (newStatus === 'RECEIVED_BY_FRONTDESK') {
      await notifyFrontdesk('Report Received by Frontdesk');
      return;
    }

    if (newStatus === 'FRONTDESK_ON_HOLD') {
      await notifyFrontdesk('Report On Hold at Frontdesk');
      return;
    }

    if (newStatus === 'FRONTDESK_NEEDS_CORRECTION') {
      await notifyFrontdesk('Frontdesk Requested Correction');
      return;
    }

    // otherwise: no email
  }
}
