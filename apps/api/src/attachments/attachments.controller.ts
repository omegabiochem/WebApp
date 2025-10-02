// attachments.controller.ts
import {
  Controller, Post, Param, UploadedFile, UseInterceptors, Body, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express'; // ✅ type-only import

import { AttachmentsService } from './attachments.service';

type UploadMeta = {
  source?: string;
  pages?: number | string;
  checksum?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

@Controller('reports/:id/attachments')
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') reportId: string,
    @UploadedFile() file: Express.Multer.File,   // ✅ use Express.Multer.File
    @Body() meta: UploadMeta = {},
  ) {
    if (!file) throw new BadRequestException('file is required');

    return this.svc.create({
      reportId,
      file,
      kind: meta.kind ?? 'SIGNED_FORM',
      source: meta.source ?? 'scan-smb',
      pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
      providedChecksum: meta.checksum,
      createdBy: meta.createdBy ?? 'ingestor',
    });
  }
}
