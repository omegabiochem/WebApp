import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportTicketCategory, SupportTicketStatus } from '@prisma/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Controller('support')
export class SupportController {
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  constructor(private readonly support: SupportService) {}

  @UseGuards(JwtAuthGuard)
  @Post('tickets')
  async create(@Req() req: Request, @Body() dto: CreateSupportTicketDto) {
    const user = (req as any).user;
    const userAgent = req.headers['user-agent'] as string | undefined;

    return this.support.createTicket({
      userId: user.userId ?? user.sub,
      userAgent,
      dto,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('tickets')
  async list(
    @Query('q') q?: string,
    @Query('category') category?: SupportTicketCategory,
    @Query('status') status?: SupportTicketStatus,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.support.listTickets({
      q,
      category,
      status,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('tickets/:id')
  async getOne(@Param('id') id: string) {
    return this.support.getTicket(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tickets/:id/status')
  async setStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status: SupportTicketStatus },
  ) {
    const user = (req as any).user;
    return this.support.updateStatus({
      id,
      status: body.status,
      actorId: user.userId ?? user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tickets/:id/assign')
  async assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { assignedToId: string | null },
  ) {
    const user = (req as any).user;
    return this.support.assignTicket({
      id,
      assignedToId: body.assignedToId,
      actorId: user.userId ?? user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('docs/user-manual-url')
  async getUserManualUrl() {
    const bucket = process.env.S3_BUCKET!;
    const prefix = process.env.S3_DOCS_PREFIX || 'docs';
    const filename = 'Omega_LIMS_Client_User_Guide.pdf';
    const key = `${prefix}/${filename}`;

    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    const url = await getSignedUrl(this.s3, cmd, { expiresIn: 60 }); // seconds
    return { url, filename };
  }
}
