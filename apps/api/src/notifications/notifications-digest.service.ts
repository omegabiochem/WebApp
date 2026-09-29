import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

function nice(s: string) {
  return String(s).replace(/_/g, ' ');
}

function parseRecipientsKey(key: string): string[] {
  try {
    const arr = JSON.parse(key);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

type DigestHighlight = {
  badgeText: string;
  badgeTone: 'RED' | 'ORANGE' | 'BLUE' | 'GRAY' | 'GREEN' | 'DARK_GREEN';

  priorityLine?: string;
};

/*
 * ============================================================
 * CORRECTION / CHANGE STATUSES
 *
 * These statuses use the special 5-minute digest.
 * They must NOT be processed by the normal 30-minute digest.
 * ============================================================
 */
const CORRECTION_DIGEST_STATUSES: string[] = [
  // General workflow requests
  'CORRECTION_REQUESTED',
  'CHANGE_REQUESTED',

  // Approved request / update in progress
  'UNDER_CORRECTION_UPDATE',
  'UNDER_CHANGE_UPDATE',

  // Micro correction statuses
  'CLIENT_NEEDS_PRELIMINARY_CORRECTION',
  'CLIENT_NEEDS_FINAL_CORRECTION',
  'PRELIMINARY_TESTING_NEEDS_CORRECTION',
  'FINAL_TESTING_NEEDS_CORRECTION',
  'QA_NEEDS_PRELIMINARY_CORRECTION',
  'QA_NEEDS_FINAL_CORRECTION',

  // Shared / Sterility / APE / Chemistry / COA
  'CLIENT_NEEDS_CORRECTION',
  'TESTING_NEEDS_CORRECTION',
  'QA_NEEDS_CORRECTION',
  'ADMIN_NEEDS_CORRECTION',
  'FRONTDESK_NEEDS_CORRECTION',
];

function digestHighlightForStatuses(statuses: string[]): DigestHighlight {
  const hasCorrection = statuses.some(
    (s) =>
      String(s).includes('NEEDS_CORRECTION') ||
      String(s) === 'CORRECTION_REQUESTED' ||
      String(s) === 'CHANGE_REQUESTED',
  );

  if (hasCorrection) {
    return {
      badgeText: 'Corrections Included',
      badgeTone: 'RED',
      priorityLine:
        'Action required: This digest includes one or more reports needing correction or change review.',
    };
  }

  const hasUpdateInProgress = statuses.some((s) => {
    const v = String(s);

    return v === 'UNDER_CORRECTION_UPDATE' || v === 'UNDER_CHANGE_UPDATE';
  });

  if (hasUpdateInProgress) {
    return {
      badgeText: 'Updates In Progress',
      badgeTone: 'ORANGE',
      priorityLine:
        'This digest includes reports currently being updated based on requested corrections or changes.',
    };
  }

  const hasSubmission = statuses.some(
    (s) => String(s) === 'SUBMITTED_BY_CLIENT',
  );

  if (hasSubmission) {
    return {
      badgeText: 'New Submissions Included',
      badgeTone: 'BLUE',
      priorityLine:
        'Please review the newly submitted reports in this summary.',
    };
  }

  const hasPreliminaryResultsReady = statuses.some((s) =>
    ['UNDER_CLIENT_PRELIMINARY_REVIEW'].includes(String(s)),
  );

  if (hasPreliminaryResultsReady) {
    return {
      badgeText: 'Preliminary Results Available',
      badgeTone: 'DARK_GREEN',
      priorityLine:
        'Action required: Preliminary results are ready. Please review and approve or request corrections.',
    };
  }

  const hasFinalResultsReady = statuses.some((s) =>
    ['UNDER_CLIENT_FINAL_REVIEW'].includes(String(s)),
  );

  if (hasFinalResultsReady) {
    return {
      badgeText: 'Final Results Available',
      badgeTone: 'DARK_GREEN',
      priorityLine:
        'Action required: Final results are ready. Please review and approve or request corrections.',
    };
  }

  const hasResultsReady = statuses.some((s) =>
    ['UNDER_CLIENT_REVIEW'].includes(String(s)),
  );

  if (hasResultsReady) {
    return {
      badgeText: 'Results Available',
      badgeTone: 'DARK_GREEN',
      priorityLine:
        'Action required: Results are ready. Please review and approve or request corrections.',
    };
  }

  const hasApproved = statuses.some((s) =>
    ['APPROVED', 'FINAL_APPROVED'].includes(String(s)),
  );

  if (hasApproved) {
    return {
      badgeText: 'Approved Reports Included',
      badgeTone: 'GREEN',
      priorityLine: 'This digest includes approved reports.',
    };
  }

  return {
    badgeText: 'Summary Update',
    badgeTone: 'GRAY',
    priorityLine: undefined,
  };
}

function subjectMarkerForTone(tone: DigestHighlight['badgeTone']): string {
  switch (tone) {
    case 'RED':
      return '🔴';

    case 'ORANGE':
      return '🟠';

    case 'BLUE':
      return '🔵';

    case 'GREEN':
    case 'DARK_GREEN':
      return '🟢';

    case 'GRAY':
    default:
      return '⚪';
  }
}

function digestBucketForStatus(status: string): string {
  const s = String(status);

  if (s === 'UNDER_CLIENT_PRELIMINARY_REVIEW') {
    return 'PRELIM_RESULTS';
  }

  if (s === 'UNDER_CLIENT_FINAL_REVIEW') {
    return 'FINAL_RESULTS';
  }

  if (s === 'UNDER_CLIENT_REVIEW') {
    return 'RESULTS';
  }

  if (
    s.includes('NEEDS_CORRECTION') ||
    s === 'CORRECTION_REQUESTED' ||
    s === 'CHANGE_REQUESTED'
  ) {
    return 'CORRECTION';
  }

  if (s === 'UNDER_CORRECTION_UPDATE' || s === 'UNDER_CHANGE_UPDATE') {
    return 'UPDATE_IN_PROGRESS';
  }

  if (s === 'SUBMITTED_BY_CLIENT') {
    return 'SUBMISSION';
  }

  if (s === 'APPROVED' || s === 'FINAL_APPROVED') {
    return 'APPROVED';
  }

  return 'OTHER';
}

@Injectable()
export class NotificationsDigestService {
  private readonly log = new Logger(NotificationsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /*
   * ============================================================
   * CORRECTION DIGEST
   *
   * Worker checks every minute.
   *
   * A correction group waits until its FIRST event has been
   * sitting for 5 minutes.
   *
   * When ready, ALL currently queued corrections for that
   * recipient group are included in ONE email.
   *
   * Example:
   *
   * 10:00 correction A
   * 10:01 correction B
   * 10:03 correction C
   *
   * ~10:05 -> ONE email containing A + B + C
   *
   * ============================================================
   */
  @Cron('* * * * *')
  async flushCorrections() {
    const worker = process.env.HOSTNAME || `pid-${process.pid}`;

    const now = new Date();

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const rows = await this.prisma.notificationOutbox.findMany({
      where: {
        sentAt: null,

        newStatus: {
          in: CORRECTION_DIGEST_STATUSES,
        },
      },

      orderBy: {
        createdAt: 'asc',
      },

      take: 1000,
    });

    if (rows.length === 0) {
      return;
    }

    /*
     * IMPORTANT:
     *
     * CLIENT:
     * group by actual client.
     *
     * LAB:
     * combine multiple clients into one email when the
     * recipient list + department are the same.
     *
     * We intentionally DO NOT group by correction status.
     * This means correction requested + needs correction +
     * update-in-progress can all appear in ONE digest.
     */
    const groups = new Map<string, typeof rows>();

    for (const row of rows) {
      const key =
        row.scope === 'CLIENT'
          ? [row.scope, row.recipientsKey, row.clientCode ?? ''].join('|')
          : [row.scope, row.recipientsKey, row.dept ?? 'LAB'].join('|');

      const existing = groups.get(key) ?? [];

      existing.push(row);

      groups.set(key, existing);
    }

    for (const [key, items] of groups.entries()) {
      /*
       * Start the 5-minute window from the FIRST
       * unsent correction in this group.
       */
      const oldestCreatedAt = items.reduce(
        (oldest, item) => (item.createdAt < oldest ? item.createdAt : oldest),
        items[0].createdAt,
      );

      /*
       * Still inside the batching window.
       * Wait for a later cron run.
       */
      if (oldestCreatedAt > fiveMinutesAgo) {
        continue;
      }

      const first = items[0];

      const to = parseRecipientsKey(first.recipientsKey);

      if (to.length === 0) {
        /*
         * Don't repeatedly retry rows that can never
         * be emailed because recipient list is empty.
         */
        await this.prisma.notificationOutbox.updateMany({
          where: {
            id: {
              in: items.map((x) => x.id),
            },
          },

          data: {
            sentAt: now,
            claimKey: worker,
            claimedAt: now,
            lastError: 'Skipped digest because recipient list was empty',
          },
        });

        continue;
      }

      /*
       * Keep only the latest correction/update event
       * for each report.
       *
       * If the same report changed correction statuses
       * several times during the 5-minute window,
       * recipient sees its latest state only.
       */
      const latestByReport = new Map<string, (typeof items)[number]>();

      for (const item of items) {
        latestByReport.set(item.reportId, item);
      }

      const compact = [...latestByReport.values()].sort((a, b) =>
        String(a.formNumber).localeCompare(String(b.formNumber), undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );

      const hi = digestHighlightForStatuses(
        compact.map((x) => String(x.newStatus)),
      );

      const subjectMarker = subjectMarkerForTone(hi.badgeTone);

      const targetLabel =
        first.scope === 'CLIENT'
          ? (first.clientCode ?? 'Client')
          : (first.dept ?? 'LAB');

      const title =
        first.scope === 'CLIENT'
          ? `Correction Update Summary (${targetLabel})`
          : first.dept === 'APPROVAL'
            ? 'Correction / Change Approval Summary'
            : `Correction Update Summary (${targetLabel})`;

      const subject =
        `${subjectMarker} ${hi.badgeText} — ` +
        `Omega LIMS — ` +
        `${compact.length} report(s) — ` +
        `${targetLabel}`;

      /*
       * Include client information because LAB digest
       * may contain reports belonging to different clients.
       */
      const lines = compact.slice(0, 80).map((x) => {
        const clientText = x.clientCode
          ? `${x.clientName} (${x.clientCode})`
          : x.clientName;

        return (
          `${x.formNumber} — ` +
          `${clientText} — ` +
          `${x.formType} — ` +
          `${nice(x.newStatus)}`
        );
      });

      try {
        await this.mail.sendStatusNotificationEmail({
          to,

          subject,
          title,

          badgeText: hi.badgeText,

          badgeTone: hi.badgeTone,

          priorityLine: hi.priorityLine,

          lines,

          actionUrl: undefined,

          actionLabel: undefined,

          tag:
            first.scope === 'CLIENT'
              ? 'digest-correction-client'
              : 'digest-correction-lab',

          metadata: {
            scope: first.scope,

            dept: first.dept ?? '',

            clientCode: first.clientCode ?? '',

            worker,

            digestKind: 'FIVE_MINUTE_CORRECTION_DIGEST',

            digestWindowMinutes: 5,

            reportCount: compact.length,
          },
        });

        /*
         * IMPORTANT:
         *
         * Mark ALL events from the group as sent,
         * not only the compacted latest-per-report rows.
         *
         * Otherwise old events would send again.
         */
        await this.prisma.notificationOutbox.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },

          data: {
            sentAt: new Date(),

            claimKey: worker,

            claimedAt: now,

            lastError: null,
          },
        });

        this.log.log(
          `5-minute correction digest sent: ${key} ` +
            `(${compact.length} reports / ${items.length} events)`,
        );
      } catch (e: any) {
        await this.prisma.notificationOutbox.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },

          data: {
            attempts: {
              increment: 1,
            },

            lastError: String(e?.message ?? e),
          },
        });

        this.log.error(
          `Correction digest FAILED: ${key} :: ` + `${String(e?.message ?? e)}`,
        );
      }
    }
  }

  /*
   * ============================================================
   * NORMAL DIGEST
   *
   * Existing 30-minute behavior.
   *
   * Correction/change statuses are EXCLUDED here because
   * flushCorrections() owns them.
   * ============================================================
   */
  @Cron('*/30 * * * *')
  async flush() {
    const worker = process.env.HOSTNAME || `pid-${process.pid}`;

    const now = new Date();

    const rows = await this.prisma.notificationOutbox.findMany({
      where: {
        sentAt: null,

        /*
         * CRITICAL:
         *
         * Prevent normal 30-minute worker from
         * taking correction rows.
         */
        newStatus: {
          notIn: CORRECTION_DIGEST_STATUSES,
        },
      },

      orderBy: {
        createdAt: 'asc',
      },

      take: 500,
    });

    if (rows.length === 0) {
      return;
    }

    const groups = new Map<string, typeof rows>();

    for (const r of rows) {
      const k = [
        r.scope,
        r.recipientsKey,
        r.dept ?? '',
        r.clientCode ?? '',
        digestBucketForStatus(String(r.newStatus)),
      ].join('|');

      const arr = groups.get(k) ?? [];

      arr.push(r);

      groups.set(k, arr);
    }

    for (const [k, items] of groups.entries()) {
      const first = items[0];

      const to = parseRecipientsKey(first.recipientsKey);

      if (to.length === 0) {
        continue;
      }

      /*
       * Existing behavior:
       * latest status event per report.
       */
      const latestByReport = new Map<string, (typeof items)[number]>();

      for (const item of items) {
        latestByReport.set(item.reportId, item);
      }

      const compact = [...latestByReport.values()].sort((a, b) =>
        String(a.formNumber).localeCompare(String(b.formNumber), undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );

      const hi = digestHighlightForStatuses(
        compact.map((x) => String(x.newStatus)),
      );

      const subjectMarker = subjectMarkerForTone(hi.badgeTone);

      const title =
        first.scope === 'CLIENT'
          ? `Report Update Summary (${first.clientCode ?? 'Client'})`
          : `Lab Report Update Summary (${first.dept ?? 'LAB'})`;

      const subject =
        first.scope === 'CLIENT'
          ? `${subjectMarker} ${hi.badgeText} — Omega LIMS — ${compact.length} update(s) — ${first.clientCode ?? 'Client'}`
          : `${subjectMarker} ${hi.badgeText} — Omega LIMS — ${compact.length} update(s) — ${first.dept ?? 'LAB'}`;

      const lines = compact
        .slice(0, 80)
        .map((x) => `${x.formNumber} — ${x.formType} — ${nice(x.newStatus)}`);

      try {
        await this.mail.sendStatusNotificationEmail({
          to,
          subject,
          title,

          badgeText: hi.badgeText,

          badgeTone: hi.badgeTone,

          priorityLine: hi.priorityLine,

          lines,

          actionUrl: undefined,

          actionLabel: undefined,

          tag: `digest-${String(first.scope).toLowerCase()}`,

          metadata: {
            scope: first.scope,

            dept: first.dept ?? '',

            clientCode: first.clientCode ?? '',

            worker,

            digestKind: hi.badgeText,
          },
        });

        await this.prisma.notificationOutbox.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },

          data: {
            sentAt: new Date(),

            claimKey: worker,

            claimedAt: now,
          },
        });

        this.log.log(`Digest sent: ${k} (${compact.length} items)`);
      } catch (e: any) {
        await this.prisma.notificationOutbox.updateMany({
          where: {
            id: {
              in: items.map((item) => item.id),
            },
          },

          data: {
            attempts: {
              increment: 1,
            },

            lastError: String(e?.message ?? e),
          },
        });

        this.log.error(`Digest FAILED: ${k} :: ${String(e?.message ?? e)}`);
      }
    }
  }
}



