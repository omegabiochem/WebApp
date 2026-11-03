import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateMessageDto } from './create-message.dto';
import { UserRole } from '@prisma/client';
import {
  messageVisibility,
  mentionUserWhere,
  clientEscalationRoles,
  labSenderAudience,
  forwardUserWhere,
  forwardAudience,
  LAB_ROLES,
} from './message-visibility';
import { MessageNotificationsService } from 'src/notifications/message-notifications.service';

type JwtUser = {
  sub?: string;
  userId?: string;
  role: UserRole;
  authMode?: 'NORMAL' | 'COMMON' | 'M2M';
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

// New forwards carry immutable text/note snapshots. Legacy forwards are split only
// when the source matches exactly; ambiguous combined text stays unhighlighted.
function forwardedParts(
  body: string,
  sourceBody: string | undefined,
  snapshot?: { forwardNote?: string | null; forwardedText?: string | null },
) {
  if (typeof snapshot?.forwardedText === 'string') {
    return {
      forwardNote: snapshot.forwardNote || null,
      forwardedText: snapshot.forwardedText,
    };
  }
  if (sourceBody === undefined)
    return { forwardNote: body || null, forwardedText: null };
  if (!sourceBody) return { forwardNote: body || null, forwardedText: '' };
  if (body === sourceBody) return { forwardNote: null, forwardedText: body };
  const suffix = `\n\n${sourceBody}`;
  if (body.endsWith(suffix))
    return {
      forwardNote: body.slice(0, -suffix.length) || null,
      forwardedText: body.slice(-sourceBody.length),
    };
  return { forwardNote: body || null, forwardedText: null };
}

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private readonly messageNotifications: MessageNotificationsService,
  ) {}

  async mentionUsers(
    user: JwtUser,
    requestedCode?: string,
    forwarding = false,
  ) {
    const id = user.userId ?? user.sub;
    if (!id) throw new ForbiddenException('Auth userId missing');
    const actor = await this.prisma.user.findUnique({ where: { id } });
    if (!actor?.active) throw new ForbiddenException('Account unavailable');
    const effectiveRole = user.authMode === 'COMMON' ? user.role : actor.role;
    const labRoles: UserRole[] = [
      'MICRO',
      'CHEMISTRY',
      'MC',
      'QA',
      'FRONTDESK',
      'ADMIN',
      'SYSTEMADMIN',
    ];
    if (effectiveRole !== 'CLIENT' && !labRoles.includes(effectiveRole))
      throw new ForbiddenException('Not allowed');
    const clientCode =
      effectiveRole === 'CLIENT' ? actor.clientCode : requestedCode;
    if (!clientCode) throw new ForbiddenException('clientCode required');
    const users = await this.prisma.user.findMany({
      where: {
        ...(forwarding
          ? forwardUserWhere(clientCode)
          : mentionUserWhere(effectiveRole, clientCode)),
        ...(forwarding ? { id: { not: id } } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    return { users };
  }

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
      select: {
        name: true,
        email: true,
        role: true,
        clientCode: true,
        active: true,
      },
    });

    if (!sender?.active) throw new ForbiddenException('Account unavailable');
    user = {
      ...user,
      role: user.authMode === 'COMMON' ? user.role : sender.role,
      clientCode: sender.clientCode,
    };

    const senderName =
      (sender?.name ?? '').trim() || (sender?.email ?? '').trim() || null;

    let clientCode: string | undefined;

    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Client code missing');
      clientCode = user.clientCode;
    } else {
      if (!dto.clientCode)
        throw new ForbiddenException('clientCode required for lab users');
      clientCode = dto.clientCode;
    }

    if (user.role !== 'CLIENT' && !LAB_ROLES.includes(user.role))
      throw new ForbiddenException('Not allowed');
    const forwarding = Boolean(dto.forwardedFromMessageId);
    if (!forwarding && dto.forwardToRoles?.length)
      throw new ForbiddenException('Forward source required');
    if (forwarding && (dto.replyToMessageId || dto.attachments)) {
      throw new ForbiddenException(
        'Forward source content is copied by the server; replies and new attachments cannot be combined',
      );
    }
    const eligible = await this.mentionUsers(user, clientCode, forwarding);
    const requested = [...new Set(dto.mentionedUserIds ?? [])];
    if (requested.some((id) => !eligible.users.some((u) => u.id === id)))
      throw new ForbiddenException(
        'Mentioned user is unavailable for this conversation',
      );
    const mentionedUserIds = requested;
    const isDirect = forwarding || mentionedUserIds.length > 0;
    const selectedRoles = eligible.users
      .filter((u) => requested.includes(u.id))
      .map((u) => u.role);
    const forwardRoles = [...new Set(dto.forwardToRoles ?? [])];
    if (
      forwarding &&
      ((!forwardRoles.length && !requested.length) ||
        forwardRoles.some((role) => !LAB_ROLES.includes(role)))
    ) {
      throw new ForbiddenException('Select at least one person or lab role');
    }
    const selectedUsers = eligible.users.filter((person) =>
      requested.includes(person.id),
    );
    const labOnly =
      forwarding && !selectedUsers.some((person) => person.role === 'CLIENT');
    const labAudienceRoles = forwarding
      ? forwardAudience(user.role, selectedUsers, forwardRoles)
      : user.role === 'CLIENT'
        ? clientEscalationRoles(selectedRoles)
        : labSenderAudience(user.role);
    const source = forwarding
      ? await this.prisma.message.findFirst({
          where: {
            id: dto.forwardedFromMessageId,
            thread: {
              clientCode,
              reportId: dto.reportId ?? null,
              chemistryId: dto.chemistryId ?? null,
            },
            AND: [messageVisibility(user.role, senderId)],
          },
        })
      : null;
    if (forwarding && !source)
      throw new ForbiddenException(
        'Forward source unavailable in this conversation',
      );

    const thread = await this.getOrCreateThread({
      clientCode,
      reportId: dto.reportId,
      chemistryId: dto.chemistryId,
    });

    let replyToMessageId: string | null = dto.replyToMessageId ?? null;

    if (replyToMessageId) {
      const target = await this.prisma.message.findUnique({
        where: { id: replyToMessageId },
        select: {
          id: true,
          threadId: true,
          isDirect: true,
          senderId: true,
          mentionedUserIds: true,
          deletedAt: true,
        },
      });

      if (!target) {
        throw new ForbiddenException('Reply target not found');
      }

      const visibleTarget = await this.prisma.message.findFirst({
        where: {
          id: replyToMessageId,
          AND: [messageVisibility(user.role, senderId)],
        },
      });
      if (!visibleTarget)
        throw new ForbiddenException('Reply target unavailable');
      // Visibility of quoted parents is checked separately for every viewer below.
      if (target.threadId !== thread.id) {
        throw new ForbiddenException('Reply must belong to the same thread');
      }
    }

    const note = String(dto.body ?? '').trim();
    const cleanBody = source
      ? [note, source.body].filter(Boolean).join('\n\n')
      : note;
    const outgoingAttachments = source ? source.attachments : dto.attachments;
    const hasAttachments =
      Array.isArray(outgoingAttachments) && outgoingAttachments.length > 0;

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
        mentions: labAudienceRoles,
        mentionedUserIds,
        isDirect,
        ...(source
          ? source.attachments === null
            ? {}
            : {
                attachments:
                  source.attachments as import('@prisma/client').Prisma.InputJsonValue,
              }
          : { attachments: dto.attachments }),
        forwardedFromMessageId: source?.id ?? null,
        ...(source
          ? { forwardNote: note || null, forwardedText: source.body }
          : {}),
        replyToMessageId,
      },
    });

    await this.messageNotifications.onMessageCreated({
      mentionedUserIds,
      isDirect,
      labAudienceRoles,
      labOnly,
      isForward: forwarding,
      messageId: created.id,
      threadId: thread.id,
      senderId,
      senderRole: user.role,
      senderName,
      clientCode,
      body: created.body,
      mentions: labAudienceRoles,
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
    viewerUserId: string;
  }) {
    if (!args.clientCode) throw new ForbiddenException('clientCode required');

    const messageWhere = messageVisibility(args.viewerRole, args.viewerUserId);

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
            senderId: true,
            mentionedUserIds: true,
            mentions: true,
            isDirect: true,
            forwardedFromMessageId: true,
            forwardNote: true,
            forwardedText: true,
            body: true,
            senderRole: true,
            senderName: true, // ✅
            createdAt: true,
            attachments: true,
            replyToMessageId: true, // ✅
            replyTo: {
              select: {
                id: true,
                senderId: true,
                isDirect: true,
                mentionedUserIds: true,
                deletedAt: true,
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

    if (!thread) return { messages: [] };
    // Resolve only recipient IDs belonging to messages this viewer may read.
    // Disabled accounts remain identifiable in message history.
    const recipientIds = [
      ...new Set(
        thread.messages.flatMap((message) => message.mentionedUserIds),
      ),
    ];
    const recipients = recipientIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: recipientIds },
            OR: [
              { role: 'CLIENT', clientCode: args.clientCode },
              { role: { in: LAB_ROLES } },
            ],
          },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const recipientById = new Map(
      recipients.map((person) => [person.id, person]),
    );
    const forwardIds = [
      ...new Set(
        thread.messages
          .filter((m) => m.forwardedText == null)
          .map((m) => m.forwardedFromMessageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const forwardSources = forwardIds.length
      ? await this.prisma.message.findMany({
          where: { id: { in: forwardIds }, threadId: thread.id },
          select: { id: true, body: true },
        })
      : [];
    const forwardSourceById = new Map(
      forwardSources.map((source) => [source.id, source.body]),
    );
    const parentIds = [
      ...new Set(
        thread.messages
          .map((m) => m.replyTo?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const visibleParents = parentIds.length
      ? await this.prisma.message.findMany({
          where: { id: { in: parentIds }, AND: [messageWhere] },
          select: { id: true },
        })
      : [];
    const visibleParentIds = new Set(visibleParents.map((parent) => parent.id));
    return {
      ...thread,
      messages: thread.messages.map((m) => {
        const parent = m.replyTo;
        return {
          ...m,
          isOwn: m.senderId === args.viewerUserId,
          ...(m.forwardedFromMessageId
            ? forwardedParts(
                m.body,
                forwardSourceById.get(m.forwardedFromMessageId),
                m,
              )
            : {}),
          taggedRecipients: m.mentionedUserIds.map((id) => {
            const person = recipientById.get(id);
            return {
              id,
              name: person?.name?.trim() || person?.email || 'Unavailable user',
              email: person?.email ?? null,
              role: person?.role ?? null,
            };
          }),
          labAudienceRoles:
            m.forwardedFromMessageId || m.senderRole === 'CLIENT'
              ? m.mentions
              : labSenderAudience(m.senderRole),
          replyTo:
            parent && visibleParentIds.has(parent.id)
              ? {
                  id: parent.id,
                  body: parent.body,
                  senderRole: parent.senderRole,
                  senderName: parent.senderName,
                  createdAt: parent.createdAt,
                }
              : null,
        };
      }),
    };
  }

  async getLabInbox(viewerRole: UserRole, viewerUserId: string) {
    const visibleMessageFilter = messageVisibility(viewerRole, viewerUserId);

    // 1) Enumerate client accounts independently of their individual users' names.
    const clientUsers = await this.prisma.user.findMany({
      where: { role: 'CLIENT', clientCode: { not: null } },
      select: { clientCode: true, email: true },
      orderBy: { clientCode: 'asc' },
    });

    // Deduplicate by clientCode
    const clientMap = new Map<string, { email?: string | null }>();
    for (const u of clientUsers) {
      if (!u.clientCode) continue;
      if (!clientMap.has(u.clientCode)) {
        clientMap.set(u.clientCode, {
          email: u.email ?? null,
        });
      }
    }
    const clientCodes = Array.from(clientMap.keys());

    if (clientCodes.length === 0) return [];

    // Header names come from the company record, never from User.name.
    const companies = await this.prisma.clientDetails.findMany({
      where: { clientCode: { in: clientCodes } },
      select: { clientCode: true, name: true, legalName: true },
    });
    const companyNames = new Map(
      companies.map((company) => [
        company.clientCode,
        company.name?.trim() || company.legalName?.trim() || null,
      ]),
    );

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
                senderId: { not: viewerUserId },
              } as any,
            })
          : 0;

        const info = clientMap.get(clientCode);

        return {
          id: t?.id ?? null,
          clientCode,
          clientName: companyNames.get(clientCode) ?? null,
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
            where: messageVisibility(user.role, viewerUserId),
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
              AND: [messageVisibility(user.role, viewerUserId)],
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
      select: { id: true, senderId: true, forwardedFromMessageId: true },
    });
    if (!msg) throw new ForbiddenException('Message not found');
    if (msg.forwardedFromMessageId)
      throw new ForbiddenException(
        'Forwarded copies cannot be edited; send a new forward',
      );

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
