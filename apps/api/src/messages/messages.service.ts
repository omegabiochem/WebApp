import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateMessageDto } from './create-message.dto';
import { UserRole } from '@prisma/client';
import { MessageNotificationsService } from 'src/notifications/message-notifications.service';

type JwtUser = {
  sub?: string;
  userId?: string;
  role: UserRole;
  uid?: string | null;
  clientCode?: string | null;
};

type InboxLastMessage = {
  id: string;
  body: string;
  createdAt: Date;
  senderRole: UserRole;
  senderName?: string | null;
};

// ✅ NEW DTO shape returned to frontend
type InboxThreadDto = {
  id: string | null;
  clientCode: string;
  clientName: string | null;
  clientEmail: string | null;
  lastMessage: InboxLastMessage | null;
  unreadCount: number;
};

const PRIVILEGED: UserRole[] = ['ADMIN', 'QA', 'SYSTEMADMIN'];
function getVisibleRoles(viewerRole: UserRole): UserRole[] {
  if (viewerRole === 'MC') {
    return ['MC', 'MICRO', 'CHEMISTRY'];
  }
  return [viewerRole];
}

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private readonly messageNotifications: MessageNotificationsService,
  ) {}

  async getOrCreateThread(args: {
    clientCode: string;
    reportId?: string;
    chemistryId?: string;
  }) {
    const { clientCode, reportId, chemistryId } = args;

    let thread = await this.prisma.messageThread.findFirst({
      where: {
        clientCode,
        reportId: reportId ?? null,
        chemistryId: chemistryId ?? null,
      },
    });

    if (!thread) {
      thread = await this.prisma.messageThread.create({
        data: { clientCode, reportId, chemistryId },
      });
    }

    return thread;
  }

  async sendMessage(user: JwtUser, dto: CreateMessageDto) {
    const senderId = user.userId ?? user.sub;
    if (!senderId) throw new ForbiddenException('Auth userId missing');

    // ✅ get sender name once (store snapshot for audit/history)
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true, email: true },
    });

    const senderName =
      (sender?.name ?? '').trim() || (sender?.email ?? '').trim() || null;

    let clientCode: string | undefined;

    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Client code missing');
      clientCode = user.clientCode;

      // ✅ client must tag who they want to talk to
      // if nothing selected, default FRONTDESK
      if (!dto.mentions || dto.mentions.length === 0) {
        dto.mentions = ['FRONTDESK'];
      }
    } else {
      if (!dto.clientCode)
        throw new ForbiddenException('clientCode required for lab users');
      clientCode = dto.clientCode;

      // lab can send without mentions (admin/qa can broadcast)
      dto.mentions = dto.mentions ?? [];
    }

    const thread = await this.getOrCreateThread({
      clientCode,
      reportId: dto.reportId,
      chemistryId: dto.chemistryId,
    });

    let replyToMessageId: string | null = dto.replyToMessageId ?? null;

    if (replyToMessageId) {
      const target = await this.prisma.message.findUnique({
        where: { id: replyToMessageId },
        select: { id: true, threadId: true },
      });

      if (!target) {
        throw new ForbiddenException('Reply target not found');
      }

      if (target.threadId !== thread.id) {
        throw new ForbiddenException('Reply must belong to the same thread');
      }
    }

    const cleanBody = String(dto.body ?? '').trim();
    const hasAttachments =
      Array.isArray(dto.attachments) && dto.attachments.length > 0;

    if (!cleanBody && !hasAttachments) {
      throw new ForbiddenException('Message body or attachment is required');
    }

    const created = await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderId,
        senderRole: user.role,
        senderName,
        body: cleanBody,
        mentions: dto.mentions ?? [],
        attachments: dto.attachments,
        replyToMessageId,
      },
    });

    await this.messageNotifications.onMessageCreated({
      messageId: created.id,
      threadId: thread.id,
      senderId,
      senderRole: user.role,
      senderName,
      clientCode,
      body: created.body,
      mentions: dto.mentions ?? [],
      reportId: dto.reportId ?? null,
      chemistryId: dto.chemistryId ?? null,
    });

    return created;
  }

  // ✅ NEW: viewer-aware fetch
  async getThreadMessages(args: {
    clientCode: string;
    reportId?: string;
    chemistryId?: string;
    viewerRole: UserRole;
  }) {
    if (!args.clientCode) throw new ForbiddenException('clientCode required');

    const viewerRole = args.viewerRole;
    const visibleRoles = getVisibleRoles(viewerRole);

    const canSeeAll =
      viewerRole === 'CLIENT' || PRIVILEGED.includes(viewerRole);

    const messageWhere = canSeeAll
      ? undefined
      : {
          OR: [
            // anything explicitly tagged to this role set
            { mentions: { hasSome: visibleRoles } },

            // messages sent by any visible lab role
            { senderRole: { in: visibleRoles } },

            // allow ADMIN/QA broadcasts to be visible to all lab roles
            { senderRole: { in: ['ADMIN', 'QA', 'SYSTEMADMIN'] } },
          ],
        };

    // const thread = await this.prisma.messageThread.findFirst({
    //   where: {
    //     clientCode: args.clientCode,
    //     reportId: args.reportId ?? null,
    //     chemistryId: args.chemistryId ?? null,
    //   },
    //   include: {
    //     messages: {
    //       where: messageWhere as any,
    //       orderBy: { createdAt: 'asc' },
    //     },
    //   },
    // });

    const thread = await this.prisma.messageThread.findFirst({
      where: {
        clientCode: args.clientCode,
        reportId: args.reportId ?? null,
        chemistryId: args.chemistryId ?? null,
      },
      include: {
        messages: {
          where: {
            ...(messageWhere as any),
            deletedAt: null, // ✅ hide deleted from normal view
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            senderRole: true,
            senderName: true, // ✅
            createdAt: true,
            attachments: true,
            replyToMessageId: true, // ✅
            replyTo: {
              select: {
                id: true,
                body: true,
                senderRole: true,
                senderName: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return thread ?? { messages: [] };
  }

  async getLabInbox(viewerRole: UserRole, viewerUserId: string) {
    const canSeeAll = PRIVILEGED.includes(viewerRole);
    const visibleRoles = getVisibleRoles(viewerRole);

    const visibleMessageFilter = canSeeAll
      ? undefined
      : {
          OR: [
            { mentions: { hasSome: visibleRoles } },
            { senderRole: { in: visibleRoles } },
            { senderRole: { in: ['ADMIN', 'QA', 'SYSTEMADMIN'] } },
          ],
        };

    // 1) get ALL clients (one row per clientCode)
    // If you can have multiple client users per clientCode, pick “primary” name/email or first one.
    const clientUsers = await this.prisma.user.findMany({
      where: { role: 'CLIENT', clientCode: { not: null } },
      select: { clientCode: true, name: true, email: true },
      orderBy: { clientCode: 'asc' },
    });

    // Deduplicate by clientCode
    const clientMap = new Map<
      string,
      { name?: string | null; email?: string | null }
    >();
    for (const u of clientUsers) {
      if (!u.clientCode) continue;
      if (!clientMap.has(u.clientCode)) {
        clientMap.set(u.clientCode, {
          name: u.name ?? null,
          email: u.email ?? null,
        });
      }
    }
    const clientCodes = Array.from(clientMap.keys());

    if (clientCodes.length === 0) return [];

    // 2) fetch threads for those clients (even if no visible messages, thread still returned)
    const threads = await this.prisma.messageThread.findMany({
      where: { clientCode: { in: clientCodes } },
      include: {
        messages: {
          where: visibleMessageFilter as any,
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            body: true,
            createdAt: true,
            senderRole: true,
            senderName: true,
          },
        },
        reads: {
          where: { userId: viewerUserId },
          take: 1,
          select: { lastReadAt: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const threadByClient = new Map<string, (typeof threads)[number]>();
    for (const t of threads) threadByClient.set(t.clientCode, t);

    // 3) build rows for ALL clients
    const result: InboxThreadDto[] = await Promise.all(
      clientCodes.map(async (clientCode) => {
        const t = threadByClient.get(clientCode);
        const lastReadAt = t?.reads?.[0]?.lastReadAt ?? new Date(0);

        const unreadCount = t
          ? await this.prisma.message.count({
              where: {
                threadId: t.id,
                ...(visibleMessageFilter ? (visibleMessageFilter as any) : {}),
                createdAt: { gt: lastReadAt },
                senderRole: 'CLIENT',
              } as any,
            })
          : 0;

        const info = clientMap.get(clientCode);

        return {
          id: t?.id ?? null,
          clientCode,
          clientName: info?.name ?? null,
          clientEmail: info?.email ?? null,
          lastMessage: t?.messages?.[0] ?? null,
          unreadCount,
        };
      }),
    );

    // 4) sort: clients with lastMessage first, then by newest message date, then by clientCode
    result.sort((a, b) => {
      const at = a.lastMessage
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const bt = b.lastMessage
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      if (bt !== at) return bt - at;
      return a.clientCode.localeCompare(b.clientCode);
    });

    return result;
  }

  async getInbox(user: JwtUser, viewerUserId: string) {
    if (!viewerUserId) throw new ForbiddenException('Auth userId missing');

    // ----------------------------
    // CLIENT: only their threads
    // ----------------------------
    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Client code missing');

      const threads = await this.prisma.messageThread.findMany({
        where: { clientCode: user.clientCode },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              body: true,
              createdAt: true,
              senderRole: true,
              senderName: true,
            },
          },
          reads: {
            where: { userId: viewerUserId },
            take: 1,
            select: { lastReadAt: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const result = await Promise.all(
        threads.map(async (t) => {
          const lastReadAt = t.reads?.[0]?.lastReadAt ?? new Date(0);

          const unreadCount = await this.prisma.message.count({
            where: {
              threadId: t.id,
              createdAt: { gt: lastReadAt },
              senderId: { not: viewerUserId }, // not sent by me
            },
          });

          return {
            id: t.id,
            clientCode: t.clientCode,
            lastMessage: t.messages?.[0] ?? null,
            unreadCount,
          };
        }),
      );

      // sort by latest message time
      result.sort((a, b) => {
        const at = a.lastMessage
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;
        const bt = b.lastMessage
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;
        return bt - at;
      });

      return result;
    }

    // ----------------------------
    // LAB: your existing logic
    // (keep your visibleMessageFilter)
    // ----------------------------
    return this.getLabInbox(user.role, viewerUserId);
  }

  async markThreadRead(
    user: JwtUser,
    args: { clientCode: string; reportId?: string; chemistryId?: string },
  ) {
    const userId = user.userId ?? user.sub;
    if (!userId) throw new ForbiddenException('Auth userId missing');

    const thread = await this.getOrCreateThread({
      clientCode: args.clientCode,
      reportId: args.reportId,
      chemistryId: args.chemistryId,
    });

    await this.prisma.messageThreadRead.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId,
        },
      },
      create: {
        threadId: thread.id,
        userId,
        lastReadAt: new Date(),
      },
      update: {
        lastReadAt: new Date(),
      },
    });

    return { ok: true };
  }

  async editMessage(
    user: JwtUser,
    viewerUserId: string,
    messageId: string,
    newBody: string,
  ) {
    if (!viewerUserId) throw new ForbiddenException('Auth userId missing');
    if (!newBody?.trim()) throw new ForbiddenException('Body required');

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true },
    });
    if (!msg) throw new ForbiddenException('Message not found');

    const isOwner = msg.senderId === viewerUserId;
    if (!isOwner) throw new ForbiddenException('Not allowed');

    return this.prisma.message.update({
      where: { id: messageId },
      data: { body: newBody.trim() },
    });
  }

  async deleteMessage(user: JwtUser, viewerUserId: string, messageId: string) {
    if (!viewerUserId) throw new ForbiddenException('Auth userId missing');

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true },
    });
    if (!msg) throw new ForbiddenException('Message not found');

    const isOwner = msg.senderId === viewerUserId;
    if (!isOwner) throw new ForbiddenException('Not allowed');

    // simplest delete (hard delete)
    await this.prisma.message.delete({ where: { id: messageId } });

    return { ok: true };
  }

  async softDeleteMessage(user: JwtUser, messageId: string) {
    const userId = user.userId ?? user.sub;
    if (!userId) throw new ForbiddenException('Auth userId missing');

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, threadId: true, deletedAt: true },
    });

    if (!msg) throw new ForbiddenException('Message not found');

    // only sender can delete (or allow ADMIN/QA if you want)
    const canDelete =
      msg.senderId === userId ||
      ['ADMIN', 'QA', 'SYSTEMADMIN'].includes(user.role);
    if (!canDelete) throw new ForbiddenException('Not allowed');

    if (msg.deletedAt) return { ok: true };

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { ok: true };
  }

  async restoreMessage(user: JwtUser, messageId: string) {
    const userId = user.userId ?? user.sub;
    if (!userId) throw new ForbiddenException('Auth userId missing');

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, deletedAt: true, deletedBy: true },
    });
    if (!msg) throw new ForbiddenException('Message not found');

    // only the same deleter OR admin/qa
    const canRestore =
      msg.deletedBy === userId ||
      ['ADMIN', 'QA', 'SYSTEMADMIN'].includes(user.role);

    if (!canRestore) throw new ForbiddenException('Not allowed');

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: null, deletedBy: null },
    });

    return { ok: true };
  }
}
