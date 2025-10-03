// storage.service.ts
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream, ReadStream } from 'fs';
import { randomUUID } from 'crypto';

type PutInput = { filePath: string; filename: string; subdir?: string };

@Injectable()
export class StorageService {
  private readonly ROOT = process.env.FS_STORAGE_ROOT
    ? path.resolve(process.env.FS_STORAGE_ROOT)
    : path.resolve(process.cwd(), 'storage');

  async put({ filePath, filename, subdir }: PutInput): Promise<string> {
    const targetDir = path.join(this.ROOT, subdir ?? 'misc');
    await fs.mkdir(targetDir, { recursive: true });
    const ext = path.extname(filename) || '.bin';
    const base = path.basename(filename, ext);
    const outPath = path.join(targetDir, `${base}.${randomUUID()}${ext}`);
    await fs.copyFile(filePath, outPath);
    return path.relative(this.ROOT, outPath).split(path.sep).join('/'); // POSIX-ish
  }

  /** Works with relative or absolute storageKey */
  resolvePath(storageKey: string) {
    return path.isAbsolute(storageKey)
      ? storageKey
      : path.join(this.ROOT, storageKey);
  }

createReadStream(storageKey: string): ReadStream {
  const fullPath = this.resolvePath(storageKey);
  return createReadStream(fullPath); // Node fs.ReadStream
}

  async stat(storageKey: string) {
    return fs.stat(this.resolvePath(storageKey));
  }
}
