// attachments.controller.ts (keep exactly like this)
import {
  Controller, Post, Param, UploadedFile, UseInterceptors, Body, BadRequestException,
  Get, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import type { Express } from 'express';
import express from 'express';

import { AttachmentsService } from './attachments.service';

type UploadMeta = {
  source?: string;
  pages?: number | string;
  checksum?: string;
  createdBy?: string;
  kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
};

// Use the same root your StorageService uses
const UPLOAD_ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');
fsExtra.ensureDirSync(UPLOAD_ROOT);

@Controller('reports/micro-mix/:id/attachments')
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.bin';
        const base = path.basename(file.originalname, ext).replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}_${base}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async upload(
    @Param('id') reportId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadMeta = {},
  ) {
    if (!file) throw new BadRequestException('file is required');

    return this.svc.create({
      reportId,
      file,
      kind: meta.kind ?? 'SIGNED_FORM',
      source: meta.source ?? 'scan-hotfolder',
      pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
      providedChecksum: meta.checksum,
      createdBy: meta.createdBy ?? 'ingestor',
    });
  }

  @Get()
  list(@Param('id') reportId: string) {
    return this.svc.listForReport(reportId);
  }

  @Get(':attId')
  meta(@Param('attId') attId: string) {
    return this.svc.meta(attId);
  }

  @Get(':attId/file')
  async file(@Param('attId') attId: string, @Res() res: express.Response) {
    const { stream, mime, filename } = await this.svc.stream(attId);
    const inline = /^application\/pdf|^image\//.test(mime);
    res.type(mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    stream.pipe(res);
  }
}


// import {
//   Controller,
//   Post,
//   Param,
//   UploadedFile,
//   UseInterceptors,
//   Body,
//   BadRequestException,
//   Get,
//   Res,
// } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import type { Express } from 'express';
// import express from 'express';

// import { diskStorage } from 'multer';
// import * as path from 'path';
// import * as fsExtra from 'fs-extra';

// import { AttachmentsService } from './attachments.service';

// type UploadMeta = {
//   source?: string;
//   pages?: number | string;
//   checksum?: string;
//   createdBy?: string;
//   kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
// };

// // Use the same root as StorageService (FILES_DIR), fallback to ./dev_uploads
// const UPLOAD_ROOT = path.resolve(process.env.FILES_DIR ?? 'dev_uploads');
// fsExtra.ensureDirSync(UPLOAD_ROOT);

// @Controller('reports/micro-mix/:id/attachments')
// export class AttachmentsController {
//   constructor(private readonly svc: AttachmentsService) {}