// import { Injectable, Logger } from '@nestjs/common';
// import { Cron } from '@nestjs/schedule';
// import { PrismaService } from 'prisma/prisma.service';
// import { MailService } from 'src/mail/mail.service';

// function nice(s: string) {
//   return String(s).replace(/_/g, ' ');
// }

// function parseRecipientsKey(key: string): string[] {
//   try {
//     const arr = JSON.parse(key);
//     return Array.isArray(arr) ? arr : [];
//   } catch {
//     return [];
//   }
// }

// type DigestHighlight = {
//   badgeText: string;
//   badgeTone: 'RED' | 'ORANGE' | 'BLUE' | 'GRAY' | 'GREEN' | 'DARK_GREEN';
//   priorityLine?: string;
// };

// function digestHighlightForStatuses(statuses: string[]): DigestHighlight {
//   const hasCorrection = statuses.some(
//     (s) =>
//       String(s).includes('NEEDS_CORRECTION') ||
//       String(s).includes('CORRECTION_REQUESTED') ||
//       String(s).includes('CHANGE_REQUESTED'),
//   );
//   if (hasCorrection) {
//     return {
//       badgeText: 'Corrections Included',
//       badgeTone: 'RED',
//       priorityLine:
//         'Action required: This digest includes one or more reports needing correction.',
//     };
//   }

