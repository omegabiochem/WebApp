import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';

type PutInput = {
  filePath: string;    // Multer temp path
  filename: string;    // original filename
  subdir?: string;     // logical directory in storage
};

@Injectable()
export class StorageService {
  private readonly ROOT = process.env.FS_STORAGE_ROOT
    ? path.resolve(process.env.FS_STORAGE_ROOT)
    : path.resolve(process.cwd(), 'storage'); // default ./storage

  /**
   * Copies file from a temp path into the storage root and returns a storageKey.
   * storageKey is a POSIX-style relative path suitable to persist in DB.
   */
  async put({ filePath, filename, subdir }: PutInput): Promise<string> {
    const targetDir = path.join(this.ROOT, subdir ?? 'misc');
    await fs.mkdir(targetDir, { recursive: true });

    const ext = path.extname(filename) || '.bin';
    const base = path.basename(filename, ext);
    const uniqueName = `${base}.${randomUUID()}${ext}`;
    const outPath = path.join(targetDir, uniqueName);

    await fs.copyFile(filePath, outPath);

    // Optionally remove temp file after copy; Multer may clean it later, but it’s safe to unlink:
    // await fs.unlink(filePath).catch(() => {});

    // Normalize to POSIX separators for DB storage keys
    return path.relative(this.ROOT, outPath).split(path.sep).join('/');
  }

  createReadStream(storageKey: string) {
    const fullPath = path.join(this.ROOT, storageKey);
    return createReadStream(fullPath);
  }
}
