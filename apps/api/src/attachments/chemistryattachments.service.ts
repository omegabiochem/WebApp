// attachments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Express } from 'express';
import { ReadStream } from 'fs';
import { randomUUID } from 'crypto';

type CreateInput = {
  chemistryId: string;
  file: Express.Multer.File;
  kind: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
  source: string;
  pages?: number;
  providedChecksum?: string;
  createdBy?: string;
  meta?: Record<string, any>;
};

@Injectable()
export class ChemistryAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private readonly ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');

  private async sha256FromPath(p: string): Promise<string> {
    const buf = await fs.readFile(p);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }
  private sha256FromBuffer(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /** Ensure we have a real filesystem path; if Multer gave a buffer, persist it under ROOT/__tmp__ */
  private async ensureFilePath(
    file: Express.Multer.File,
  ): Promise<{ path: string; isTemp: boolean }> {
    const anyFile = file as any;
    if (anyFile.path) {
      return { path: anyFile.path as string, isTemp: false };
    }
    if (file.buffer) {
      const tmpDir = path.join(this.ROOT, '__tmp__');
      await fs.mkdir(tmpDir, { recursive: true });
      const ext = path.extname(file.originalname) || '.bin';
      const base = path
        .basename(file.originalname, ext)
        .replace(/[^\w.\-]/g, '_');
      const tmpPath = path.join(
        tmpDir,
        `${Date.now()}_${randomUUID()}_${base}${ext}`,
      );
      await fs.writeFile(tmpPath, file.buffer);
      return { path: tmpPath, isTemp: true };
    }
    throw new Error('Uploaded file has neither path nor buffer');
  }

  async create(input: CreateInput) {
    const report = await this.prisma.chemistryReport.findUnique({
      where: { id: input.chemistryId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Report not found');

    // 👇 tolerate memory or disk
    const { path: filePath, isTemp } = await this.ensureFilePath(input.file);

    const checksum =
      input.providedChecksum ?? (await this.sha256FromPath(filePath));

    const storageKey = await this.storage.put({
      filePath,
      filename: input.file.originalname,
      subdir: `chemistry-reports/${input.chemistryId}`,
    });

    // If storage.put() copied (not renamed), we can delete any temp file
    // (If it renamed, the original path no longer exists; unlink will just fail silently.)
    if (isTemp) await fs.unlink(filePath).catch(() => {});

    try {
      const attachment = await this.prisma.chemistryAttachment.create({
        data: {
          chemistryId: input.chemistryId,
          kind: input.kind,
          filename: input.file.originalname,
          storageKey,
          storageDriver: 's3',
          storageBucket: process.env.S3_BUCKET ?? null,
          checksum,
          source: input.source,
          pages: input.pages,
          createdBy: input.createdBy ?? null,
          meta: input.meta ?? {},
        },
      });
      return { ok: true, id: attachment.id };
    } catch (e: any) {
      // Handle duplicate checksum (unique on [chemistryId, checksum])
      if (e.code === 'P2002') {
        const existing = await this.prisma.chemistryAttachment.findFirst({
          where: { chemistryId: input.chemistryId, checksum },
          select: { id: true },
        });
        return { ok: true, id: existing?.id, duplicate: true };
      }
      throw e;
    }
  }

  // ...listForReport/meta/stream unchanged

  async listForReport(chemistryId: string) {
    return this.prisma.chemistryAttachment.findMany({
      where: { chemistryId },
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
    const a = await this.prisma.chemistryAttachment.findUnique({
      where: { id },
    });
    if (!a) throw new NotFoundException('Attachment not found');
    const st = await this.storage.stat(a.storageKey).catch(() => null);
    return { ...a, size: st?.size ?? null };
  }

  async stream(id: string): Promise<{
    stream: NodeJS.ReadableStream;
    mime: string;
    filename: string;
  }> {
    const a = await this.prisma.chemistryAttachment.findUnique({
      where: { id },
    });
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

    const stream = await this.storage.createReadStream(a.storageKey);
    return { stream: stream as any, mime, filename: a.filename };
  }
}
