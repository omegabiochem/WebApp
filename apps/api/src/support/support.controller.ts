import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @UseGuards(JwtAuthGuard)
  @Post('tickets')
  async create(@Req() req: Request, @Body() dto: CreateSupportTicketDto) {
    const user = (req as any).user; // adjust if different
    const userAgent = req.headers['user-agent'] as string | undefined;

    return this.support.createTicket({
      userId: user.id,
      userAgent,
      dto,
    });
  }
}
