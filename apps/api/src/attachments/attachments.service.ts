// attachments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import type { Express } from 'express'; // ✅ type-only import
import path from 'path';
import { ReadStream } from 'fs';

type CreateInput = {
  reportId: string;
  file: Express.Multer.File; // ✅ use Express.Multer.File
  kind: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
  source: string;
  pages?: number;
  providedChecksum?: string;
  createdBy?: string;
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async sha256(filePath: string): Promise<string> {
    const buf = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  async create(input: CreateInput) {
    const report = await this.prisma.microMixReport.findUnique({
      where: { id: input.reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    const checksum =
      input.providedChecksum ?? (await this.sha256(input.file.path));
    const storageKey = await this.storage.put({
      filePath: input.file.path,
      filename: input.file.originalname,
      subdir: `reports/${input.reportId}`,
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        reportId: input.reportId,
        kind: input.kind,
        filename: input.file.originalname,
        storageKey,
        checksum,
        source: input.source,
        pages: input.pages,
        createdBy: input.createdBy ?? null,
        meta: {},
      },
    });

    return { ok: true, id: attachment.id };
  }

  async listForReport(reportId: string) {
    return this.prisma.attachment.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        filename: true,
        storageKey: true,
        pages: true,
        source: true,
        createdAt: true,
        createdBy: true,
      },
    });
  }

  async meta(id: string) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Attachment not found');
    const st = await this.storage.stat(a.storageKey).catch(() => null);
    return { ...a, size: st?.size ?? null };
  }

  async stream(
    id: string,
  ): Promise<{ stream: ReadStream; mime: string; filename: string }> {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Attachment not found');

    const ext = path.extname(a.filename).toLowerCase();
    const mime =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';

    const stream = this.storage.createReadStream(a.storageKey); // ReadStream
    return { stream, mime, filename: a.filename };
  }
}