//   @Post()
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: diskStorage({
//         destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
//         filename: (_req, file, cb) => {
//           const ext = path.extname(file.originalname) || '.bin';
//           const base = path
//             .basename(file.originalname, ext)
//             .replace(/[^\w.\-]/g, '_');
//           cb(null, `${Date.now()}_${base}${ext}`);
//         },
//       }),
//       limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
//     }),
//   )
//   async upload(
//     @Param('id') reportId: string,
//     @UploadedFile() file: Express.Multer.File,
//     @Body() meta: UploadMeta = {},
//   ) {
//     if (!file) throw new BadRequestException('file is required');

//     // quick visibility while debugging
//     // console.log('UPLOAD file.path =', file.path);

//     return this.svc.create({
//       reportId,
//       file, // now has .path
//       kind: meta.kind ?? 'SIGNED_FORM',
//       source: meta.source ?? 'scan-hotfolder',
//       pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
//       providedChecksum: meta.checksum,
//       createdBy: meta.createdBy ?? 'ingestor',
//     });
//   }

//   // @Post()
//   // @UseInterceptors(FileInterceptor('file', {
//   //   storage: diskStorage({
//   //     destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
//   //     filename: (_req, file, cb) => {
//   //       const ext = path.extname(file.originalname) || '.bin';
//   //       const base = path.basename(file.originalname, ext).replace(/[^\w.\-]/g, '_');
//   //       cb(null, `${Date.now()}_${base}${ext}`);
//   //     },
//   //   }),
//   //   limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
//   // }))
//   // async upload(
//   //   @Param('id') reportId: string,
//   //   @UploadedFile() file: Express.Multer.File,
//   //   @Body() meta: UploadMeta = {},
//   // ) {
//   //   if (!file) throw new BadRequestException('file is required');

//   //   return this.svc.create({
//   //     reportId,
//   //     file, // now includes .path
//   //     kind: meta.kind ?? 'SIGNED_FORM',
//   //     source: meta.source ?? 'scan-hotfolder',
//   //     pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
//   //     providedChecksum: meta.checksum,
//   //     createdBy: meta.createdBy ?? 'ingestor',
//   //   });
//   // }

//   @Get()
//   list(@Param('id') reportId: string) {
//     return this.svc.listForReport(reportId);
//   }

//   @Get(':attId')
//   meta(@Param('attId') attId: string) {
//     return this.svc.meta(attId);
//   }

//   @Get(':attId/file')
//   async file(@Param('attId') attId: string, @Res() res: express.Response) {
//     const { stream, mime, filename } = await this.svc.stream(attId);
//     const inline = /^application\/pdf|^image\//.test(mime);
//     res.type(mime);
//     res.setHeader(
//       'Content-Disposition',
//       `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
//     );
//     stream.pipe(res);
//   }
// }

// // // attachments.controller.ts
// // import {
// //   Controller, Post, Param, UploadedFile, UseInterceptors, Body, BadRequestException,
// //   Get,
// //   Res,
// // } from '@nestjs/common';
// // import { FileInterceptor } from '@nestjs/platform-express';
// // import type { Express } from 'express';    // for Express.Multer.File
// // import express from 'express';             // for express.Response

// // import { AttachmentsService } from './attachments.service';
// // import path from 'path';
// // import * as fs from 'fs-extra';
// // import { diskStorage } from 'multer';

// // type UploadMeta = {
// //   source?: string;
// //   pages?: number | string;
// //   checksum?: string;
// //   createdBy?: string;
// //   kind?: 'SIGNED_FORM' | 'RAW_SCAN' | 'OTHER';
// // };

// // // pick a temp folder; use your existing FILES_DIR or fallback
// // const TMP_DIR = process.env.FILES_DIR || path.join(process.cwd(), 'dev_uploads');
// // // make sure it exists at module load
// // fs.ensureDirSync(TMP_DIR);

// // @Controller('reports/micro-mix/:id/attachments')
// // export class AttachmentsController {
// //   constructor(private readonly svc: AttachmentsService) {}

// //    @Post()
// //   @UseInterceptors(FileInterceptor('file', {
// //     storage: diskStorage({
// //       destination: TMP_DIR,
// //       filename: (req, file, cb) => {
// //         const safe = (file.originalname || 'file').replace(/[^\w.\-]/g, '_');
// //         cb(null, `${Date.now()}_${safe}`);
// //       },
// //     }),
// //     limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
// //   }))
// //   async upload(
// //     @Param('id') reportId: string,
// //     @UploadedFile() file: Express.Multer.File,
// //     @Body() meta: UploadMeta = {},
// //   ) {
// //     if (!file) throw new BadRequestException('file is required');
// //     return this.svc.create({
// //       reportId,
// //       file, // now has .path
// //       kind: meta.kind ?? 'SIGNED_FORM',
// //       source: meta.source ?? 'scan-hotfolder',
// //       pages: meta.pages !== undefined ? Number(meta.pages) : undefined,
// //       providedChecksum: meta.checksum,
// //       createdBy: meta.createdBy ?? 'ingestor',
// //     });
// //   }

// //    // List all attachments for a report
// //   @Get()
// //   list(@Param('id') reportId: string) {
// //     return this.svc.listForReport(reportId);
// //   }

// //   // Attachment metadata
// //   @Get(':attId')
// //   meta(@Param('attId') attId: string) {
// //     return this.svc.meta(attId);
// //   }

// //   // Stream the file (inline for PDFs/images; attachment for others)
// //  @Get(':attId/file')
// // async file(@Param('attId') attId: string, @Res() res: express.Response) {
// //   const { stream, mime, filename } = await this.svc.stream(attId);
// //   const inline = /^application\/pdf|^image\//.test(mime);

// //   res.type(mime); // same as res.setHeader('Content-Type', mime)
// //   res.setHeader(
// //     'Content-Disposition',
// //     `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
// //   );

// //   stream.pipe(res);  // ok: Node Readable -> Express (Writable)
// // }

// // }
