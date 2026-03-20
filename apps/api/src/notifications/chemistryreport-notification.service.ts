import { Injectable, Logger } from '@nestjs/common';
import { FormType, ChemistryReportStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from 'src/mail/notification-recipients.service';
import { PrismaService } from 'prisma/prisma.service';

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

@Injectable()
export class ChemistryReportNotificationsService {
  private readonly log = new Logger(ChemistryReportNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly recipients: NotificationRecipientsService,
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

    // -------------------------
    // CLIENT -> LAB (notify chemistry/lab)
    // -------------------------

    // const notifyLab = async (title: string, tag: string) => {
    //   const to = labRecipient();

    //   await this.mail.sendStatusNotificationEmail({
    //     to,
    //     subject: `Omega LIMS — ${title} (${args.formNumber})`,
    //     title,
    //     lines: [
    //       `Form #: ${args.formNumber}`,
    //       `Client: ${args.clientName}${args.clientCode ? ` (${args.clientCode})` : ''}`,
    //       `Form Type: ${args.formType}`,
    //       `Status: ${nice(args.newStatus)}`,
    //     ],
    //     actionUrl: args.reportUrl,
    //     actionLabel: 'Open report',
    //     tag,
    //     metadata: {
    //       chemistryId: args.reportId,
    //       formNumber: args.formNumber,
    //       formType: args.formType,
    //       status: args.newStatus,
    //     },
    //   });

    //   this.log.log(
    //     `Email sent (CLIENT → LAB): ${newStatus} → ${to} (${args.formNumber})`,
    //   );
    // };

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
        return;
      }

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

    // -------------------------
    // LAB -> CLIENT (notify client)
    // -------------------------

    // const notifyClient = async (title: string, tag: string) => {
    //   const clientCode = args.clientCode?.trim();
    //   if (!clientCode) {
    //     this.log.warn(
    //       `${newStatus} but no clientCode for form ${args.formNumber}`,
    //     );
    //     return;
    //   }

    //   // const emails = await this.recipients.getClientEmails(clientCode);
    //   const emails =
    //     await this.recipients.getClientNotificationEmails(clientCode);

    //   if (emails.length === 0) {
    //     this.log.warn(
    //       `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
    //     );
    //     return;
    //   }

    //   await this.mail.sendStatusNotificationEmail({
    //     to: emails, // ✅ now list
    //     subject: `Omega LIMS — ${title} (${args.formNumber})`,
    //     title,
    //     lines: [
    //       `Form #: ${args.formNumber}`,
    //       `Client: ${args.clientName} (${clientCode})`,
    //       `Form Type: ${args.formType}`,
    //       `Status: ${nice(args.newStatus)}`,
    //     ],
    //     actionUrl: args.reportUrl,
    //     actionLabel: 'Open report',
    //     tag,
    //     metadata: {
    //       reportId: args.reportId,
    //       formNumber: args.formNumber,
    //       formType: args.formType,
    //       status: args.newStatus,
    //       clientCode,
    //     },
    //   });

    //   this.log.log(
    //     `Email sent (LAB → CLIENT GROUP): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
    //   );
    // };

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
        return;
      }

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

    // otherwise: no email
  }
}