//   const hasUpdateInProgress = statuses.some((s) => {
//     const v = String(s);
//     return v === 'UNDER_CORRECTION_UPDATE' || v === 'UNDER_CHANGE_UPDATE';
//   });

//   if (hasUpdateInProgress) {
//     return {
//       badgeText: 'Updates In Progress',
//       badgeTone: 'ORANGE',
//       priorityLine:
//         'This digest includes reports currently being updated based on requested corrections or changes.',
//     };
//   }

//   const hasSubmission = statuses.some(
//     (s) => String(s) === 'SUBMITTED_BY_CLIENT',
//   );
//   if (hasSubmission) {
//     return {
//       badgeText: 'New Submissions Included',
//       badgeTone: 'BLUE',
//       priorityLine:
//         'Please review the newly submitted reports in this summary.',
//     };
//   }

//   // const hasReview = statuses.some((s) =>
//   //   [
//   //     'UNDER_CLIENT_PRELIMINARY_REVIEW',
//   //     'UNDER_CLIENT_FINAL_REVIEW',
//   //     'UNDER_CLIENT_REVIEW',
//   //   ].includes(String(s)),
//   // );
//   // if (hasReview) {
//   //   return {
//   //     badgeText: 'Review Required',
//   //     badgeTone: 'ORANGE',
//   //     priorityLine:
//   //       'Action required: This digest includes reports waiting for client review.',
//   //   };
//   // }

