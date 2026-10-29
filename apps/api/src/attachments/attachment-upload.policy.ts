import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

import * as fs from 'fs/promises';
import * as path from 'path';

export const MAX_ATTACHMENT_SIZE_MB = 15;

export const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],

  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],

  '.png': ['image/png'],
};

/**
 * We intentionally DON'T use Express.Multer.File here.
 *
 * Multer fileFilter receives a partial file object
 * before the full Express.Multer.File is available.
 */
type AttachmentTypeFile = {
  originalname: string;
  mimetype: string;
};

type AttachmentSizeFile = {
  size: number;
};

export function validateAttachmentType(file: AttachmentTypeFile) {
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedMimeTypes = ALLOWED_TYPES[ext];

  if (!allowedMimeTypes) {
    throw new BadRequestException(
      'Invalid attachment type. Only PDF, JPG, JPEG, and PNG files are allowed.',
    );
  }

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(
      `Invalid attachment type. File extension ${ext} does not match MIME type ${file.mimetype}.`,
    );
  }
}

export function validateAttachmentSize(file: AttachmentSizeFile) {
  if (!file.size) {
    throw new BadRequestException('Attachment is empty.');
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new PayloadTooLargeException(
      `Attachment is too large. Maximum allowed size is ${MAX_ATTACHMENT_SIZE_MB} MB.`,
    );
  }
}

/**
 * Verify actual file contents.
 *
 * Prevents renamed files such as:
 * malware.exe -> certificate.pdf
 */
export async function validateAttachmentSignature(
  filePath: string,
  originalName: string,
) {
  const ext = path.extname(originalName).toLowerCase();

  const handle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(8);

    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

    if (bytesRead === 0) {
      throw new BadRequestException('Attachment is empty.');
    }

    let valid = false;

    // PDF: %PDF-
    if (ext === '.pdf') {
      valid =
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46 &&
        buffer[4] === 0x2d;
    }

    // JPEG: FF D8 FF
    if (ext === '.jpg' || ext === '.jpeg') {
      valid = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // PNG
    if (ext === '.png') {
      valid =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;
    }

    if (!valid) {
      throw new BadRequestException(
        'The uploaded file content does not match its file type.',
      );
    }
  } finally {
    await handle.close();
  }
}
