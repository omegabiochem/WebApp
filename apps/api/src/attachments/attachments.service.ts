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
  reportId: string;
  file: Express.Multer.File;
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
    const report = await this.prisma.microMixReport.findUnique({
      where: { id: input.reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    // 👇 tolerate memory or disk
    const { path: filePath, isTemp } = await this.ensureFilePath(input.file);

    const checksum =
      input.providedChecksum ?? (await this.sha256FromPath(filePath));

    const storageKey = await this.storage.put({
      filePath,
      filename: input.file.originalname,
      subdir: `reports/${input.reportId}`,
    });

    // If storage.put() copied (not renamed), we can delete any temp file
    // (If it renamed, the original path no longer exists; unlink will just fail silently.)
    if (isTemp) await fs.unlink(filePath).catch(() => {});

    try {
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
    } catch (e: any) {
      // Handle duplicate checksum (unique on [reportId, checksum])
      if (e.code === 'P2002') {
        const existing = await this.prisma.attachment.findFirst({
          where: { reportId: input.reportId, checksum },
          select: { id: true },
        });
        return { ok: true, id: existing?.id, duplicate: true };
      }
      throw e;
    }
  }

  // ...listForReport/meta/stream unchanged

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

// // attachments.service.ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'prisma/prisma.service';
// import { StorageService } from '../storage/storage.service';
// import * as crypto from 'crypto';
// import * as fs from 'fs/promises';
// import type { Express } from 'express'; // ✅ type-only import
// import path from 'path';
// import { ReadStream } from 'fs';

// type CreateInput = {
//   reportId: string;
//   file: Express.Multer.File; // ✅ use Express.Multer.File
//   kind: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
//   source: string;
//   pages?: number;
//   providedChecksum?: string;
//   createdBy?: string;
// };

// @Injectable()
// export class AttachmentsService {
//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly storage: StorageService,
//   ) {}

//   private async sha256(filePath: string): Promise<string> {
//     const buf = await fs.readFile(filePath);
//     return crypto.createHash('sha256').update(buf).digest('hex');
//   }

//   async create(input: CreateInput) {
//     const report = await this.prisma.microMixReport.findUnique({
//       where: { id: input.reportId },
//     });
//     if (!report) throw new NotFoundException('Report not found');

//     const checksum =
//       input.providedChecksum ?? (await this.sha256(input.file.path));
//     const storageKey = await this.storage.put({
//       filePath: input.file.path,
//       filename: input.file.originalname,
//       subdir: `reports/${input.reportId}`,
//     });

//     // const attachment = await this.prisma.attachment.create({
//     //   data: {
//     //     reportId: input.reportId,
//     //     kind: input.kind,
//     //     filename: input.file.originalname,
//     //     storageKey,
//     //     checksum,
//     //     source: input.source,
//     //     pages: input.pages,
//     //     createdBy: input.createdBy ?? null,
//     //     meta: {},
//     //   },
//     // });

//     // return { ok: true, id: attachment.id };

//     try {
//       const attachment = await this.prisma.attachment.create({
//         data: {
//           reportId: input.reportId,
//           kind: input.kind,
//           filename: input.file.originalname,
//           storageKey,
//           checksum,
//           source: input.source,
//           pages: input.pages,
//           createdBy: input.createdBy ?? null,
//           meta: {},
//         },
//       });
//       return { ok: true, id: attachment.id };
//     } catch (e: any) {
//       if (e.code === 'P2002') {
//         const existing = await this.prisma.attachment.findFirst({
//           where: { reportId: input.reportId, checksum },
//           select: { id: true },
//         });
//         return { ok: true, id: existing?.id, duplicate: true };
//       }
//       throw e;
//     }
//   }

//   async listForReport(reportId: string) {
//     return this.prisma.attachment.findMany({
//       where: { reportId },
//       orderBy: { createdAt: 'desc' },
//       select: {
//         id: true,
//         kind: true,
//         filename: true,
//         storageKey: true,
//         pages: true,
//         source: true,
//         createdAt: true,
//         createdBy: true,
//       },
//     });
//   }

//   async meta(id: string) {
//     const a = await this.prisma.attachment.findUnique({ where: { id } });
//     if (!a) throw new NotFoundException('Attachment not found');
//     const st = await this.storage.stat(a.storageKey).catch(() => null);
//     return { ...a, size: st?.size ?? null };
//   }

//   async stream(
//     id: string,
//   ): Promise<{ stream: ReadStream; mime: string; filename: string }> {
//     const a = await this.prisma.attachment.findUnique({ where: { id } });
//     if (!a) throw new NotFoundException('Attachment not found');

//     const ext = path.extname(a.filename).toLowerCase();
//     const mime =
//       ext === '.pdf'
//         ? 'application/pdf'
//         : ext === '.png'
//           ? 'image/png'
//           : ext === '.jpg' || ext === '.jpeg'
//             ? 'image/jpeg'
//             : 'application/octet-stream';

//     const stream = this.storage.createReadStream(a.storageKey); // ReadStream
//     return { stream, mime, filename: a.filename };
//   }
// }
