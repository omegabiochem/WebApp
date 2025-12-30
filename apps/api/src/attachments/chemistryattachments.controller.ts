// attachments.controller.ts (keep exactly like this)
import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  Get,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import type { Express } from 'express';
import express from 'express';

import { ChemistryAttachmentsService } from './chemistryattachments.service';

type UploadMeta = {
  source?: string;
  pages?: number | string;
  checksum?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

// Use the same root your StorageService uses
const UPLOAD_ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');
fsExtra.ensureDirSync(UPLOAD_ROOT);

@Controller('chemistry-reports/:id/attachments')
export class ChemistryAttachmentsController {
  constructor(private readonly svc: ChemistryAttachmentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.bin';
          const base = path
            .basename(file.originalname, ext)
            .replace(/[^\w.\-]/g, '_');
          cb(null, `${Date.now()}_${base}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(
    @Param('id') chemistryId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadMeta = {},
  ) {
    if (!file) throw new BadRequestException('file is required');

    return this.svc.create({
      chemistryId,
      file,
      kind: meta.kind ?? 'SIGNED_FORM',
      source: meta.source ?? 'scan-hotfolder',
      pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
      providedChecksum: meta.checksum,
      createdBy: meta.createdBy ?? 'ingestor',
    });
  }

  @Get()
  list(@Param('id') chemistryId: string) {
    return this.svc.listForReport(chemistryId);
  }

  @Get(':attId')
  meta(@Param('attId') attId: string) {
    return this.svc.meta(attId);
  }

  @Get(':attId/file')
  async file(@Param('attId') attId: string, @Res() res: express.Response) {
    const { stream, mime, filename } = await this.svc.stream(attId);
    const inline = /^application\/pdf|^image\//.test(mime);
    res.type(mime);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    );
    stream.pipe(res);
  }
}
