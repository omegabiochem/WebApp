import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  CreateSupportTicketDto,
  SupportTicketCategory,
} from './dto/create-support-ticket.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private routeEmail(category: SupportTicketCategory) {
    if (
      category === SupportTicketCategory.REPORTS_WORKFLOW ||
      category === SupportTicketCategory.LOGIN_ACCESS
    )
      return process.env.LAB_SUPPORT_EMAIL;

    return process.env.TECH_SUPPORT_EMAIL;
  }

  async createTicket(args: {
    userId: string;
    userAgent?: string;
    dto: CreateSupportTicketDto;
  }) {
    const { userId, userAgent, dto } = args;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        createdById: userId,
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
      },
    });

    const to = this.routeEmail(dto.category);
    if (to) {
      await this.mail.sendSupportTicketEmail({
        to,
        ticketId: ticket.id,
        category: ticket.category,
        createdBy: ticket.createdBy?.email ?? 'unknown',
        description: ticket.description,
        reportId: ticket.reportId ?? undefined,
        reportType: ticket.reportType ?? undefined,
      });
    }

    return { id: ticket.id };
  }
}
