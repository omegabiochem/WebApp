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

import {
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';

import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { JwtAuthGuard } from 'src/common/jwt-auth.guard';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';
import { RolesGuard } from 'src/common/roles.guard';
import { Roles } from 'src/common/roles.decorator';

import { SupportService } from './support.service';

import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

import {
  AddSupportTicketNoteDto,
  AssignSupportTicketDto,
  UpdateSupportTicketStatusDto,
} from './dto/manage-support-ticket.dto';

@Controller('support')
@UseGuards(JwtAuthGuard, IdleTimeoutGuard)
export class SupportController {
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION!,

    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  constructor(
    private readonly support: SupportService,
  ) {}

  // ---------------------------------------------------------
  // CREATE TICKET
  // Any authenticated LIMS user
  // ---------------------------------------------------------

  @Post('tickets')
  async create(
    @Req() req: Request,
    @Body() dto: CreateSupportTicketDto,
  ) {
    const user = (req as any).user;

    const userAgent =
      req.headers['user-agent'] as string | undefined;

    return this.support.createTicket({
      userId: user.userId ?? user.sub,
      userAgent,
      dto,
    });
  }

  // ---------------------------------------------------------
  // SUPPORT MANAGEMENT
  // ADMIN / SYSTEMADMIN ONLY
  // ---------------------------------------------------------

  @Get('tickets')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
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

  @Get('assignees')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
  async assignees() {
    return this.support.listAssignees();
  }

  @Get('tickets/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
  async getOne(
    @Param('id') id: string,
  ) {
    return this.support.getTicket(id);
  }

  @Patch('tickets/:id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
  async setStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateSupportTicketStatusDto,
  ) {
    const user = (req as any).user;

    return this.support.updateStatus({
      id,
      status: body.status,
      actorId: user.userId ?? user.sub,
    });
  }

  @Patch('tickets/:id/assign')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
  async assign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AssignSupportTicketDto,
  ) {
    const user = (req as any).user;

    return this.support.assignTicket({
      id,
      assignedToId: body.assignedToId ?? null,
      actorId: user.userId ?? user.sub,
    });
  }

  @Post('tickets/:id/notes')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SYSTEMADMIN')
  async addNote(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AddSupportTicketNoteDto,
  ) {
    const user = (req as any).user;

    return this.support.addNote({
      id,
      actorId: user.userId ?? user.sub,
      message: body.message,
    });
  }

  // ---------------------------------------------------------
  // USER MANUAL
  // ---------------------------------------------------------

  @Get('docs/user-manual-url')
  async getUserManualUrl() {
    const bucket = process.env.S3_BUCKET!;
    const prefix = process.env.S3_DOCS_PREFIX || 'docs';

    const filename =
      'Omega_LIMS_Client_User_Guide.pdf';

    const key = `${prefix}/${filename}`;

    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key,

      ResponseContentType:
        'application/pdf',

      ResponseContentDisposition:
        `attachment; filename="${filename}"`,
    });

    const url = await getSignedUrl(
      this.s3,
      cmd,
      {
        expiresIn: 60,
      },
    );

    return {
      url,
      filename,
    };
  }
}