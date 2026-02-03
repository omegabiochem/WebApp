// // apps/api/src/mail/notification-recipients.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { PrismaService } from 'prisma/prisma.service';
// import { UserRole } from '@prisma/client';

// @Injectable()
// export class NotificationRecipientsService {
//   private readonly log = new Logger(NotificationRecipientsService.name);

//   constructor(private readonly prisma: PrismaService) {}

//   /**
//    * Returns all active CLIENT user emails for a given clientCode.
//    * - Dedupes
//    * - Normalizes (trim + lowercase)
//    * - Filters invalid/empty values
//    *
//    * NOTE: We intentionally do NOT filter by "emailNotificationsEnabled" here,
//    * because that field may not exist yet in your schema. You can add it later.
//    */
//   async getClientEmails(clientCode: string): Promise<string[]> {
//     const code = (clientCode ?? '').trim();
//     if (!code) return [];

//     const rows = await this.prisma.user.findMany({
//       where: {
//         clientCode: code,
//         role: UserRole.CLIENT,
//         active: true,
//         email: { not: '' },
//       },
//       select: { email: true },
//     });

//     const emails = rows
//       .map((r) => (r.email ?? '').trim().toLowerCase())
//       .filter((e) => !!e && e.includes('@'));

//     const unique = [...new Set(emails)];

//     if (unique.length === 0) {
//       this.log.warn(`No active client emails found for clientCode=${code}`);
//     }

//     return unique;
//   }

//   /**
//    * Optional helper if you later want to fetch "lab team" recipients per dept.
//    * You can ignore this for now.
//    */
//   async getLabFallbackEmails(): Promise<string[]> {
//     const to =
//       process.env.LAB_NOTIFY_TO ||
//       process.env.MAIL_TO_FALLBACK ||
//       'tech@omegabiochemlab.com';

//     return to
//       .split(',')
//       .map((s) => s.trim().toLowerCase())
//       .filter((e) => !!e && e.includes('@'));
//   }
// }


// apps/api/src/mail/notification-recipients.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UserRole, ClientNotifyMode } from '@prisma/client';

@Injectable()
export class NotificationRecipientsService {
  private readonly log = new Logger(NotificationRecipientsService.name);
  constructor(private readonly prisma: PrismaService) {}

  private normalize(list: string[]) {
    const emails = list
      .map((e) => (e ?? '').trim().toLowerCase())
      .filter((e) => !!e && e.includes('@'));
    return [...new Set(emails)];
  }

  private async getUserEmails(clientCode: string) {
    const rows = await this.prisma.user.findMany({
      where: {
        clientCode,
        role: UserRole.CLIENT,
        active: true,
        email: { not: '' },
        // optional if you later enforce it:
        // emailNotificationsEnabled: true,
      },
      select: { email: true },
    });
    return this.normalize(rows.map((r) => r.email ?? ''));
  }

  private async getCustomEmails(clientCode: string) {
    const rows = await this.prisma.clientNotificationEmail.findMany({
      where: { clientCode, active: true },
      select: { email: true },
    });
    return this.normalize(rows.map((r) => r.email ?? ''));
  }

  async getClientNotificationEmails(clientCode: string): Promise<string[]> {
    const code = (clientCode ?? '').trim();
    if (!code) return [];

    const cfg = await this.prisma.clientNotificationConfig.findUnique({
      where: { clientCode: code },
      select: { mode: true },
    });

    const mode: ClientNotifyMode = cfg?.mode ?? 'USERS_PLUS_CUSTOM';

    const [users, custom] = await Promise.all([
      mode === 'CUSTOM_ONLY' ? Promise.resolve([]) : this.getUserEmails(code),
      mode === 'USERS_ONLY' ? Promise.resolve([]) : this.getCustomEmails(code),
    ]);

    const merged =
      mode === 'CUSTOM_ONLY'
        ? custom
        : mode === 'USERS_ONLY'
          ? users
          : [...users, ...custom];

    const finalList = this.normalize(merged);

    if (finalList.length === 0) {
      this.log.warn(`No notification recipients for clientCode=${code} mode=${mode}`);
    }
    return finalList;
  }
}
