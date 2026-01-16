import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateMessageDto } from './create-message.dto';
import { UserRole } from '@prisma/client';

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
};

// ✅ NEW DTO shape returned to frontend
type InboxThreadDto = {
  id: string;
  clientCode: string;
  lastMessage: InboxLastMessage | null;
  unreadCount: number;
};

const PRIVILEGED: UserRole[] = ['ADMIN', 'QA', 'SYSTEMADMIN'];

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderId,
        senderRole: user.role,
        senderName: user.uid ?? null,
        body: dto.body,
        mentions: dto.mentions ?? [],
        attachments: dto.attachments,
      },
    });
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

    const canSeeAll =
      viewerRole === 'CLIENT' || PRIVILEGED.includes(viewerRole);

    const messageWhere = canSeeAll
      ? undefined
      : {
          OR: [
            // anything explicitly tagged to this role
            { mentions: { has: viewerRole } },

            // messages sent by me (so I can see what I sent)
            { senderRole: viewerRole },

            // allow ADMIN/QA broadcasts to be visible to all lab roles (optional)
            // if you DON'T want this, remove this block
            { senderRole: { in: ['ADMIN', 'QA', 'SYSTEMADMIN'] } },
          ],
        };

    const thread = await this.prisma.messageThread.findFirst({
      where: {
        clientCode: args.clientCode,
        reportId: args.reportId ?? null,
        chemistryId: args.chemistryId ?? null,
      },
      include: {
        messages: {
          where: messageWhere as any,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return thread ?? { messages: [] };
  }

  // ✅ NEW: inbox is filtered by what the viewer can see

  async getLabInbox(viewerRole: UserRole, viewerUserId: string) {
    const canSeeAll = PRIVILEGED.includes(viewerRole);

    const visibleMessageFilter = canSeeAll
      ? undefined
      : {
          OR: [
            { mentions: { has: viewerRole } },
            { senderRole: viewerRole },
            { senderRole: { in: ['ADMIN', 'QA', 'SYSTEMADMIN'] } },
          ],
        };

    // 1) fetch threads + last message (for preview)
    const threads = await this.prisma.messageThread.findMany({
      where: {
        ...(visibleMessageFilter
          ? { messages: { some: visibleMessageFilter as any } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
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
          },
        },
        // get lastReadAt for this viewer
        reads: {
          where: { userId: viewerUserId },
          take: 1,
          select: { lastReadAt: true },
        },
      },
    });

    // 2) for each thread compute unread count (real count)
    // Note: we will count only CLIENT messages by default.
    const result: InboxThreadDto[] = await Promise.all(
      threads.map(async (t) => {
        const lastReadAt = t.reads?.[0]?.lastReadAt ?? new Date(0);

        const unreadCount = await this.prisma.message.count({
          where: {
            threadId: t.id,
            ...(visibleMessageFilter ? (visibleMessageFilter as any) : {}),
            createdAt: { gt: lastReadAt },
            senderRole: 'CLIENT', // ✅ recommended
          } as any,
        });

        return {
          id: t.id,
          clientCode: t.clientCode,
          lastMessage: t.messages?.[0] ?? null,
          unreadCount,
        };
      }),
    );

    // 3) sort by latest message time (not updatedAt) to ensure correct ordering
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
            select: { id: true, body: true, createdAt: true, senderRole: true },
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
}
