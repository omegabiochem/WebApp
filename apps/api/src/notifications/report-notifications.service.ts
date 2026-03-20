import { Injectable, Logger } from '@nestjs/common';
import { ReportStatus, FormType, UserRole } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from '../mail/notification-recipients.service';
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

function nice(s: string) {
  return String(s).replace(/_/g, ' ');
}

function deptForFormType(formType: FormType) {
  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY'
  )
    return 'MICRO';
  if (formType === 'CHEMISTRY_MIX') return 'CHEMISTRY';
  return 'LAB';
}

function normalizeEmails(emails: string[]) {
  return [
    ...new Set(
      emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean),
    ),
  ].sort();
}

// ✅ your Option C policy
function isUrgentStatus(s: ReportStatus) {
  // “requires human action right now”
  // if (s === 'SUBMITTED_BY_CLIENT') return true;

  // anything “needs correction”
  if (String(s).includes('NEEDS_CORRECTION')) return true;

  // you can add more if needed (optional)
  return false;
}

function highlightForStatus(status: string) {
  if (status.includes('NEEDS_CORRECTION')) {
    return {
      badgeText: 'Correction Required',
      badgeTone: 'RED' as const,
      priorityLine:
        'Action required: Please open the report and resolve the requested corrections.',
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
      badgeTone: 'GREEN' as const,
      priorityLine:
        'Action required: Preliminary results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'UNDER_CLIENT_FINAL_REVIEW') {
    return {
      badgeText: 'Final Results Ready',
      badgeTone: 'GREEN' as const,
      priorityLine:
        'Action required: Final results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'UNDER_CLIENT_REVIEW') {
    return {
      badgeText: 'Results Ready',
      badgeTone: 'GREEN' as const,
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

function uniqueRoles(roles: UserRole[]) {
  return [...new Set(roles)];
}

function rolesForLabByFormType(formType: FormType): UserRole[] {
  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY'
  ) {
    return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC', 'MICRO']);
  }

  if (formType === 'CHEMISTRY_MIX' || formType === 'COA') {
    return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC', 'CHEMISTRY']);
  }

  return uniqueRoles(['ADMIN', 'QA', 'SYSTEMADMIN', 'MC']);
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

    const notifyLab = async (title: string, tag: string) => {
      const to = labRecipient();
      const urgent = isUrgentStatus(newStatus);

      const hi = highlightForStatus(String(newStatus));

      if (urgent) {
        await this.mail.sendStatusNotificationEmail({
          to,
          subject: `[${hi.badgeText}] Omega LIMS — ${title} (${args.formNumber})`,
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
          },
        });

        this.log.log(
          `Email sent IMMEDIATE (CLIENT → LAB): ${newStatus} → ${to} (${args.formNumber})`,
        );

        await this.inAppNotifications.createForRoles({
          roles: rolesForLabByFormType(args.formType),
          kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
          severity:
            hi.badgeTone === 'RED'
              ? 'ERROR'
              : hi.badgeTone === 'GREEN'
                ? 'SUCCESS'
                : 'INFO',
          title,
          body:
            hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
          entityType: 'REPORT',
          entityId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          reportUrl: reportUrl,
          status: args.newStatus,
          meta: {
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
            clientName: args.clientName,
            clientCode: args.clientCode ?? null,
          },
        });
        console.log('createForRole notification', args);
        return;
      }

      await this.inAppNotifications.createForRoles({
        roles: rolesForLabByFormType(args.formType),
        kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
        severity:
          hi.badgeTone === 'RED'
            ? 'ERROR'
            : hi.badgeTone === 'GREEN'
              ? 'SUCCESS'
              : 'INFO',
        title,
        body:
          hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode: args.clientCode ?? null,
        },
      });

      // ✅ digest queue
      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'LAB',
          dept,
          clientCode: args.clientCode ?? null,
          recipientsKey: JSON.stringify(normalizeEmails([to])),
          tag,

          reportId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          clientName: args.clientName,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          reportUrl: reportUrl ?? null,
          actorUserId: args.actorUserId ?? null,
        },
      });

      this.log.log(
        `Queued DIGEST (CLIENT → LAB): ${newStatus} → ${to} (${args.formNumber})`,
      );
    };

    const notifyClient = async (title: string, tag: string) => {
      const clientCode = args.clientCode?.trim();
      if (!clientCode) {
        this.log.warn(
          `${newStatus} but no clientCode for form ${args.formNumber}`,
        );
        return;
      }

      const hi = highlightForStatus(String(newStatus));

      const emailsRaw =
        await this.recipients.getClientNotificationEmails(clientCode);
      const emails = normalizeEmails(emailsRaw);

      if (emails.length === 0) {
        this.log.warn(
          `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
        );
        return;
      }

      const urgent = isUrgentStatus(newStatus);

      if (urgent) {
        await this.mail.sendStatusNotificationEmail({
          to: emails,
          subject: `[${hi.badgeText}] Omega LIMS — ${title} (${args.formNumber})`,
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
          },
        });

        this.log.log(
          `Email sent IMMEDIATE (LAB → CLIENT GROUP): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
        );

        await this.inAppNotifications.createForClientCode({
          clientCode,
          kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
          severity:
            hi.badgeTone === 'RED'
              ? 'ERROR'
              : hi.badgeTone === 'GREEN'
                ? 'SUCCESS'
                : 'INFO',
          title,
          body:
            hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
          entityType: 'REPORT',
          entityId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          reportUrl: reportUrl,
          status: args.newStatus,
          meta: {
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
            clientName: args.clientName,
            clientCode,
          },
        });
        console.log('createForClientCode notification', args);
        return;
      }

      await this.inAppNotifications.createForClientCode({
        clientCode,
        kind: hi.badgeText.toUpperCase().replace(/\s+/g, '_'),
        severity:
          hi.badgeTone === 'RED'
            ? 'ERROR'
            : hi.badgeTone === 'GREEN'
              ? 'SUCCESS'
              : 'INFO',
        title,
        body:
          hi.priorityLine ?? `${nice(args.newStatus)} for ${args.formNumber}`,
        entityType: 'REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode,
        },
      });

      // ✅ digest queue
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
          reportUrl: reportUrl ?? null,
          actorUserId: args.actorUserId ?? null,
        },
      });

      this.log.log(
        `Queued DIGEST (LAB → CLIENT GROUP): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
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
