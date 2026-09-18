import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import {
  SupportTicketActivityType,
  SupportTicketCategory,
  SupportTicketStatus,
  UserRole,
} from '@prisma/client';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
  } as const;

  async createTicket(args: {
    userId: string;
    userAgent?: string;
    dto: CreateSupportTicketDto;
  }) {
    const { userId, userAgent, dto } = args;

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          createdById: userId,
          category: dto.category as any,
          reportId: dto.reportId ?? null,
          reportType: dto.reportType ?? null,
          description: dto.description.trim(),
          clientTime: dto.clientTime ?? null,
          userAgent: userAgent ?? null,
          meta: dto.meta ?? undefined,
        },
      });

      await tx.supportTicketActivity.create({
        data: {
          ticketId: created.id,
          actorId: userId,
          type: SupportTicketActivityType.CREATED,
          message: 'Support ticket created.',
        },
      });

      return created;
    });

    return {
      id: ticket.id,
      status: ticket.status,
    };
  }

  async listTickets(args: {
    q?: string;
    category?: SupportTicketCategory;
    status?: SupportTicketStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(args.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(10, Number(args.pageSize ?? 20)),
    );

    const skip = (page - 1) * pageSize;

    /*
     * baseWhere does NOT include status.
     *
     * This allows the summary cards to continue showing
     * OPEN / IN_PROGRESS / RESOLVED / CLOSED totals even
     * when one particular status filter is selected.
     */
    const baseWhere: any = {};

    if (args.category) {
      baseWhere.category = args.category;
    }

    if (args.q?.trim()) {
      const q = args.q.trim();

      baseWhere.OR = [
        {
          id: {
            contains: q,
            mode: 'insensitive',
          },
        },

        {
          reportId: {
            contains: q,
            mode: 'insensitive',
          },
        },

        {
          reportType: {
            contains: q,
            mode: 'insensitive',
          },
        },

        {
          description: {
            contains: q,
            mode: 'insensitive',
          },
        },

        {
          createdBy: {
            email: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },

        {
          createdBy: {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },

        {
          assignedTo: {
            email: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },

        {
          assignedTo: {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const where: any = {
      ...baseWhere,
    };

    if (args.status) {
      where.status = args.status;
    }

    const [
      items,
      total,
      openCount,
      inProgressCount,
      resolvedCount,
      closedCount,
    ] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        skip,
        take: pageSize,

        include: {
          createdBy: {
            select: this.userSelect,
          },

          assignedTo: {
            select: this.userSelect,
          },
        },
      }),

      this.prisma.supportTicket.count({
        where,
      }),

      this.prisma.supportTicket.count({
        where: {
          ...baseWhere,
          status: SupportTicketStatus.OPEN,
        },
      }),

      this.prisma.supportTicket.count({
        where: {
          ...baseWhere,
          status: SupportTicketStatus.IN_PROGRESS,
        },
      }),

      this.prisma.supportTicket.count({
        where: {
          ...baseWhere,
          status: SupportTicketStatus.RESOLVED,
        },
      }),

      this.prisma.supportTicket.count({
        where: {
          ...baseWhere,
          status: SupportTicketStatus.CLOSED,
        },
      }),
    ]);

    return {
      items,

      total,

      page,

      pageSize,

      totalPages: Math.max(1, Math.ceil(total / pageSize)),

      counts: {
        OPEN: openCount,
        IN_PROGRESS: inProgressCount,
        RESOLVED: resolvedCount,
        CLOSED: closedCount,
      },
    };
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: {
        id,
      },

      include: {
        createdBy: {
          select: this.userSelect,
        },

        assignedTo: {
          select: this.userSelect,
        },

        activities: {
          orderBy: {
            createdAt: 'desc',
          },

          include: {
            actor: {
              select: this.userSelect,
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async listAssignees() {
    return this.prisma.user.findMany({
      where: {
        active: true,

        role: {
          in: [
            UserRole.ADMIN,
            UserRole.SYSTEMADMIN,
          ],
        },
      },

      orderBy: [
        {
          role: 'asc',
        },
        {
          name: 'asc',
        },
        {
          email: 'asc',
        },
      ],

      select: this.userSelect,
    });
  }

  async updateStatus(args: {
    id: string;
    status: SupportTicketStatus;
    actorId: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({
        where: {
          id: args.id,
        },

        select: {
          id: true,
          status: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Ticket not found');
      }

      if (current.status === args.status) {
        return;
      }

      await tx.supportTicket.update({
        where: {
          id: args.id,
        },

        data: {
          status: args.status,
        },
      });

      await tx.supportTicketActivity.create({
        data: {
          ticketId: args.id,
          actorId: args.actorId,

          type: SupportTicketActivityType.STATUS_CHANGED,

          fromStatus: current.status,
          toStatus: args.status,

          message: `Status changed from ${current.status} to ${args.status}.`,
        },
      });
    });

    return this.getTicket(args.id);
  }

  async assignTicket(args: {
    id: string;
    assignedToId: string | null;
    actorId: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: {
          id: args.id,
        },

        select: {
          id: true,
          assignedToId: true,
        },
      });

      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }

      let assignee:
        | {
            id: string;
            name: string | null;
            email: string;
            role: UserRole;
          }
        | null = null;

      if (args.assignedToId) {
        assignee = await tx.user.findFirst({
          where: {
            id: args.assignedToId,
            active: true,

            role: {
              in: [
                UserRole.ADMIN,
                UserRole.SYSTEMADMIN,
              ],
            },
          },

          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });

        if (!assignee) {
          throw new BadRequestException(
            'Assignee must be an active ADMIN or SYSTEMADMIN user',
          );
        }
      }

      if (ticket.assignedToId === (assignee?.id ?? null)) {
        return;
      }

      await tx.supportTicket.update({
        where: {
          id: args.id,
        },

        data: {
          assignedToId: assignee?.id ?? null,
        },
      });

      await tx.supportTicketActivity.create({
        data: {
          ticketId: args.id,
          actorId: args.actorId,

          type: assignee
            ? SupportTicketActivityType.ASSIGNED
            : SupportTicketActivityType.UNASSIGNED,

          assignedToId: assignee?.id ?? null,

          assignedToName: assignee
            ? assignee.name?.trim() || assignee.email
            : null,

          message: assignee
            ? `Ticket assigned to ${
                assignee.name?.trim() || assignee.email
              }.`
            : 'Ticket unassigned.',
        },
      });
    });

    return this.getTicket(args.id);
  }

  async addNote(args: {
    id: string;
    actorId: string;
    message: string;
  }) {
    const message = String(args.message ?? '').trim();

    if (!message) {
      throw new BadRequestException('Note is required');
    }

    const exists = await this.prisma.supportTicket.findUnique({
      where: {
        id: args.id,
      },

      select: {
        id: true,
      },
    });

    if (!exists) {
      throw new NotFoundException('Ticket not found');
    }

    await this.prisma.supportTicketActivity.create({
      data: {
        ticketId: args.id,
        actorId: args.actorId,
        type: SupportTicketActivityType.NOTE,
        message,
      },
    });

    return this.getTicket(args.id);
  }
}