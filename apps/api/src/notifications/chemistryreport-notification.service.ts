import { Injectable, Logger } from '@nestjs/common';
import { FormType, ChemistryReportStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from 'src/mail/notification-recipients.service';

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

@Injectable()
export class ChemistryReportNotificationsService {
  private readonly log = new Logger(ChemistryReportNotificationsService.name);

  constructor(
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

    // ---- recipients helpers ----
    const labRecipient = () => this.chemistryTo();

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

    const notifyLab = async (title: string, tag: string) => {
      const to = labRecipient();

      await this.mail.sendStatusNotificationEmail({
        to,
        subject: `Omega LIMS — ${title} (${args.formNumber})`,
        title,
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
        },
      });

      this.log.log(
        `Email sent (CLIENT → LAB): ${newStatus} → ${to} (${args.formNumber})`,
      );
    };

    // -------------------------
    // LAB -> CLIENT (notify client)
    // -------------------------
    // const notifyClient = async (title: string, tag: string) => {
    //   const to = requireClientEmail();
    //   if (!to) return;

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
    //     `Email sent (LAB → CLIENT): ${newStatus} → ${to} (${args.formNumber})`,
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

      // const emails = await this.recipients.getClientEmails(clientCode);
      const emails = await this.recipients.getClientNotificationEmails(clientCode);

   

      if (emails.length === 0) {
        this.log.warn(
          `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
        );
        return;
      }

      await this.mail.sendStatusNotificationEmail({
        to: emails, // ✅ now list
        subject: `Omega LIMS — ${title} (${args.formNumber})`,
        title,
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
          reportId: args.reportId,
          formNumber: args.formNumber,
          formType: args.formType,
          status: args.newStatus,
          clientCode,
        },
      });

      this.log.log(
        `Email sent (LAB → CLIENT GROUP): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
      );
    };

    // =========================
    // CHEMISTRY STATUS ROUTING
    // =========================

    // ✅ SUBMITTED_BY_CLIENT (client -> lab)
    if (newStatus === ChemistryReportStatus.SUBMITTED_BY_CLIENT) {
      await notifyLab(
        'New Chemistry Submission from Client',
        'chem-client-to-lab-submitted',
      );
      return;
    }

    // ✅ CLIENT_NEEDS_CORRECTION (lab -> client)
    if (newStatus === ChemistryReportStatus.CLIENT_NEEDS_CORRECTION) {
      await notifyClient(
        'Chemistry: Corrections Required',
        'chem-lab-to-client-needs-correction',
      );
      return;
    }

    // ✅ UNDER_CLIENT_REVIEW (lab -> client)  (meaning: client must review/approve)
    if (newStatus === ChemistryReportStatus.UNDER_CLIENT_REVIEW) {
      await notifyClient(
        'Chemistry: Under Client Review',
        'chem-lab-to-client-under-client-review',
      );
      return;
    }

    // ✅ TESTING_NEEDS_CORRECTION (lab -> client)
    if (newStatus === ChemistryReportStatus.TESTING_NEEDS_CORRECTION) {
      await notifyClient(
        'Chemistry: Testing Needs Correction',
        'chem-lab-to-client-testing-needs-correction',
      );
      return;
    }

    // ✅ RESUBMISSION_BY_TESTING (lab -> client)
    if (newStatus === ChemistryReportStatus.RESUBMISSION_BY_TESTING) {
      await notifyClient(
        'Chemistry: Resubmitted by Lab',
        'chem-lab-to-client-resubmission-by-testing',
      );
      return;
    }

    // ✅ RESUBMISSION_BY_CLIENT (client -> lab)
    if (newStatus === ChemistryReportStatus.RESUBMISSION_BY_CLIENT) {
      await notifyLab(
        'Chemistry: Resubmitted by Client',
        'chem-client-to-lab-resubmission-by-client',
      );
      return;
    }

    // ✅ APPROVED (lab -> client)
    if (newStatus === ChemistryReportStatus.APPROVED) {
      await notifyClient(
        'Chemistry Report Approved',
        'chem-lab-to-client-approved',
      );
      return;
    }

    // otherwise: no email
  }
}
