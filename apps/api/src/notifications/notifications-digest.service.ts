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
  badgeTone: 'RED' | 'ORANGE' | 'BLUE' | 'GRAY' | 'GREEN';
  priorityLine?: string;
};

function digestHighlightForStatuses(statuses: string[]): DigestHighlight {
  const hasCorrection = statuses.some((s) =>
    String(s).includes('NEEDS_CORRECTION'),
  );
  if (hasCorrection) {
    return {
      badgeText: 'Corrections Included',
      badgeTone: 'RED',
      priorityLine:
        'Action required: This digest includes one or more reports needing correction.',
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

  // const hasReview = statuses.some((s) =>
  //   [
  //     'UNDER_CLIENT_PRELIMINARY_REVIEW',
  //     'UNDER_CLIENT_FINAL_REVIEW',
  //     'UNDER_CLIENT_REVIEW',
  //   ].includes(String(s)),
  // );
  // if (hasReview) {
  //   return {
  //     badgeText: 'Review Required',
  //     badgeTone: 'ORANGE',
  //     priorityLine:
  //       'Action required: This digest includes reports waiting for client review.',
  //   };
  // }

  const hasPreliminaryResultsReady = statuses.some((s) =>
    ['UNDER_CLIENT_PRELIMINARY_REVIEW'].includes(String(s)),
  );
  if (hasPreliminaryResultsReady) {
    return {
      badgeText: 'Preliminary Results Available',
      badgeTone: 'GREEN' as const,
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
      badgeTone: 'GREEN' as const,
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
      badgeTone: 'GREEN' as const,
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

function digestBucketForStatus(status: string): string {
  const s = String(status);

  if (s === 'UNDER_CLIENT_PRELIMINARY_REVIEW') return 'PRELIM_RESULTS';
  if (s === 'UNDER_CLIENT_FINAL_REVIEW') return 'FINAL_RESULTS';
  if (s === 'UNDER_CLIENT_REVIEW') return 'RESULTS';

  if (s.includes('NEEDS_CORRECTION')) return 'CORRECTION';
  if (s === 'SUBMITTED_BY_CLIENT') return 'SUBMISSION';
  if (s === 'APPROVED' || s === 'FINAL_APPROVED') return 'APPROVED';

  return 'OTHER';
}

@Injectable()
export class NotificationsDigestService {
  private readonly log = new Logger(NotificationsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // every 30 minutes
  @Cron('*/30 * * * *')
  async flush() {
    const worker = process.env.HOSTNAME || `pid-${process.pid}`;
    const now = new Date();

    // pick up to 500 unsent events
    const rows = await this.prisma.notificationOutbox.findMany({
      where: { sentAt: null },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    if (rows.length === 0) return;

    // group by recipients + scope (+ client/dept)
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
      if (to.length === 0) continue;

      // compress: last update per reportId
      const latestByReport = new Map<string, (typeof items)[number]>();
      for (const it of items) latestByReport.set(it.reportId, it);
      const compact = [...latestByReport.values()];

      const hi = digestHighlightForStatuses(
        compact.map((x) => String(x.newStatus)),
      );

      const title =
        first.scope === 'CLIENT'
          ? `${hi.badgeText}: Summary updates (${first.clientCode ?? 'Client'})`
          : `${hi.badgeText}: Lab summary updates (${first.dept ?? 'LAB'})`;

      const subject =
        first.scope === 'CLIENT'
          ? `[${hi.badgeText}] Omega LIMS — ${compact.length} update(s) — ${first.clientCode ?? 'Client'}`
          : `[${hi.badgeText}] Omega LIMS — ${compact.length} update(s) — ${first.dept ?? 'LAB'}`;

      const lines = compact.slice(0, 80).map((x) => {
        // keep clean; if you want URL per line, append it
        return `${x.formNumber} — ${x.formType} — ${nice(x.newStatus)}`;
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
          where: { id: { in: items.map((i) => i.id) } },
          data: { sentAt: new Date(), claimKey: worker, claimedAt: now },
        });

        this.log.log(`Digest sent: ${k} (${compact.length} items)`);
      } catch (e: any) {
        await this.prisma.notificationOutbox.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: {
            attempts: { increment: 1 },
            lastError: String(e?.message ?? e),
          },
        });

        this.log.error(`Digest FAILED: ${k} :: ${String(e?.message ?? e)}`);
      }
    }
  }
}
