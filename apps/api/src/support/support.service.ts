import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { SupportTicketCategory, SupportTicketStatus } from '@prisma/client';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(args: {
    userId: string;
    userAgent?: string;
    dto: CreateSupportTicketDto;
  }) {
    const { userId, userAgent, dto } = args;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        createdById: userId, // IMPORTANT
        category: dto.category as any,
        reportId: dto.reportId ?? null,
        reportType: dto.reportType ?? null,
        description: dto.description,
        clientTime: dto.clientTime ?? null,
        userAgent: userAgent ?? null,
        meta: dto.meta ?? undefined,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // (optional) email logic here...

    return { id: ticket.id };
  }

  async listTickets(args: {
    q?: string;
    category?: SupportTicketCategory;
    status?: SupportTicketStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(10, args.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (args.category) where.category = args.category;
    if (args.status) where.status = args.status;

    if (args.q?.trim()) {
      const q = args.q.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { reportId: { contains: q, mode: 'insensitive' } },
        { reportType: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { createdBy: { email: { contains: q, mode: 'insensitive' } } },
        { createdBy: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          assignedTo: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getTicket(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!t) throw new Error('Ticket not found');
    return t;
  }

  async updateStatus(args: {
    id: string;
    status: SupportTicketStatus;
    actorId: string;
  }) {
    return this.prisma.supportTicket.update({
      where: { id: args.id },
      data: { status: args.status },
    });
  }

  async assignTicket(args: {
    id: string;
    assignedToId: string | null;
    actorId: string;
  }) {
    return this.prisma.supportTicket.update({
      where: { id: args.id },
      data: { assignedToId: args.assignedToId },
    });
  }
}
