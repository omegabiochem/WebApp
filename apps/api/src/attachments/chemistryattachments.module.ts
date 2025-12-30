// src/attachments/attachments.module.ts
import { Module } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { MulterModule } from '@nestjs/platform-express';

import { PrismaService } from 'prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ChemistryAttachmentsController } from './chemistryattachments.controller';
import { ChemistryAttachmentsService } from './chemistryattachments.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      //   dest: 'tmp/uploads',
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  ],
  controllers: [ChemistryAttachmentsController],
  providers: [ChemistryAttachmentsService, PrismaService, StorageService],
  exports: [ChemistryAttachmentsService],
})
export class ChemistryAttachmentsModule {}