//   const hasPreliminaryResultsReady = statuses.some((s) =>
//     ['UNDER_CLIENT_PRELIMINARY_REVIEW'].includes(String(s)),
//   );
//   if (hasPreliminaryResultsReady) {
//     return {
//       badgeText: 'Preliminary Results Available',
//       badgeTone: 'DARK_GREEN' as const,
//       priorityLine:
//         'Action required: Preliminary results are ready. Please review and approve or request corrections.',
//     };
//   }
//   const hasFinalResultsReady = statuses.some((s) =>
//     ['UNDER_CLIENT_FINAL_REVIEW'].includes(String(s)),
//   );
//   if (hasFinalResultsReady) {
//     return {
//       badgeText: 'Final Results Available',
//       badgeTone: 'DARK_GREEN' as const,
//       priorityLine:
//         'Action required: Final results are ready. Please review and approve or request corrections.',
//     };
//   }
//   const hasResultsReady = statuses.some((s) =>
//     ['UNDER_CLIENT_REVIEW'].includes(String(s)),
//   );
//   if (hasResultsReady) {
//     return {
//       badgeText: 'Results Available',
//       badgeTone: 'DARK_GREEN' as const,
//       priorityLine:
//         'Action required: Results are ready. Please review and approve or request corrections.',
//     };
//   }

