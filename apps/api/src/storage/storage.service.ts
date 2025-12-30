import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';

import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

type PutInput = { filePath: string; filename: string; subdir?: string };

@Injectable()
export class StorageService {
  private readonly driver = (
    process.env.STORAGE_DRIVER ?? 'local'
  ).toLowerCase();

  // Local root (still used as temp folder even in S3 mode)
  private readonly ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');

  // S3 config
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly region = process.env.AWS_REGION ?? 'us-east-1';
  private readonly prefix = (process.env.S3_PREFIX ?? '')
    .trim()
    .replace(/^\/|\/$/g, '');

  private readonly s3 = new S3Client({ region: this.region });

  async put({ filePath, filename, subdir }: PutInput): Promise<string> {
    if (this.driver !== 's3') {
      return this.putLocal({ filePath, filename, subdir });
    }

    if (!this.bucket) throw new Error('S3_BUCKET is not set');

    const ext = path.extname(filename) || '.bin';
    const base = path.basename(filename, ext).replace(/[^\w.\-]/g, '_');
    const safeSubdir = (subdir ?? 'misc')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');

    const key = [this.prefix, safeSubdir, `${base}.${randomUUID()}${ext}`]
      .filter(Boolean)
      .join('/');

    // Upload the temp file to S3 (multipart upload for big PDFs automatically)
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
      },
    });

    await upload.done();

    // IMPORTANT: delete temp uploaded file from disk (controller used diskStorage)
    await fs.unlink(filePath).catch(() => {});

    return key; // store S3 key in DB as storageKey
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    if (this.driver !== 's3') {
      const fullPath = path.isAbsolute(storageKey)
        ? storageKey
        : path.join(this.ROOT, storageKey);
      return createReadStream(fullPath);
    }

    const out = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );

    if (!out.Body) throw new Error('S3 GetObject returned empty Body');
    return out.Body as Readable; // has .pipe(res) ✅
  }

  async stat(storageKey: string): Promise<{ size: number }> {
    if (this.driver !== 's3') {
      const fullPath = path.isAbsolute(storageKey)
        ? storageKey
        : path.join(this.ROOT, storageKey);
      const st = await fs.stat(fullPath);
      return { size: st.size };
    }

    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );

    return { size: Number(head.ContentLength ?? 0) };
  }

  // ---------- your original local put ----------
  private async putLocal({
    filePath,
    filename,
    subdir,
  }: PutInput): Promise<string> {
    const targetDir = path.join(this.ROOT, subdir ?? 'misc');
    await fs.mkdir(targetDir, { recursive: true });

    const ext = path.extname(filename) || '.bin';
    const base = path.basename(filename, ext).replace(/[^\w.\-]/g, '_');
    const outPath = path.join(targetDir, `${base}.${randomUUID()}${ext}`);

    try {
      await fs.rename(filePath, outPath);
    } catch (e: any) {
      if (e.code === 'EXDEV') {
        await fs.copyFile(filePath, outPath);
        await fs.unlink(filePath).catch(() => {});
      } else {
        throw e;
      }
    }

    return path.relative(this.ROOT, outPath).split(path.sep).join('/');
  }
}

// import { Injectable } from '@nestjs/common';
// import * as path from 'path';
// import * as fs from 'fs/promises';
// import { createReadStream, ReadStream } from 'fs';
// import { randomUUID } from 'crypto';

// type PutInput = { filePath: string; filename: string; subdir?: string };

// @Injectable()
// export class StorageService {
//   // Use FILES_DIR as the storage root (as you already do)
//   private readonly ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');

//   async put({ filePath, filename, subdir }: PutInput): Promise<string> {
//     const targetDir = path.join(this.ROOT, subdir ?? 'misc');
//     await fs.mkdir(targetDir, { recursive: true });

//     const ext = path.extname(filename) || '.bin';
//     const base = path.basename(filename, ext).replace(/[^\w.\-]/g, '_');
//     const outPath = path.join(targetDir, `${base}.${randomUUID()}${ext}`);

//     try {
//       await fs.rename(filePath, outPath); // fast move if same volume/root
//     } catch (e: any) {
//       if (e.code === 'EXDEV') {
//         await fs.copyFile(filePath, outPath);
//         await fs.unlink(filePath).catch(() => {});
//       } else {
//         throw e;
//       }
//     }

//     return path.relative(this.ROOT, outPath).split(path.sep).join('/');
//   }

//   resolvePath(storageKey: string) {
//     return path.isAbsolute(storageKey)
//       ? storageKey
//       : path.join(this.ROOT, storageKey);
//   }

//   createReadStream(storageKey: string): ReadStream {
//     const fullPath = this.resolvePath(storageKey);
//     return createReadStream(fullPath);
//   }

//   async stat(storageKey: string) {
//     return fs.stat(this.resolvePath(storageKey));
//   }
// }
