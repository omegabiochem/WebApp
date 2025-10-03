// attachments.controller.ts
import {
  Controller, Post, Param, UploadedFile, UseInterceptors, Body, BadRequestException,
  Get,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';    // for Express.Multer.File
import express from 'express';             // for express.Response

import { AttachmentsService } from './attachments.service';

type UploadMeta = {
  source?: string;
  pages?: number | string;
  checksum?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

@Controller('reports/micro-mix/:id/attachments')
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


   // List all attachments for a report
  @Get()
  list(@Param('id') reportId: string) {
    return this.svc.listForReport(reportId);
  }

  // Attachment metadata
  @Get(':attId')
  meta(@Param('attId') attId: string) {
    return this.svc.meta(attId);
  }

  // Stream the file (inline for PDFs/images; attachment for others)
 @Get(':attId/file')
async file(@Param('attId') attId: string, @Res() res: express.Response) {
  const { stream, mime, filename } = await this.svc.stream(attId);
  const inline = /^application\/pdf|^image\//.test(mime);

  res.type(mime); // same as res.setHeader('Content-Type', mime)
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
  );

  stream.pipe(res);  // ok: Node Readable -> Express (Writable)
}

}
