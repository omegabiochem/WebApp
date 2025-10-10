import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream, ReadStream } from 'fs';
import { randomUUID } from 'crypto';

type PutInput = { filePath: string; filename: string; subdir?: string };

@Injectable()
export class StorageService {
  // Use FILES_DIR as the storage root (as you already do)
  private readonly ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');

  async put({ filePath, filename, subdir }: PutInput): Promise<string> {
    const targetDir = path.join(this.ROOT, subdir ?? 'misc');
    await fs.mkdir(targetDir, { recursive: true });

    const ext = path.extname(filename) || '.bin';
    const base = path.basename(filename, ext).replace(/[^\w.\-]/g, '_');
    const outPath = path.join(targetDir, `${base}.${randomUUID()}${ext}`);

    try {
      await fs.rename(filePath, outPath); // fast move if same volume/root
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

  resolvePath(storageKey: string) {
    return path.isAbsolute(storageKey)
      ? storageKey
      : path.join(this.ROOT, storageKey);
  }

  createReadStream(storageKey: string): ReadStream {
    const fullPath = this.resolvePath(storageKey);
    return createReadStream(fullPath);
  }

  async stat(storageKey: string) {
    return fs.stat(this.resolvePath(storageKey));
  }
}