//   const hasApproved = statuses.some((s) =>
//     ['APPROVED', 'FINAL_APPROVED'].includes(String(s)),
//   );
//   if (hasApproved) {
//     return {
//       badgeText: 'Approved Reports Included',
//       badgeTone: 'GREEN',
//       priorityLine: 'This digest includes approved reports.',
//     };
//   }

//   return {
//     badgeText: 'Summary Update',
//     badgeTone: 'GRAY',
//     priorityLine: undefined,
//   };
// }

// function subjectMarkerForTone(tone: DigestHighlight['badgeTone']): string {
//   switch (tone) {
//     case 'RED':
//       return '🔴';

//     case 'ORANGE':
//       return '🟠';

//     case 'BLUE':
//       return '🔵';

//     case 'GREEN':
//       return '🟢';

//     case 'DARK_GREEN':
//       return '🟢';

//     case 'GRAY':
//     default:
//       return '⚪';
//   }
// }

// function digestBucketForStatus(status: string): string {
//   const s = String(status);

//   if (s === 'UNDER_CLIENT_PRELIMINARY_REVIEW') return 'PRELIM_RESULTS';
//   if (s === 'UNDER_CLIENT_FINAL_REVIEW') return 'FINAL_RESULTS';
//   if (s === 'UNDER_CLIENT_REVIEW') return 'RESULTS';

//   if (
//     s.includes('NEEDS_CORRECTION') ||
//     s === 'CORRECTION_REQUESTED' ||
//     s === 'CHANGE_REQUESTED'
//   ) {
//     return 'CORRECTION';
//   }

