import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationService } from './inAppNotifications/notification.service';
import { NotificationRecipientsService } from '../mail/notification-recipients.service';

type NotifyMessageArgs = {
  messageId: string;
  threadId: string;
  senderId: string;
  senderRole: UserRole;
  senderName?: string | null;
  clientCode: string;
  body: string;
  mentions?: UserRole[];
  mentionedUserIds?: string[];
  isDirect?: boolean;
  labAudienceRoles: UserRole[];
  labOnly?: boolean;
  isForward?: boolean;
  reportId?: string | null;
  chemistryId?: string | null;
};

function normalizeEmails(emails: string[]) {
  return [
    ...new Set(
      emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean),
    ),
  ].sort();
}

function shorten(text: string, max = 140) {
  const s = String(text ?? '').trim();
  if (!s) return 'New message';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

@Injectable()
export class MessageNotificationsService {
  private readonly log = new Logger(MessageNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inAppNotifications: NotificationService,
    private readonly notificationRecipients: NotificationRecipientsService,
  ) {}

  private buildMessageUrl(args: {
    clientCode: string;
    reportId?: string | null;
    chemistryId?: string | null;
  }) {
    const qp = new URLSearchParams();
    qp.set('tab', 'messages');
    qp.set('clientCode', args.clientCode);

    if (args.reportId) qp.set('reportId', args.reportId);
    if (args.chemistryId) qp.set('chemistryId', args.chemistryId);

    return `/results?${qp.toString()}`;
  }

  async onMessageCreated(args: NotifyMessageArgs) {
    const preview = shorten(args.body || 'Attachment sent');
    const actionUrl = this.buildMessageUrl({
      clientCode: args.clientCode,
      reportId: args.reportId,
      chemistryId: args.chemistryId,
    });

    const clientTargets =
      !args.labOnly && (args.senderRole !== 'CLIENT' || args.isForward)
        ? args.isDirect
          ? {
              role: 'CLIENT' as const,
              clientCode: args.clientCode,
              id: { in: args.mentionedUserIds ?? [] },
            }
          : { role: 'CLIENT' as const, clientCode: args.clientCode }
        : { id: { in: [] as string[] } };
    const namedLabTargets =
      args.senderRole === 'CLIENT' || args.isForward
        ? {
            id: { in: args.mentionedUserIds ?? [] },
            role: { not: 'CLIENT' as const },
          }
        : { id: { in: [] as string[] } };
    const recipients = await this.prisma.user.findMany({
      where: {
        active: true,
        NOT: { id: args.senderId },
        OR: [
          { role: { in: args.labAudienceRoles } },
          clientTargets,
          namedLabTargets,
        ],
      },
      select: {
        id: true,
        email: true,
        role: true,
        emailNotificationsEnabled: true,
      },
    });
    // Use user-scoped notifications: this persists the row AND emits notification:new.
    // Putting clientCode/role on the notification row would broaden its read access.
    const meta = {
      messageId: args.messageId,
      threadId: args.threadId,
      clientCode: args.clientCode,
      senderId: args.senderId,
      senderRole: args.senderRole,
      senderName: args.senderName ?? null,
      mentions: args.labAudienceRoles,
      mentionedUserIds: args.mentionedUserIds ?? [],
      isDirect: Boolean(args.isDirect),
      labOnly: Boolean(args.labOnly),
      isForward: Boolean(args.isForward),
      reportId: args.reportId ?? null,
      chemistryId: args.chemistryId ?? null,
    };
    for (const user of recipients) {
      await this.inAppNotifications.createForUser({
        userId: user.id,
        kind: 'MESSAGE',
        severity: 'INFO',
        title: `${args.senderName || args.senderRole} ${args.isForward || args.labOnly ? 'forwarded a message' : 'sent a message'}`,
        body: preview,
        entityType: 'MESSAGE_THREAD',
        entityId: args.threadId,
        reportUrl: actionUrl,
        meta,
      });
    }

    // Existing email preferences apply to account recipients. In-app delivery is independent.
    const delivery = new Map<string, 'LAB' | 'CLIENT'>();
    for (const user of recipients) {
      if (!user.emailNotificationsEnabled) continue;
      for (const email of normalizeEmails([user.email])) {
        delivery.set(email, user.role === 'CLIENT' ? 'CLIENT' : 'LAB');
      }
    }

    // Preserve configured client emails only for a general lab -> client broadcast.
    // Named-recipient messages and lab-only forwards must never include this list.
    if (!args.labOnly && !args.isDirect && args.senderRole !== 'CLIENT') {
      const configured =
        await this.notificationRecipients.getClientNotificationEmails(
          args.clientCode,
        );
      const sender = await this.prisma.user.findUnique({
        where: { id: args.senderId },
        select: { email: true },
      });
      const senderEmails = new Set(normalizeEmails([sender?.email ?? '']));
      for (const email of normalizeEmails(configured)) {
        if (!senderEmails.has(email) && !delivery.has(email))
          delivery.set(email, 'CLIENT');
      }
    }

    // One recipient per row keeps recipient email addresses private and avoids duplicates.
    for (const [email, scope] of delivery) {
      await this.enqueueMessageDigest({
        scope,
        dept: args.labOnly ? 'FORWARD' : args.isDirect ? 'DIRECT' : 'MESSAGE',
        clientCode: args.clientCode,
        recipients: [email],
        threadId: args.threadId,
        messageId: args.messageId,
        senderId: args.senderId,
        senderRole: args.senderRole,
        senderName: args.senderName,
        preview,
        actionUrl,
        reportId: args.reportId,
        chemistryId: args.chemistryId,
      });
    }
    this.log.log(
      `Message notifications delivered: message=${args.messageId}, inApp=${recipients.length}, emailQueued=${delivery.size}, labOnly=${Boolean(args.labOnly)}`,
    );
  }

  private async enqueueMessageDigest(args: {
    scope: 'LAB' | 'CLIENT';
    dept?: string | null;
    clientCode?: string | null;
    recipients: string[];
    threadId: string;
    messageId: string;
    senderId?: string | null;
    senderRole: UserRole;
    senderName?: string | null;
    preview: string;
    actionUrl?: string | null;
    reportId?: string | null;
    chemistryId?: string | null;
  }) {
    const recipients = normalizeEmails(args.recipients);
    if (recipients.length === 0) return;

    await this.prisma.messageNotificationOutbox.create({
      data: {
        scope: args.scope,
        dept: args.dept ?? null,
        clientCode: args.clientCode ?? null,
        recipientsKey: JSON.stringify(recipients),

        threadId: args.threadId,
        messageId: args.messageId,
        senderId: args.senderId ?? null,
        senderRole: args.senderRole,
        senderName: args.senderName ?? null,
        preview: args.preview,
        actionUrl: args.actionUrl ?? null,

        reportId: args.reportId ?? null,
        chemistryId: args.chemistryId ?? null,
      },
    });
  }
}

// import { Injectable, Logger } from '@nestjs/common';
// import { UserRole } from '@prisma/client';
// import { PrismaService } from 'prisma/prisma.service';
// import { MailService } from '../mail/mail.service';
// import { NotificationRecipientsService } from '../mail/notification-recipients.service';
// import { NotificationService } from '../notifications/inAppNotifications/notification.service';

// type NotifyMessageArgs = {
//   messageId: string;
//   threadId: string;
//   senderId: string;
//   senderRole: UserRole;
//   senderName?: string | null;
//   clientCode: string;
//   body: string;
//   mentions?: UserRole[];
//   mentionedUserIds?: string[];
//   isDirect?: boolean;
//   reportId?: string | null;
//   chemistryId?: string | null;
// };

// function uniqueRoles(roles: UserRole[]) {
//   return [...new Set(roles)].filter(Boolean);
// }

// function normalizeEmails(emails: string[]) {
//   return [
//     ...new Set(
//       emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean),
//     ),
//   ].sort();
// }

// function shorten(text: string, max = 140) {
//   const s = String(text ?? '').trim();
//   if (!s) return 'New message';
//   return s.length > max ? `${s.slice(0, max)}…` : s;
// }

// function expandLabTargetRoles(baseRoles: UserRole[]) {
//   const set = new Set<UserRole>();

//   const hasFrontdesk = baseRoles.includes('FRONTDESK');
//   const hasMicro = baseRoles.includes('MICRO');
//   const hasChemistry = baseRoles.includes('CHEMISTRY');

//   if (hasFrontdesk) {
//     set.add('FRONTDESK');
//   }

//   if (hasMicro) {
//     set.add('MICRO');
//     set.add('MC');
//   }

//   if (hasChemistry) {
//     set.add('CHEMISTRY');
//     set.add('MC');
//   }

//   // always included for all client -> lab messages
//   set.add('ADMIN');
//   set.add('SYSTEMADMIN');
//   set.add('QA');

//   return [...set];
// }

// @Injectable()
// export class MessageNotificationsService {
//   private readonly log = new Logger(MessageNotificationsService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly mail: MailService,
//     private readonly recipients: NotificationRecipientsService,
//     private readonly inAppNotifications: NotificationService,
//   ) {}

//   private buildMessageUrl(args: {
//     clientCode: string;
//     reportId?: string | null;
//     chemistryId?: string | null;
//   }) {
//     const qp = new URLSearchParams();
//     qp.set('tab', 'messages');
//     qp.set('clientCode', args.clientCode);

//     if (args.reportId) qp.set('reportId', args.reportId);
//     if (args.chemistryId) qp.set('chemistryId', args.chemistryId);

//     return `/results?${qp.toString()}`;
//   }

//   private async getLabUsersForRoles(args: {
//     roles: UserRole[];
//     excludeUserId?: string;
//   }) {
//     const roles = uniqueRoles(args.roles);
//     if (roles.length === 0) return [];

//     return this.prisma.user.findMany({
//       where: {
//         active: true,
//         emailNotificationsEnabled: true,
//         role: { in: roles },
//         ...(args.excludeUserId ? { id: { not: args.excludeUserId } } : {}),
//       },
//       select: {
//         id: true,
//         email: true,
//         name: true,
//         role: true,
//       },
//     });
//   }

//   private async getClientUsers(args: {
//     clientCode: string;
//     excludeUserId?: string;
//   }) {
//     return this.prisma.user.findMany({
//       where: {
//         active: true,
//         emailNotificationsEnabled: true,
//         role: 'CLIENT',
//         clientCode: args.clientCode,
//         ...(args.excludeUserId ? { id: { not: args.excludeUserId } } : {}),
//       },
//       select: {
//         id: true,
//         email: true,
//         name: true,
//         role: true,
//       },
//     });
//   }

//   async onMessageCreated(args: NotifyMessageArgs) {
//     const preview = shorten(args.body || 'Attachment sent');
//     const actionUrl = this.buildMessageUrl({
//       clientCode: args.clientCode,
//       reportId: args.reportId,
//       chemistryId: args.chemistryId,
//     });

//     if (args.isDirect) {
//       const recipients = await this.prisma.user.findMany({
//         where: {
//           active: true,
//           id: { not: args.senderId },
//           OR: [
//             { id: { in: args.mentionedUserIds ?? [] } },
//             { role: { in: ['ADMIN', 'SYSTEMADMIN', 'QA'] } },
//           ],
//         },
//         select: {
//           id: true,
//           email: true,
//           role: true,
//           emailNotificationsEnabled: true,
//         },
//       });
//       if (recipients.length)
//         await this.prisma.notification.createMany({
//           data: recipients.map((u) => ({
//             userId: u.id,
//             kind: 'MESSAGE',
//             severity: 'INFO',
//             title: `${args.senderName || args.senderRole} sent a private message`,
//             body: preview,
//             entityType: 'MESSAGE_THREAD',
//             entityId: args.threadId,
//             reportUrl: actionUrl,
//             meta: { messageId: args.messageId, isDirect: true },
//           })),
//         });
//       // One recipient per outbox row also keeps recipient email addresses private.
//       for (const u of recipients.filter(
//         (u) => u.emailNotificationsEnabled && u.email,
//       )) {
//         await this.enqueueMessageDigest({
//           scope: u.role === 'CLIENT' ? 'CLIENT' : 'LAB',
//           dept: 'DIRECT',
//           clientCode: args.clientCode,
//           recipients: [u.email],
//           threadId: args.threadId,
//           messageId: args.messageId,
//           senderId: args.senderId,
//           senderRole: args.senderRole,
//           senderName: args.senderName,
//           preview,
//           actionUrl,
//           reportId: args.reportId,
//           chemistryId: args.chemistryId,
//         });
//       }
//       return; // Private messages never enter broad client/department notification routing.
//     }

//     // CLIENT -> LAB
//     if (args.senderRole === 'CLIENT') {
//       const baseRoles = uniqueRoles(
//         args.mentions && args.mentions.length > 0
//           ? args.mentions
//           : ['FRONTDESK'],
//       );

//       const targetRoles = expandLabTargetRoles(baseRoles);

//       const title = `Client ${args.clientCode} sent a message`;
//       const body = preview;

//       await this.inAppNotifications.createForRoles({
//         roles: targetRoles,
//         kind: 'MESSAGE',
//         severity: 'INFO',
//         title,
//         body,
//         entityType: 'MESSAGE_THREAD',
//         entityId: args.threadId,
//         reportUrl: actionUrl,
//         meta: {
//           messageId: args.messageId,
//           threadId: args.threadId,
//           clientCode: args.clientCode,
//           senderRole: args.senderRole,
//           senderName: args.senderName ?? null,
//           mentions: targetRoles,
//           reportId: args.reportId ?? null,
//           chemistryId: args.chemistryId ?? null,
//         },
//       });

//       const labUsers = await this.getLabUsersForRoles({
//         roles: targetRoles,
//         excludeUserId: args.senderId,
//       });

//       const emails = normalizeEmails(
//         labUsers.map((u) => u.email).filter(Boolean) as string[],
//       );

//       if (emails.length > 0) {
//         const digestDept =
//           baseRoles
//             .filter((r) => ['FRONTDESK', 'MICRO', 'CHEMISTRY'].includes(r))
//             .sort()
//             .join('+') || 'LAB';

//         await this.enqueueMessageDigest({
//           scope: 'LAB',
//           dept: digestDept,
//           clientCode: args.clientCode,
//           recipients: emails,
//           threadId: args.threadId,
//           messageId: args.messageId,
//           senderId: args.senderId,
//           senderRole: args.senderRole,
//           senderName: args.senderName ?? null,
//           preview,
//           actionUrl,
//           reportId: args.reportId ?? null,
//           chemistryId: args.chemistryId ?? null,
//         });

//         this.log.log(
//           `CLIENT->LAB message queued for digest to ${emails.join(', ')} for ${args.clientCode}`,
//         );
//       }

//       return;
//     }

//     // Oversight receives lab broadcasts too, independently of the client recipients.
//     await this.inAppNotifications.createForRoles({
//       roles: ['ADMIN', 'SYSTEMADMIN', 'QA'],
//       kind: 'MESSAGE',
//       severity: 'INFO',
//       title: `${args.senderRole} sent a message`,
//       body: preview,
//       entityType: 'MESSAGE_THREAD',
//       entityId: args.threadId,
//       reportUrl: actionUrl,
//       meta: { messageId: args.messageId, clientCode: args.clientCode },
//     });
//     const oversight = await this.getLabUsersForRoles({
//       roles: ['ADMIN', 'SYSTEMADMIN', 'QA'],
//       excludeUserId: args.senderId,
//     });
//     for (const u of oversight)
//       await this.enqueueMessageDigest({
//         scope: 'LAB',
//         dept: 'OVERSIGHT',
//         clientCode: args.clientCode,
//         recipients: [u.email],
//         threadId: args.threadId,
//         messageId: args.messageId,
//         senderId: args.senderId,
//         senderRole: args.senderRole,
//         senderName: args.senderName,
//         preview,
//         actionUrl,
//       });

//     // LAB -> CLIENT
//     const title = `${args.senderRole} sent a message`;
//     const body = preview;

//     await this.inAppNotifications.createForClientCode({
//       clientCode: args.clientCode,
//       kind: 'MESSAGE',
//       severity: 'INFO',
//       title,
//       body,
//       entityType: 'MESSAGE_THREAD',
//       entityId: args.threadId,
//       reportUrl: actionUrl,
//       meta: {
//         messageId: args.messageId,
//         threadId: args.threadId,
//         clientCode: args.clientCode,
//         senderRole: args.senderRole,
//         senderName: args.senderName ?? null,
//         reportId: args.reportId ?? null,
//         chemistryId: args.chemistryId ?? null,
//       },
//     });

//     const clientConfigEmails =
//       await this.recipients.getClientNotificationEmails(args.clientCode);

//     const clientUsers = await this.getClientUsers({
//       clientCode: args.clientCode,
//       excludeUserId: args.senderId,
//     });

//     const emails = normalizeEmails([
//       ...clientConfigEmails,
//       ...clientUsers.map((u) => u.email).filter(Boolean),
//     ]);

//     if (emails.length > 0) {
//       await this.enqueueMessageDigest({
//         scope: 'CLIENT',
//         dept: null,
//         clientCode: args.clientCode,
//         recipients: emails,
//         threadId: args.threadId,
//         messageId: args.messageId,
//         senderId: args.senderId,
//         senderRole: args.senderRole,
//         senderName: args.senderName ?? null,
//         preview,
//         actionUrl,
//         reportId: args.reportId ?? null,
//         chemistryId: args.chemistryId ?? null,
//       });

//       this.log.log(
//         `LAB->CLIENT message queued for digest to ${emails.join(', ')} for ${args.clientCode}`,
//       );
//     }
//   }

//   private async enqueueMessageDigest(args: {
//     scope: 'LAB' | 'CLIENT';
//     dept?: string | null;
//     clientCode?: string | null;
//     recipients: string[];
//     threadId: string;
//     messageId: string;
//     senderId?: string | null;
//     senderRole: UserRole;
//     senderName?: string | null;
//     preview: string;
//     actionUrl?: string | null;
//     reportId?: string | null;
//     chemistryId?: string | null;
//   }) {
//     const recipients = normalizeEmails(args.recipients);
//     if (recipients.length === 0) return;

//     await this.prisma.messageNotificationOutbox.create({
//       data: {
//         scope: args.scope,
//         dept: args.dept ?? null,
//         clientCode: args.clientCode ?? null,
//         recipientsKey: JSON.stringify(recipients),

//         threadId: args.threadId,
//         messageId: args.messageId,
//         senderId: args.senderId ?? null,
//         senderRole: args.senderRole,
//         senderName: args.senderName ?? null,
//         preview: args.preview,
//         actionUrl: args.actionUrl ?? null,

//         reportId: args.reportId ?? null,
//         chemistryId: args.chemistryId ?? null,
//       },
//     });
//   }
// }
