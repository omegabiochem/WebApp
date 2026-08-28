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

function normalizeEmails(emails: string[]) {
  return [
    ...new Set(
      (emails ?? [])
        .flatMap((email) => String(email ?? '').split(/[;,]/))
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  ].sort();
}

// ✅ Option C policy for Chemistry
function isUrgentChemStatus(s: ChemistryReportStatus) {
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

  if (status === 'UNDER_CLIENT_REVIEW') {
    return {
      badgeText: 'Results Ready',
      badgeTone: 'DARK_GREEN' as const,
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
  if (formType === 'CHEMISTRY_MIX' || formType === 'COA') {
    return uniqueRoles(['CHEMISTRY', 'MC']);
  }

  if (
    formType === 'MICRO_MIX' ||
    formType === 'MICRO_MIX_WATER' ||
    formType === 'STERILITY' ||
    formType === 'APE'
  ) {
    return uniqueRoles(['MICRO', 'MC']);
  }

  return uniqueRoles(['MC']);
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

type CorrectionRecipientSide = 'CLIENT' | 'LAB' | 'BOTH';

type CorrectionLike = {
  fieldKey?: string | null;
  status?: string | null;
  recipientSide?: CorrectionRecipientSide | null;
};

function normalizeCorrectionFieldKey(fieldKey: string) {
  return String(fieldKey ?? '')
    .trim()
    .replace(/\[\d+\]/g, '')
    .split(':')[0]
    .split('.')[0];
}

function isClientCorrectionField(formType: FormType, fieldKey: string) {
  const raw = String(fieldKey ?? '').trim();
  const key = normalizeCorrectionFieldKey(raw);

  const commonClientFields = new Set([
    'client',
    'dateSent',
    'typeOfTest',
    'sampleType',
    'formulaNo',
    'idNo',
    'description',
    'sampleDescription',
    'lotNo',
    'lotBatchNo',
    'manufactureDate',
    'samplingDate',
    'formulaId',
    'sampleSize',
    'numberOfActives',
    'sampleTypes',
    'testTypes',
    'sampleCollected',
    'stabilityNote',
    'organisms',
  ]);

  if (commonClientFields.has(key)) return true;

  // Micro client-side spec fields
  if (key === 'tbc_spec' || key === 'tmy_spec') return true;

  // Pathogen/spec-style correction is client-side.
  // Pathogen result/gram/date-style correction is lab-side.
  if (key === 'pathogens') {
    if (raw.includes('spec')) return true;
    if (raw.includes('result') || raw.includes('grams')) return false;

    // Ambiguous pathogen correction: safer to keep lab/internal
    return false;
  }

  // Chemistry active table:
  // formulaContent is client-side; result/SOP/date-tested are chemistry-side.
  if (key === 'actives') {
    if (raw.includes('formulaContent')) return true;

    if (
      raw.includes('result') ||
      raw.includes('sopNo') ||
      raw.includes('dateTestedInitial') ||
      raw.includes('bulkActiveLot')
    ) {
      return false;
    }

    // Ambiguous actives correction: safer to keep lab/internal
    return false;
  }

  // COA table:
  // Specification/item is client-side; result/SOP/date-tested is chemistry-side.
  if (key === 'coaRows') {
    if (raw.includes('Specification') || raw.includes('item')) return true;

    if (
      raw.includes('result') ||
      raw.includes('sopValidatedTm') ||
      raw.includes('dateTestedInitial')
    ) {
      return false;
    }

    // Ambiguous COA table correction: safer to keep lab/internal
    return false;
  }

  return false;
}

function resolveCorrectionRecipientSideFromFields(
  formType: FormType,
  fieldKeys: string[],
): CorrectionRecipientSide {
  const keys = [
    ...new Set(
      fieldKeys
        .map(String)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];

  if (keys.length === 0) {
    return 'LAB';
  }

  const clientKeys = keys.filter((key) =>
    isClientCorrectionField(formType, key),
  );
  const labKeys = keys.filter((key) => !isClientCorrectionField(formType, key));

  if (clientKeys.length > 0 && labKeys.length > 0) return 'BOTH';
  if (clientKeys.length > 0) return 'CLIENT';

  return 'LAB';
}

function getOpenCorrectionFieldKeysFromDetails(details: any) {
  const corrections = Array.isArray(details?.corrections)
    ? (details.corrections as CorrectionLike[])
    : [];

  return corrections
    .filter((c) => String(c?.status ?? 'OPEN') === 'OPEN')
    .map((c) => String(c?.fieldKey ?? '').trim())
    .filter(Boolean);
}

function normalizeManualRecipientSide(
  value: any,
): CorrectionRecipientSide | null {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();

  if (v === 'CLIENT') return 'CLIENT';
  if (v === 'LAB') return 'LAB';
  if (v === 'BOTH') return 'BOTH';

  return null;
}

function resolveManualRecipientSide(
  corrections: CorrectionLike[],
): CorrectionRecipientSide | null {
  const sides = corrections
    .map((c) => normalizeManualRecipientSide(c.recipientSide))
    .filter((x): x is CorrectionRecipientSide => Boolean(x));

  if (sides.length === 0) return null;

  if (sides.includes('BOTH')) return 'BOTH';

  const unique = [...new Set(sides)];

  if (unique.length > 1) return 'BOTH';

  return unique[0];
}

function getOpenCorrectionItemsFromDetails(details: any): CorrectionLike[] {
  const corrections = Array.isArray(details?.corrections)
    ? (details.corrections as CorrectionLike[])
    : [];

  return corrections.filter((c) => String(c?.status ?? 'OPEN') === 'OPEN');
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

  private qaTo() {
    return process.env.QA_NOTIFY_TO || this.labTo();
  }

  private adminTo() {
    return process.env.ADMIN_NOTIFY_TO || this.labTo();
  }

  private async getChemistryCorrectionRecipientSide(args: {
    reportId: string;
    formType: FormType;
  }) {
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id: args.reportId },
      include: {
        chemistryMix: true,
        coa: true,
      },
    });

    const openItems: CorrectionLike[] = [];

    openItems.push(...getOpenCorrectionItemsFromDetails(report?.chemistryMix));
    openItems.push(...getOpenCorrectionItemsFromDetails(report?.coa));

    const fieldKeys = openItems
      .map((c) => String(c?.fieldKey ?? '').trim())
      .filter(Boolean);

    const manualSide = resolveManualRecipientSide(openItems);

    const side =
      manualSide ??
      resolveCorrectionRecipientSideFromFields(args.formType, fieldKeys);

    this.log.warn(
      `[CHEM CORRECTION FIELD ROUTING] report=${args.reportId} formType=${args.formType} fields=${fieldKeys.join(',') || 'NONE'} side=${side}`,
    );

    return {
      side,
      fieldKeys,
    };
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
            `using chemistry department fallback for ${args.formNumber}`,
        );
      }

      const immediate = options.forceImmediate || isUrgentChemStatus(newStatus);
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
          actionUrl: args.reportUrl,
          actionLabel: 'Open report',
          tag,
          metadata: {
            chemistryId: args.reportId,
            formNumber: args.formNumber,
            formType: args.formType,
            status: args.newStatus,
            clientCode: args.clientCode ?? '',
            highlightKind: hi.badgeText,
            ...extraMeta,
          },
        });

        this.log.log(
          `Email sent IMMEDIATE (TO CHEMISTRY LAB): ${newStatus} → ${emailRecipients.join(', ')} (${args.formNumber})`,
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
          clientCode: args.clientCode ?? null,
          ...extraMeta,
        },
      });

      if (immediate) return;

      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'LAB',
          dept: 'CHEMISTRY',
          clientCode: args.clientCode ?? null,
          recipientsKey: JSON.stringify(emailRecipients),
          tag,
          reportId: args.reportId,
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
        `Queued DIGEST (TO CHEMISTRY LAB): ${newStatus} → ${emailRecipients.join(', ')} (${args.formNumber})`,
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
      const immediate = options.forceImmediate || isUrgentChemStatus(newStatus);
      const defaultHighlight = highlightForStatus(String(newStatus));

      const hi = {
        badgeText: options.badgeText ?? defaultHighlight.badgeText,
        badgeTone: options.badgeTone ?? defaultHighlight.badgeTone,
        priorityLine: options.priorityLine ?? defaultHighlight.priorityLine,
      };
      const extraMeta = options.extraMeta ?? {};

      if (emails.length === 0) {
        this.log.warn(
          `No active client emails for clientCode=${clientCode} (${args.formNumber})`,
        );
      }

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
          ...extraMeta,
        },
      });

      if (immediate || emails.length === 0) return;

      await this.prisma.notificationOutbox.create({
        data: {
          scope: 'CLIENT',
          dept: 'CHEMISTRY',
          clientCode,
          recipientsKey: JSON.stringify(emails),
          tag,
          reportId: args.reportId,
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
        `Queued DIGEST (TO CLIENT): ${newStatus} → ${emails.join(', ')} (${args.formNumber})`,
      );
    };

    const notifyApprovalTeam = async (args2: {
      requestKind: WorkflowRequestKind;
      requestedByRole: UserRole | null;
      workflowReturnStatus?: string | null;
    }) => {
      const title = `${formLabelText}: ${args2.requestKind === 'CHANGE' ? 'Change' : 'Correction'} Request Awaiting Approval`;
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
          actionUrl: args.reportUrl,
          actionLabel: 'Review request',
          tag: `${args2.requestKind.toLowerCase()}-request-approval`,
          metadata: {
            chemistryId: args.reportId,
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
          clientCode: args.clientCode ?? null,
          requestKind: args2.requestKind,
          requestedByRole: args2.requestedByRole,
          workflowReturnStatus: args2.workflowReturnStatus ?? null,
        },
      });

      this.log.log(
        `Chemistry approval notification sent: ${args2.requestKind} → ${APPROVAL_ROLES.join(',')} (${args.formNumber})`,
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

    const workflow = await this.prisma.chemistryReport.findUnique({
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
        newStatus === ChemistryReportStatus.CHANGE_REQUESTED ||
        newStatus === ChemistryReportStatus.UNDER_CHANGE_UPDATE ||
        args.oldStatus === ChemistryReportStatus.CHANGE_REQUESTED
      ) {
        return 'CHANGE';
      }

      if (
        newStatus === ChemistryReportStatus.CORRECTION_REQUESTED ||
        newStatus === ChemistryReportStatus.UNDER_CORRECTION_UPDATE ||
        args.oldStatus === ChemistryReportStatus.CORRECTION_REQUESTED
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
        newStatus === ChemistryReportStatus.CHANGE_REQUESTED ||
        newStatus === ChemistryReportStatus.CORRECTION_REQUESTED
      ) {
        return actorUser?.role ?? null;
      }

      const requestStatus: ChemistryReportStatus =
        requestKind === 'CHANGE'
          ? ChemistryReportStatus.CHANGE_REQUESTED
          : ChemistryReportStatus.CORRECTION_REQUESTED;

      const history = await this.prisma.chemistryReportStatusHistory.findFirst({
        where: {
          chemistryId: args.reportId,
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

      const fieldRouting = await this.getChemistryCorrectionRecipientSide({
        reportId: args.reportId,
        formType: args.formType,
      });

      let recipientSide: CorrectionRecipientSide;

      if (requestedByClient) {
        recipientSide = args2.requestKind === 'CHANGE' ? 'CLIENT' : 'LAB';
      } else {
        recipientSide = fieldRouting.side;
      }

      this.log.log(
        `Routing approved chemistry ${args2.requestKind} request for ${args.formNumber}: ` +
          `requestedBy=${args2.requestedByRole}, ` +
          `approvedBy=${actorUser?.role ?? 'UNKNOWN'}, ` +
          `recipientSide=${recipientSide}, ` +
          `fields=${fieldRouting.fieldKeys.join(',') || 'NONE'}`,
      );

      const extraMeta = {
        requestKind: args2.requestKind,
        requestedByRole: args2.requestedByRole,
        workflowReturnStatus: workflow?.workflowReturnStatus ?? null,
        approvedByRole: actorUser?.role ?? null,
        correctionFieldKeys: fieldRouting.fieldKeys.join(','),
        correctionRecipientSide: recipientSide,
      };

      const isChange = args2.requestKind === 'CHANGE';

      const title = isChange
        ? 'Change Request Approved'
        : 'Correction Required';

      const subject = isChange
        ? `🟠 Change Request Approved — Omega LIMS — ${args.formNumber}`
        : `🔴 Correction Required — Omega LIMS — ${args.formNumber}`;

      const badgeText = isChange
        ? 'CHANGE REQUEST APPROVED'
        : 'CORRECTION REQUIRED';

      const badgeTone: NotificationTone = isChange ? 'ORANGE' : 'RED';

      const clientPriority = isChange
        ? 'Your change request was approved. Please make the requested changes and resubmit the report.'
        : 'Action required: Please correct the requested client-side fields and resubmit the report.';

      const labPriority = isChange
        ? 'The change request was approved. Please make the requested chemistry/testing changes to the report.'
        : 'Action required: Please correct the requested chemistry/testing fields and resubmit the report.';

      if (recipientSide === 'CLIENT' || recipientSide === 'BOTH') {
        await notifyClient(
          title,
          isChange
            ? 'approved-change-to-client'
            : 'approved-correction-to-client',
          {
            forceImmediate: true,
            subject,
            badgeText,
            badgeTone,
            priorityLine: clientPriority,
            extraMeta,
          },
        );
      }

      if (recipientSide === 'LAB' || recipientSide === 'BOTH') {
        await notifyLab(
          title,
          isChange ? 'approved-change-to-lab' : 'approved-correction-to-lab',
          {
            forceImmediate: true,
            roles: workingLabRoles,
            emailRoles: workingLabRoles,
            subject,
            badgeText,
            badgeTone,
            priorityLine: labPriority,
            extraMeta,
          },
        );
      }
    };

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
      await notifyLab(
        `${formLabelText} Report Approved by Client`,
        formLabelText === 'COA'
          ? 'coa-client-to-lab-approved'
          : 'chem-client-to-lab-approved',
      );
      return;
    }

    if (
      newStatus === ChemistryReportStatus.CHANGE_REQUESTED ||
      newStatus === ChemistryReportStatus.CORRECTION_REQUESTED
    ) {
      const requestKind = inferRequestKind();
      if (!requestKind) {
        this.log.error(
          `Unable to determine chemistry request kind for ${args.formNumber}`,
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
      newStatus === ChemistryReportStatus.UNDER_CHANGE_UPDATE ||
      newStatus === ChemistryReportStatus.UNDER_CORRECTION_UPDATE
    ) {
      const requestKind = inferRequestKind();
      if (!requestKind) {
        this.log.error(
          `Unable to determine approved chemistry request kind for ${args.formNumber}`,
        );
        return;
      }

      const requestedByRole = await resolveOriginalRequesterRole(requestKind);

      if (!requestedByRole) {
        this.log.error(
          `Missing original requester role for chemistry ${requestKind} request on ${args.formNumber}`,
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
