import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  FormType,
  UserRole,
  WorkflowReminderKind,
  WorkflowReminderSourceType,
  WorkflowReminderTargetSide,
} from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from '../mail/notification-recipients.service';

type WorkSchedule = {
  enabled: boolean;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  workingDays: number[];
  intervalMinutes: number;
  maxCount: number;
};

type StatusChangeArgs = {
  sourceType: WorkflowReminderSourceType;
  sourceId: string;

  formType: FormType;
  formNumber: string;

  clientCode?: string | null;

  newStatus: string;

  requestKind?: string | null;
  requestedByRole?: UserRole | null;
};

const REMINDER_STATUSES = new Set([
  'CORRECTION_REQUESTED',
  'CHANGE_REQUESTED',
  'UNDER_CORRECTION_UPDATE',
  'UNDER_CHANGE_UPDATE',
]);

const APPROVAL_ROLES: UserRole[] = [
  'ADMIN',
  'SYSTEMADMIN',
  'QA',
];

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function normalizeEmails(values: string[]) {
  return [
    ...new Set(
      (values ?? [])
        .flatMap((value) =>
          String(value ?? '').split(/[;,]/),
        )
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.includes('@')),
    ),
  ].sort();
}

function parseClock(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return hour * 60 + minute;
}

function parseWorkingDays(value?: string): number[] {
  if (!value) return [1, 2, 3, 4, 5];

  const days = value
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(
      (x) =>
        Number.isInteger(x) &&
        x >= 1 &&
        x <= 7,
    );

  return days.length
    ? [...new Set(days)]
    : [1, 2, 3, 4, 5];
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone,
    }).format(new Date());

    return true;
  } catch {
    return false;
  }
}

function getZonedDayAndMinute(
  date: Date,
  timeZone: string,
) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);

  const weekday =
    parts.find((x) => x.type === 'weekday')?.value ??
    'Mon';

  const hour = Number(
    parts.find((x) => x.type === 'hour')?.value ?? 0,
  );

  const minute = Number(
    parts.find((x) => x.type === 'minute')?.value ?? 0,
  );

  return {
    weekday: WEEKDAY_MAP[weekday] ?? 1,
    minuteOfDay: hour * 60 + minute,
  };
}

function isWorkingInstant(
  date: Date,
  schedule: WorkSchedule,
) {
  const local = getZonedDayAndMinute(
    date,
    schedule.timeZone,
  );

  return (
    schedule.workingDays.includes(local.weekday) &&
    local.minuteOfDay >= schedule.startMinutes &&
    local.minuteOfDay < schedule.endMinutes
  );
}

/**
 * Counts only minutes occurring inside the selected
 * timezone's working schedule.
 *
 * Example:
 * Mon 4:30 PM -> Tue 9:30 AM
 * for a Mon-Fri 9-5 schedule.
 */
function addWorkingMinutes(
  start: Date,
  amount: number,
  schedule: WorkSchedule,
) {
  let cursor = new Date(start);
  let remaining = Math.max(1, amount);

  // Safety: do not loop forever if configuration is invalid.
  const maximumIterations = 60 * 24 * 45;
  let iterations = 0;

  while (remaining > 0) {
    if (isWorkingInstant(cursor, schedule)) {
      remaining -= 1;
    }

    cursor = new Date(
      cursor.getTime() + 60_000,
    );

    iterations += 1;

    if (iterations > maximumIterations) {
      throw new Error(
        `Unable to calculate working-time deadline for timezone=${schedule.timeZone}`,
      );
    }
  }

  return cursor;
}

function nextWorkingInstant(
  start: Date,
  schedule: WorkSchedule,
) {
  let cursor = new Date(start);

  const maximumIterations = 60 * 24 * 14;

  for (
    let i = 0;
    i < maximumIterations;
    i += 1
  ) {
    if (isWorkingInstant(cursor, schedule)) {
      return cursor;
    }

    cursor = new Date(
      cursor.getTime() + 60_000,
    );
  }

  throw new Error(
    `Unable to find next working time for ${schedule.timeZone}`,
  );
}

function workingLabRoles(
  formType: FormType,
): UserRole[] {
  if (
    formType === 'CHEMISTRY_MIX' ||
    formType === 'COA'
  ) {
    return ['CHEMISTRY', 'MC'];
  }

  return ['MICRO', 'MC'];
}

