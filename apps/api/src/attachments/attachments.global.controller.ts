import { Controller, Get, Param, Query, Res, NotFoundException, Req, Post, Body, BadRequestException } from '@nestjs/common';
import express from 'express';
import { AttachmentsGlobalService } from './attachments.global.service';

function num(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clean(v: any) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return undefined;
  return s;
}

@Controller()
export class AttachmentsGlobalController {
  constructor(private readonly svc: AttachmentsGlobalService) {}

  // ✅ GET /attachments?q=...&kind=...&fileType=... etc
  @Get('attachments')
listAll(@Query() q: any, @Req() req: any) {
  return this.svc.listAll(
    {
      q: clean(q.q),
      kind: clean(q.kind),
      fileType: clean(q.fileType) as any,
      reportId: clean(q.reportId),
      reportType: clean(q.reportType) as any,
      createdBy: clean(q.createdBy),
      source: clean(q.source),
      dateFrom: clean(q.dateFrom),
      dateTo: clean(q.dateTo),
      sort: clean(q.sort) as any,
      take: num(q.take, 100),
      skip: num(q.skip, 0),
    },
    req.user, // ✅ keep
  );
}


  // ✅ GET /attachments/:id/file
  @Get('attachments/:id/file')
  async file(@Param('id') id: string, @Res() res: express.Response) {
    const out = await this.svc.streamByAnyId(id);
    if (!out) throw new NotFoundException('Attachment not found');

    const { stream, mime, filename } = out;
    const inline = /^application\/pdf|^image\//.test(mime);

    res.type(mime);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    );

    stream.pipe(res);
  }


    // ✅ NEW: POST /attachments/merge-pdf
  @Post('attachments/merge-pdf')
  async mergePdf(
    @Body() body: { ids: string[] },
    @Req() req: any,
    @Res() res: express.Response,
  ) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) throw new BadRequestException('ids[] is required');

    const mergedBytes = await this.svc.mergePdfByAnyIds(ids, req.user);

    res.type('application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="merged.pdf"`);
    res.send(Buffer.from(mergedBytes));
  }
}
