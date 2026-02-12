import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Param,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './create-message.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from 'src/storage/storage.service';
import { PrismaService } from 'prisma/prisma.service';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import * as os from 'os';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly storage: StorageService,
    private readonly service: MessagesService,
    private readonly prisma: PrismaService,
  ) {
    console.log('✅ MessagesController loaded');
  }

  // CLIENT & LAB → fetch conversation
  @Get()
  async getMessages(
    @Req() req: any,
    @Query('clientCode') clientCode?: string,
    @Query('reportId') reportId?: string,
    @Query('chemistryId') chemistryId?: string,
  ) {
    const user = req.user;

    const effectiveClientCode =
      user.role === 'CLIENT' ? user.clientCode : clientCode;

    if (!effectiveClientCode) {
      throw new ForbiddenException('clientCode required');
    }

    return this.service.getThreadMessages({
      clientCode: effectiveClientCode,
      reportId,
      chemistryId,
      viewerRole: user.role,
    });
  }

  @Post()
  async sendMessage(@Req() req: any, @Body() dto: CreateMessageDto) {
    return this.service.sendMessage(req.user, dto);
  }

  // LAB → inbox
  @Get('inbox')
  async inbox(@Req() req: any) {
    const user = req.user;
    const userId = user.userId ?? user.sub;
    return this.service.getInbox(user, userId);
  }

  @Post('read')
  async markRead(
    @Req() req: any,
    @Body()
    body: { clientCode?: string; reportId?: string; chemistryId?: string },
  ) {
    const user = req.user;

    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('clientCode missing');

      return this.service.markThreadRead(user, {
        clientCode: user.clientCode,
        reportId: body.reportId,
        chemistryId: body.chemistryId,
      });
    }

    if (!body.clientCode) throw new ForbiddenException('clientCode required');

    return this.service.markThreadRead(user, {
      clientCode: body.clientCode,
      reportId: body.reportId,
      chemistryId: body.chemistryId,
    });
  }

  // -----------------------------
  // Upload (AUTH protected)
  // -----------------------------
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(), // temporary file location
        filename: (req, file, cb) => {
          cb(null, Date.now() + '-' + file.originalname);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    }),
  )
  async upload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');

    const ok =
      file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!ok) throw new BadRequestException('Only images or PDF are allowed');

    const userId = req.user?.userId ?? req.user?.sub;
    const role: UserRole = req.user?.role;
    if (!userId || !role) throw new ForbiddenException('Auth missing');

    const storageKey = await this.storage.put({
      filePath: file.path,
      filename: file.originalname,
      subdir: 'chat',
    });

    await this.prisma.chatUpload.create({
      data: {
        storageKey,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
        clientCode: role === 'CLIENT' ? (req.user?.clientCode ?? null) : null,
      },
    });

    return {
      storageKey,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      // ✅ do NOT encode; key may contain "/" and route supports :key(*)
      url: `/messages/uploads?key=${encodeURIComponent(storageKey)}`,
    };
  }

  // -----------------------------
  // Download (AUTH protected)
  // -----------------------------
  @Get('uploads')
  async download(
    @Req() req: any,
    @Query('key') key: string,
    @Res() res: Response,
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    const role: UserRole = req.user?.role;
    const clientCode = req.user?.clientCode ?? null;

    if (!userId || !role) throw new ForbiddenException('Auth missing');
    if (!key) throw new BadRequestException('key is required');

    const decodedKey = decodeURIComponent(key);

    const row = await this.prisma.chatUpload.findUnique({
      where: { storageKey: decodedKey },
    });
    if (!row) throw new BadRequestException('File not found');

    if (role === 'CLIENT') {
      if (!clientCode || row.clientCode !== clientCode) {
        throw new ForbiddenException('Not allowed');
      }
    }

    res.setHeader(
      'Content-Type',
      row.contentType || 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.filename)}"`,
    );

    const stream = await this.storage.createReadStream(row.storageKey);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }
}
