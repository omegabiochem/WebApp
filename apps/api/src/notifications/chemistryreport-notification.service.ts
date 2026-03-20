import { Injectable, Logger } from '@nestjs/common';
import { FormType, ChemistryReportStatus, UserRole } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from 'src/mail/notification-recipients.service';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationService } from './inAppNotifications/notification.service';

type NotifyArgs = {
  formType: FormType; // should be CHEMISTRY_MIX here
  reportId: string; // chemistryReport.id
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

function normalizeEmails(emails: string[]) {
  return [
    ...new Set(
      (emails ?? []).map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean),
    ),
  ].sort();
}

// ✅ Option C policy for Chemistry
function isUrgentChemStatus(s: ChemistryReportStatus) {
  // human action right now
  // if (s === ChemistryReportStatus.SUBMITTED_BY_CLIENT) return true;

  // any NEEDS_CORRECTION
  if (String(s).includes('NEEDS_CORRECTION')) return true;

  // client must act (review/approve)
  // if (s === ChemistryReportStatus.UNDER_CLIENT_REVIEW) return true;

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

  if (status === 'UNDER_CLIENT_REVIEW') {
    return {
      badgeText: 'Results Ready',
      badgeTone: 'GREEN' as const,
      priorityLine:
        'Action required:  Results are ready. Please review and approve or request corrections.',
    };
  }

  if (status === 'APPROVED') {
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

function formLabel(formType: FormType) {
  return formType === 'COA' ? 'COA' : 'Chemistry';
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

function rolesForQaRelated(): UserRole[] {
  return uniqueRoles(['QA', 'SYSTEMADMIN', 'ADMIN']);
}

function rolesForAdminRelated(): UserRole[] {
  return uniqueRoles(['ADMIN', 'SYSTEMADMIN']);
}

function isFrontdeskStatus(s: ChemistryReportStatus) {
  return (
    s === 'RECEIVED_BY_FRONTDESK' ||
    s === 'FRONTDESK_ON_HOLD' ||
    s === 'FRONTDESK_NEEDS_CORRECTION'
  );
}

function frontdeskHighlightForStatus(status: ChemistryReportStatus) {
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
export class ChemistryReportNotificationsService {
  private readonly log = new Logger(ChemistryReportNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly recipients: NotificationRecipientsService,
    private readonly inAppNotifications: NotificationService,
  ) {}

  private labTo() {
    return process.env.LAB_NOTIFY_TO || 'tech@omegabiochemlab.com';
  }
  private chemistryTo() {
    return process.env.CHEMISTRY_NOTIFY_TO || this.labTo();
  }

  async onStatusChanged(args: NotifyArgs) {
    const newStatus = args.newStatus as ChemistryReportStatus;

    this.log.warn(
      `[CHEM NOTIFY] hit onStatusChanged form=${args.formNumber} status=${newStatus} clientCode=${args.clientCode}`,
    );

    // ---- recipients helpers ----
    const labRecipient = () => this.chemistryTo();

    const formLabelText = formLabel(args.formType);

    const requireClientEmail = () => {
      if (!args.clientEmail) {
        this.log.warn(
          `${newStatus} but no clientEmail for form ${args.formNumber} (chemistryId=${args.reportId})`,
        );
        return null;
      }
      return args.clientEmail;
    };

    const notifyLab = async (title: string, tag: string) => {
      const to = labRecipient();
      const urgent = isUrgentChemStatus(newStatus);
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
          actionUrl: args.reportUrl,
          actionLabel: 'Open report',
          tag,
          metadata: {
            chemistryId: args.reportId,
            formNumber: args.formNumber,
            formType: args.formType,
            status: args.newStatus,
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
          reportUrl: args.reportUrl,
          status: args.newStatus,
          meta: {
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
            clientName: args.clientName,
            clientCode: args.clientCode ?? null,
          },
        });
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
        reportUrl: args.reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode: args.clientCode ?? null,
        },
      });

      // ✅ queue digest
      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'LAB',
          dept: 'CHEMISTRY',
          clientCode: args.clientCode ?? null,
          recipientsKey: JSON.stringify(normalizeEmails([to])),
          tag,

          reportId: args.reportId, // chemistryReport.id stored here
          formType: args.formType,
          formNumber: args.formNumber,
          clientName: args.clientName,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          reportUrl: args.reportUrl ?? null,
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

      const emailsRaw =
        await this.recipients.getClientNotificationEmails(clientCode);
      const emails = normalizeEmails(emailsRaw);

      if (emails.length === 0) {
        this.log.warn(
          `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
        );
        return;
      }

      const urgent = isUrgentChemStatus(newStatus);
      const hi = highlightForStatus(String(newStatus));

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
          actionUrl: args.reportUrl,
          actionLabel: 'Open report',
          tag,
          metadata: {
            chemistryId: args.reportId,
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
          entityType: 'CHEMISTRY_REPORT',
          entityId: args.reportId,
          formType: args.formType,
          formNumber: args.formNumber,
          reportUrl: args.reportUrl,
          status: args.newStatus,
          meta: {
            oldStatus: args.oldStatus,
            newStatus: args.newStatus,
            clientName: args.clientName,
            clientCode,
          },
        });
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
        entityType: 'CHEMISTRY_REPORT',
        entityId: args.reportId,
        formType: args.formType,
        formNumber: args.formNumber,
        reportUrl: args.reportUrl,
        status: args.newStatus,
        meta: {
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          clientName: args.clientName,
          clientCode,
        },
      });

      // ✅ queue digest
      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'CLIENT',
          dept: 'CHEMISTRY',
          clientCode,
          recipientsKey: JSON.stringify(emails),
          tag,

          reportId: args.reportId, // chemistryReport.id stored here
          formType: args.formType,
          formNumber: args.formNumber,
          clientName: args.clientName,
          oldStatus: args.oldStatus,
          newStatus: args.newStatus,
          reportUrl: args.reportUrl ?? null,
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
    // CHEMISTRY && COA STATUS ROUTING
    // =========================

    // ✅ SUBMITTED_BY_CLIENT (client -> lab)
    if (newStatus === ChemistryReportStatus.SUBMITTED_BY_CLIENT) {
      await notifyLab(
        `New ${formLabelText} Submission from Client`,
        formLabelText === 'COA'
          ? 'coa-client-to-lab-submitted'
          : 'chem-client-to-lab-submitted',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.CLIENT_NEEDS_CORRECTION) {
      await notifyClient(
        `${formLabelText}: Corrections Required`,
        formLabelText === 'COA'
          ? 'coa-lab-to-client-needs-correction'
          : 'chem-lab-to-client-needs-correction',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.UNDER_CLIENT_REVIEW) {
      await notifyClient(
        `${formLabelText}: Results Ready`,
        formLabelText === 'COA'
          ? 'coa-lab-to-client-under-client-review'
          : 'chem-lab-to-client-under-client-review',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.TESTING_NEEDS_CORRECTION) {
      await notifyClient(
        `${formLabelText}: Testing Needs Correction`,
        formLabelText === 'COA'
          ? 'coa-lab-to-client-testing-needs-correction'
          : 'chem-lab-to-client-testing-needs-correction',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.RESUBMISSION_BY_TESTING) {
      await notifyClient(
        `${formLabelText}: Resubmitted by Lab`,
        formLabelText === 'COA'
          ? 'coa-lab-to-client-resubmission-by-testing'
          : 'chem-lab-to-client-resubmission-by-testing',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.RESUBMISSION_BY_CLIENT) {
      await notifyLab(
        `${formLabelText}: Resubmitted by Client`,
        formLabelText === 'COA'
          ? 'coa-client-to-lab-resubmission-by-client'
          : 'chem-client-to-lab-resubmission-by-client',
      );
      return;
    }

    if (newStatus === ChemistryReportStatus.APPROVED) {
      await notifyClient(
        `${formLabelText} Report Approved`,
        formLabelText === 'COA'
          ? 'coa-lab-to-client-approved'
          : 'chem-lab-to-client-approved',
      );
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
