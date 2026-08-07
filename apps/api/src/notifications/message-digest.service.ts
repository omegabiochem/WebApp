import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';

function parseRecipientsKey(key: string): string[] {
  try {
    const arr = JSON.parse(key);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function shorten(text: string, max = 140) {
  const s = String(text ?? '').trim();
  if (!s) return 'New message';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

@Injectable()
export class MessageDigestService {
  private readonly log = new Logger(MessageDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron('*/5 * * * *')
  async flush() {
    const worker = process.env.HOSTNAME || `pid-${process.pid}`;
    const now = new Date();

    const rows = await this.prisma.messageNotificationOutbox.findMany({
      where: { sentAt: null },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    if (rows.length === 0) return;

    const groups = new Map<string, typeof rows>();

    for (const r of rows) {
      const key = [
        r.scope,
        r.recipientsKey,
        r.dept ?? '',
        r.clientCode ?? '',
      ].join('|');

      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }

    for (const [groupKey, items] of groups.entries()) {
      const first = items[0];
      const to = parseRecipientsKey(first.recipientsKey);
      if (to.length === 0) continue;

      // latest message per thread
      const latestByThread = new Map<string, (typeof items)[number]>();
      for (const it of items) latestByThread.set(it.threadId, it);
      const compact = [...latestByThread.values()];

      const subject =
        first.scope === 'CLIENT'
          ? `🟩 Message from Omega Lab — ${first.clientCode ?? 'Client'}`
          : `🟩 Message from ${first.clientCode ?? 'Client'} — Omega LIMS`;

      const title =
        first.scope === 'CLIENT' ? 'New Message' : 'New Client Message';

      // const lines = compact.slice(0, 80).map((x) => {
      //   const from = x.senderName || x.senderRole;
      //   return `From: ${from} (${x.senderRole}) — ${shorten(x.preview, 160)}`;
      // });

      const lines = compact.slice(0, 80).map((x) => {
        const from = x.senderName || x.senderRole;
        return `From: ${from} (${x.senderRole})`;
      });

      const actionUrl =
        compact.length === 1 ? (compact[0].actionUrl ?? undefined) : undefined;

      try {
        await this.mail.sendStatusNotificationEmail({
          to,
          subject,
          title,
          // badgeText: 'Message Digest',
          badgeText: 'MESSAGE',
          badgeTone: 'LIGHT_GREEN',
          priorityLine:
            first.scope === 'CLIENT'
              ? 'You received a new message from Omega Lab.'
              : `${first.clientCode ?? 'Client'} sent a new message.`,
          lines,
          actionUrl,
          actionLabel: actionUrl ? 'Open message' : undefined,
          tag: `digest-message-${String(first.scope).toLowerCase()}`,
          metadata: {
            worker,
            scope: first.scope,
            dept: first.dept ?? '',
            clientCode: first.clientCode ?? '',
            threadCount: compact.length,
            messageCount: items.length,
            kind: 'message-digest',
          },
        });

        await this.prisma.messageNotificationOutbox.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: {
            sentAt: new Date(),
            claimKey: worker,
            claimedAt: now,
          },
        });

        this.log.log(
          `Message digest sent: ${groupKey} (${compact.length} threads)`,
        );
      } catch (e: any) {
        await this.prisma.messageNotificationOutbox.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: {
            attempts: { increment: 1 },
            lastError: String(e?.message ?? e),
          },
        });

        this.log.error(
          `Message digest FAILED: ${groupKey} :: ${String(e?.message ?? e)}`,
        );
      }
    }
  }
}