@Injectable()
export class WorkflowReminderService {
  private readonly log = new Logger(
    WorkflowReminderService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  private omegaSchedule(): WorkSchedule {
    const timeZone =
      process.env.OMEGA_TIME_ZONE ??
      'America/New_York';

    return {
      enabled: true,

      timeZone: isValidTimeZone(timeZone)
        ? timeZone
        : 'America/New_York',

      startMinutes: parseClock(
        process.env.OMEGA_WORKDAY_START,
        540,
      ),

      endMinutes: parseClock(
        process.env.OMEGA_WORKDAY_END,
        1020,
      ),

      workingDays: parseWorkingDays(
        process.env.OMEGA_WORKING_DAYS,
      ),

      intervalMinutes: Number(
        process.env
          .WORKFLOW_REMINDER_INTERVAL_MINUTES ??
          60,
      ),

      maxCount: Math.min(
        10,
        Math.max(
          1,
          Number(
            process.env
              .WORKFLOW_REMINDER_MAX_COUNT ??
              10,
          ),
        ),
      ),
    };
  }

  private async clientSchedule(
    clientCode?: string | null,
  ): Promise<WorkSchedule> {
    const fallback = this.omegaSchedule();

    if (!clientCode) {
      return fallback;
    }

    const client =
      await this.prisma.clientDetails.findUnique({
        where: {
          clientCode: clientCode
            .trim()
            .toUpperCase(),
        },
      });

    if (!client) {
      this.log.warn(
        `No ClientDetails found for ${clientCode}; using Omega/New York defaults`,
      );

      return fallback;
    }

    const timeZone = isValidTimeZone(client.timeZone)
      ? client.timeZone
      : fallback.timeZone;

    return {
      enabled: client.workflowReminderEnabled,

      timeZone,

      startMinutes:
        client.workdayStartMinutes,

      endMinutes:
        client.workdayEndMinutes,

      workingDays:
        client.workingDays?.length
          ? client.workingDays
          : fallback.workingDays,

      intervalMinutes: Math.max(
        1,
        client.workflowReminderIntervalMinutes,
      ),

      maxCount: Math.min(
        10,
        Math.max(
          1,
          client.workflowReminderMaxCount,
        ),
      ),
    };
  }

  private async scheduleForTarget(
    targetSide: WorkflowReminderTargetSide,
    clientCode?: string | null,
  ) {
    if (targetSide === 'CLIENT') {
      return this.clientSchedule(clientCode);
    }

    return this.omegaSchedule();
  }

  private determineReminder(args: StatusChangeArgs): {
    kind: WorkflowReminderKind;
    targetSide: WorkflowReminderTargetSide;
  } | null {
    if (
      args.newStatus === 'CORRECTION_REQUESTED'
    ) {
      return {
        kind: 'CORRECTION',
        targetSide: 'APPROVAL_TEAM',
      };
    }

    if (args.newStatus === 'CHANGE_REQUESTED') {
      return {
        kind: 'CHANGE',
        targetSide: 'APPROVAL_TEAM',
      };
    }

    const requestedByClient =
      args.requestedByRole === 'CLIENT';

    if (
      args.newStatus === 'UNDER_CHANGE_UPDATE'
    ) {
      if (!args.requestedByRole) return null;

      return {
        kind: 'CHANGE',

        // CHANGE:
        // client -> client
        // lab    -> lab
        targetSide: requestedByClient
          ? 'CLIENT'
          : 'LAB',
      };
    }

    if (
      args.newStatus ===
      'UNDER_CORRECTION_UPDATE'
    ) {
      if (!args.requestedByRole) return null;

      return {
        kind: 'CORRECTION',

        // CORRECTION:
        // client -> lab
        // lab    -> client
        targetSide: requestedByClient
          ? 'LAB'
          : 'CLIENT',
      };
    }

    return null;
  }

  async handleStatusChange(
    args: StatusChangeArgs,
  ) {
    // Cancel whatever timer belonged to the
    // previous state.
    await this.resolveForSource(
      args.sourceType,
      args.sourceId,
    );

    if (!REMINDER_STATUSES.has(args.newStatus)) {
      return;
    }

    const routing =
      this.determineReminder(args);

    if (!routing) {
      this.log.error(
        `Cannot determine reminder recipient for ${args.formNumber} status=${args.newStatus} requestedByRole=${args.requestedByRole ?? 'NULL'}`,
      );
      return;
    }

    const schedule =
      await this.scheduleForTarget(
        routing.targetSide,
        args.clientCode,
      );

    if (!schedule.enabled) {
      this.log.log(
        `Workflow reminders disabled for ${args.formNumber}`,
      );
      return;
    }

    const startedAt = new Date();

    const nextReminderAt =
      addWorkingMinutes(
        startedAt,
        schedule.intervalMinutes,
        schedule,
      );

    const activeKey =
      `${args.sourceType}:${args.sourceId}`;

    await this.prisma.workflowReminder.create({
      data: {
        sourceType: args.sourceType,
        sourceId: args.sourceId,

        formType: args.formType,
        formNumber: args.formNumber,

        clientCode:
          args.clientCode?.trim() || null,

        expectedStatus: args.newStatus,

        requestKind: routing.kind,

        requestedByRole:
          args.requestedByRole ?? null,

        targetSide: routing.targetSide,

        activeKey,

        startedAt,
        nextReminderAt,

        reminderCount: 0,
        maxReminders: schedule.maxCount,
      },
    });

    this.log.log(
      `Reminder scheduled: ${args.formNumber} status=${args.newStatus} target=${routing.targetSide} next=${nextReminderAt.toISOString()} timezone=${schedule.timeZone}`,
    );
  }

  async resolveForSource(
    sourceType: WorkflowReminderSourceType,
    sourceId: string,
  ) {
    await this.prisma.workflowReminder.updateMany({
      where: {
        sourceType,
        sourceId,
        resolvedAt: null,
      },

      data: {
        resolvedAt: new Date(),
        activeKey: null,
        claimedAt: null,
        claimKey: null,
      },
    });
  }

  private reportUrl(
    sourceType: WorkflowReminderSourceType,
    sourceId: string,
    formType: FormType,
  ) {
    const base = String(
      process.env.APP_URL ??
        'https://www.omegabiochemlab.com',
    ).replace(/\/+$/, '');

    if (sourceType === 'CHEMISTRY_REPORT') {
      const slug =
        formType === 'COA'
          ? 'coa'
          : 'chemistry-mix';

      return `${base}/chemistry-reports/${slug}/${sourceId}`;
    }

    const slug =
      formType === 'MICRO_MIX'
        ? 'micro-mix'
        : formType === 'MICRO_MIX_WATER'
          ? 'micro-mix-water'
          : formType === 'STERILITY'
            ? 'sterility'
            : formType === 'APE'
              ? 'ape'
              : 'micro-mix';

    return `${base}/reports/${slug}/${sourceId}`;
  }

  private async getRecipients(reminder: any) {
    if (
      reminder.targetSide === 'APPROVAL_TEAM'
    ) {
      const configured = normalizeEmails(
        await this.recipients
          .getRoleNotificationEmails(
            APPROVAL_ROLES,
          ),
      );

      if (configured.length > 0) {
        return configured;
      }

      return normalizeEmails([
        process.env.ADMIN_NOTIFY_TO ?? '',
        process.env.QA_NOTIFY_TO ?? '',
        process.env.SYSTEMADMIN_NOTIFY_TO ??
          '',
        process.env.LAB_NOTIFY_TO ??
          'tech@omegabiochemlab.com',
      ]);
    }

    if (reminder.targetSide === 'CLIENT') {
      if (!reminder.clientCode) return [];

      return normalizeEmails(
        await this.recipients
          .getClientNotificationEmails(
            reminder.clientCode,
          ),
      );
    }

    const roles = workingLabRoles(
      reminder.formType,
    );

    const configured = normalizeEmails(
      await this.recipients
        .getRoleNotificationEmails(roles),
    );

    if (configured.length > 0) {
      return configured;
    }

    if (
      reminder.formType === 'CHEMISTRY_MIX' ||
      reminder.formType === 'COA'
    ) {
      return normalizeEmails([
        process.env.CHEMISTRY_NOTIFY_TO ??
          process.env.LAB_NOTIFY_TO ??
          'tech@omegabiochemlab.com',
      ]);
    }

    return normalizeEmails([
      process.env.MICRO_NOTIFY_TO ??
        process.env.LAB_NOTIFY_TO ??
        'tech@omegabiochemlab.com',
    ]);
  }

  private async currentSourceStatus(
    reminder: any,
  ) {
    if (
      reminder.sourceType === 'CHEMISTRY_REPORT'
    ) {
      return this.prisma.chemistryReport.findUnique({
        where: {
          id: reminder.sourceId,
        },
        select: {
          status: true,
          clientCode: true,
          workflowRequestKind: true,
          workflowRequestedByRole: true,
        },
      });
    }

    return this.prisma.report.findUnique({
      where: {
        id: reminder.sourceId,
      },
      select: {
        status: true,
        clientCode: true,
        workflowRequestKind: true,
        workflowRequestedByRole: true,
      },
    });
  }

  private async sendReminder(reminder: any) {
    const recipients =
      await this.getRecipients(reminder);

    if (recipients.length === 0) {
      throw new Error(
        `No email recipients found for ${reminder.formNumber}`,
      );
    }

    const isCorrection =
      reminder.requestKind === 'CORRECTION';

    const marker = isCorrection
      ? '🔴'
      : '🟠';

    const tone = isCorrection
      ? ('RED' as const)
      : ('ORANGE' as const);

    let title: string;
    let badgeText: string;
    let priorityLine: string;

    if (
      reminder.expectedStatus ===
        'CORRECTION_REQUESTED' ||
      reminder.expectedStatus ===
        'CHANGE_REQUESTED'
    ) {
      title = isCorrection
        ? 'Correction Request Awaiting Approval'
        : 'Change Request Awaiting Approval';

      badgeText = isCorrection
        ? 'CORRECTION REMINDER'
        : 'CHANGE REMINDER';

      priorityLine = isCorrection
        ? 'Action required: This correction request is still waiting for approval.'
        : 'Action required: This change request is still waiting for approval.';
    } else if (isCorrection) {
      title = 'Correction Required';

      badgeText = 'CORRECTION REMINDER';

      priorityLine =
        'Action required: The correction is still pending. Please complete the required correction and resubmit the report.';
    } else {
      title = 'Change Required';

      badgeText = 'CHANGE REMINDER';

      priorityLine =
        'Action required: The approved change is still pending. Please complete the requested changes.';
    }

    const nextNumber =
      reminder.reminderCount + 1;

    await this.mail.sendStatusNotificationEmail({
      to: recipients,

      subject:
        `${marker} Reminder — ${title} — Omega LIMS — ${reminder.formNumber}`,

      title,

      badgeText,
      badgeTone: tone,
      priorityLine,

      lines: [
        `Form #: ${reminder.formNumber}`,
        `Client: ${reminder.clientCode ?? '-'}`,
        `Form Type: ${reminder.formType}`,
        `Status: ${String(
          reminder.expectedStatus,
        ).replace(/_/g, ' ')}`,
        `Reminder: ${nextNumber} of ${reminder.maxReminders}`,
      ],

      actionUrl: this.reportUrl(
        reminder.sourceType,
        reminder.sourceId,
        reminder.formType,
      ),

      actionLabel:
        reminder.targetSide ===
        'APPROVAL_TEAM'
          ? 'Review request'
          : 'Open report',

      tag: `workflow-reminder-${String(
        reminder.requestKind,
      ).toLowerCase()}`,

      metadata: {
        reminderId: reminder.id,
        sourceType: reminder.sourceType,
        sourceId: reminder.sourceId,
        formNumber: reminder.formNumber,
        formType: reminder.formType,
        status: reminder.expectedStatus,
        clientCode:
          reminder.clientCode ?? '',
        reminderNumber: nextNumber,
        requestKind:
          reminder.requestKind ?? '',
        targetSide:
          reminder.targetSide,
      },
    });
  }

  @Cron('* * * * *')
  async processDueReminders() {
    const worker =
      process.env.HOSTNAME ??
      `pid-${process.pid}`;

    const now = new Date();

    const due =
      await this.prisma.workflowReminder.findMany({
        where: {
          resolvedAt: null,
          nextReminderAt: {
            lte: now,
          },
        },

        orderBy: {
          nextReminderAt: 'asc',
        },

        take: 100,
      });

    for (const reminder of due) {
      if (
        reminder.reminderCount >=
        reminder.maxReminders
      ) {
        await this.resolveForSource(
          reminder.sourceType,
          reminder.sourceId,
        );
        continue;
      }

      // prevent two API instances from
      // sending the same reminder
      const staleClaim = new Date(
        Date.now() - 10 * 60_000,
      );

      const claim =
        await this.prisma.workflowReminder.updateMany({
          where: {
            id: reminder.id,
            resolvedAt: null,

            OR: [
              {
                claimedAt: null,
              },
              {
                claimedAt: {
                  lt: staleClaim,
                },
              },
            ],
          },

          data: {
            claimedAt: new Date(),
            claimKey: worker,
          },
        });

      if (claim.count !== 1) {
        continue;
      }

      try {
        const current =
          await this.currentSourceStatus(
            reminder,
          );

        if (!current) {
          await this.resolveForSource(
            reminder.sourceType,
            reminder.sourceId,
          );
          continue;
        }

        if (
          String(current.status) !==
          reminder.expectedStatus
        ) {
          this.log.log(
            `Stopping reminder for ${reminder.formNumber}: expected=${reminder.expectedStatus}, current=${current.status}`,
          );

          await this.resolveForSource(
            reminder.sourceType,
            reminder.sourceId,
          );

          continue;
        }

        const schedule =
          await this.scheduleForTarget(
            reminder.targetSide,
            reminder.clientCode,
          );

        if (!schedule.enabled) {
          await this.resolveForSource(
            reminder.sourceType,
            reminder.sourceId,
          );

          continue;
        }

        // If working hours/timezone were changed
        // after the reminder was created, don't send
        // outside the new schedule.
        if (
          !isWorkingInstant(
            new Date(),
            schedule,
          )
        ) {
          const next =
            nextWorkingInstant(
              new Date(),
              schedule,
            );

          await this.prisma.workflowReminder.update({
            where: {
              id: reminder.id,
            },

            data: {
              nextReminderAt: next,
              claimedAt: null,
              claimKey: null,
            },
          });

          continue;
        }

        await this.sendReminder(reminder);

        const sentAt = new Date();

        const newCount =
          reminder.reminderCount + 1;

        if (
          newCount >= reminder.maxReminders
        ) {
          await this.prisma.workflowReminder.update({
            where: {
              id: reminder.id,
            },

            data: {
              reminderCount: newCount,
              lastReminderAt: sentAt,

              resolvedAt: sentAt,
              activeKey: null,

              claimedAt: null,
              claimKey: null,

              lastError: null,
            },
          });

          this.log.warn(
            `Maximum reminders reached for ${reminder.formNumber}: ${newCount}/${reminder.maxReminders}`,
          );

          continue;
        }

        const nextReminderAt =
          addWorkingMinutes(
            sentAt,
            schedule.intervalMinutes,
            schedule,
          );

        await this.prisma.workflowReminder.update({
          where: {
            id: reminder.id,
          },

          data: {
            reminderCount: newCount,
            lastReminderAt: sentAt,
            nextReminderAt,

            claimedAt: null,
            claimKey: null,

            lastError: null,
          },
        });

        this.log.log(
          `Reminder sent ${newCount}/${reminder.maxReminders}: ${reminder.formNumber}; next=${nextReminderAt.toISOString()}`,
        );
      } catch (error: any) {
        this.log.error(
          `Reminder failed for ${reminder.formNumber}: ${error?.message ?? error}`,
          error?.stack,
        );

        await this.prisma.workflowReminder.update({
          where: {
            id: reminder.id,
          },

          data: {
            sendAttempts: {
              increment: 1,
            },

            lastError:
              String(
                error?.message ?? error,
              ).slice(0, 2000),

            // retry delivery in 5 minutes;
            // processDueReminders still checks
            // working hours before sending.
            nextReminderAt: new Date(
              Date.now() + 5 * 60_000,
            ),

            claimedAt: null,
            claimKey: null,
          },
        });
      }
    }
  }
}