//   if (s === 'UNDER_CORRECTION_UPDATE' || s === 'UNDER_CHANGE_UPDATE') {
//     return 'UPDATE_IN_PROGRESS';
//   }
//   if (s === 'SUBMITTED_BY_CLIENT') return 'SUBMISSION';
//   if (s === 'APPROVED' || s === 'FINAL_APPROVED') return 'APPROVED';

//   return 'OTHER';
// }

// @Injectable()
// export class NotificationsDigestService {
//   private readonly log = new Logger(NotificationsDigestService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly mail: MailService,
//   ) {}

//   // every 30 minutes
//   @Cron('*/30 * * * *')
//   async flush() {
//     const worker = process.env.HOSTNAME || `pid-${process.pid}`;
//     const now = new Date();

//     // pick up to 500 unsent events
//     const rows = await this.prisma.notificationOutbox.findMany({
//       where: { sentAt: null },
//       orderBy: { createdAt: 'asc' },
//       take: 500,
//     });

//     if (rows.length === 0) return;

//     // group by recipients + scope (+ client/dept)
//     const groups = new Map<string, typeof rows>();
//     for (const r of rows) {
//       const k = [
//         r.scope,
//         r.recipientsKey,
//         r.dept ?? '',
//         r.clientCode ?? '',
//         digestBucketForStatus(String(r.newStatus)),
//       ].join('|');

//       const arr = groups.get(k) ?? [];
//       arr.push(r);
//       groups.set(k, arr);
//     }

//     for (const [k, items] of groups.entries()) {
//       const first = items[0];
//       const to = parseRecipientsKey(first.recipientsKey);
//       if (to.length === 0) continue;

//       // compress: last update per reportId
//       const latestByReport = new Map<string, (typeof items)[number]>();
//       for (const it of items) latestByReport.set(it.reportId, it);
//       const compact = [...latestByReport.values()].sort((a, b) =>
//         String(a.formNumber).localeCompare(String(b.formNumber), undefined, {
//           numeric: true,
//           sensitivity: 'base',
//         }),
//       );

//       const hi = digestHighlightForStatuses(
//         compact.map((x) => String(x.newStatus)),
//       );

//       const subjectMarker = subjectMarkerForTone(hi.badgeTone);

//       const title =
//         first.scope === 'CLIENT'
//           ? `Report Update Summary (${first.clientCode ?? 'Client'})`
//           : `Lab Report Update Summary (${first.dept ?? 'LAB'})`;

//       const subject =
//         first.scope === 'CLIENT'
//           ? `${subjectMarker} ${hi.badgeText} — Omega LIMS — ${compact.length} update(s) — ${first.clientCode ?? 'Client'}`
//           : `${subjectMarker} ${hi.badgeText} — Omega LIMS — ${compact.length} update(s) — ${first.dept ?? 'LAB'}`;

//       const lines = compact.slice(0, 80).map((x) => {
//         // keep clean; if you want URL per line, append it
//         return `${x.formNumber} — ${x.formType} — ${nice(x.newStatus)}`;
//       });

//       try {
//         await this.mail.sendStatusNotificationEmail({
//           to,
//           subject,
//           title,
//           badgeText: hi.badgeText,
//           badgeTone: hi.badgeTone,
//           priorityLine: hi.priorityLine,
//           lines,
//           actionUrl: undefined,
//           actionLabel: undefined,
//           tag: `digest-${String(first.scope).toLowerCase()}`,
//           metadata: {
//             scope: first.scope,
//             dept: first.dept ?? '',
//             clientCode: first.clientCode ?? '',
//             worker,
//             digestKind: hi.badgeText,
//           },
//         });

//         await this.prisma.notificationOutbox.updateMany({
//           where: { id: { in: items.map((i) => i.id) } },
//           data: { sentAt: new Date(), claimKey: worker, claimedAt: now },
//         });

//         this.log.log(`Digest sent: ${k} (${compact.length} items)`);
//       } catch (e: any) {
//         await this.prisma.notificationOutbox.updateMany({
//           where: { id: { in: items.map((i) => i.id) } },
//           data: {
//             attempts: { increment: 1 },
//             lastError: String(e?.message ?? e),
//           },
//         });

//         this.log.error(`Digest FAILED: ${k} :: ${String(e?.message ?? e)}`);
//       }
//     }
//   }
// }
