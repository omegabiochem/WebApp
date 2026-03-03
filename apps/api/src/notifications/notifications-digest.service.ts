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

@Injectable()
export class NotificationsDigestService {
  private readonly log = new Logger(NotificationsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // every 10 minutes
  @Cron('*/10 * * * *')
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

      const title =
        first.scope === 'CLIENT'
          ? `Omega LIMS — Summary updates (${first.clientCode ?? 'Client'})`
          : `Omega LIMS — Lab summary updates (${first.dept ?? 'LAB'})`;

      const subject =
        first.scope === 'CLIENT'
          ? `Omega LIMS — ${compact.length} update(s) — ${first.clientCode ?? 'Client'}`
          : `Omega LIMS — ${compact.length} update(s) — ${first.dept ?? 'LAB'}`;

      const lines = compact.slice(0, 80).map((x) => {
        // keep clean; if you want URL per line, append it
        return `${x.formNumber} — ${x.formType} — ${nice(x.newStatus)}`;
      });

      try {
        await this.mail.sendStatusNotificationEmail({
          to,
          subject,
          title,
          lines,
          actionUrl: undefined,
          actionLabel: undefined,
          tag: `digest-${String(first.scope).toLowerCase()}`,
          metadata: {
            scope: first.scope,
            dept: first.dept ?? '',
            clientCode: first.clientCode ?? '',
            worker,
          },
        });

        await this.prisma.notificationOutbox.updateMany({
          where: { id: { in: items.map(i => i.id) } },
          data: { sentAt: new Date(), claimKey: worker, claimedAt: now },
        });

        this.log.log(`Digest sent: ${k} (${compact.length} items)`);
      } catch (e: any) {
        await this.prisma.notificationOutbox.updateMany({
          where: { id: { in: items.map(i => i.id) } },
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