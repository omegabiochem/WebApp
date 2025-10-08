// src/attachments/attachments.module.ts
import { Module } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { MulterModule } from '@nestjs/platform-express';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from 'prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Module({
  imports: [
    MulterModule.register({
        storage: memoryStorage(),  
    //   dest: 'tmp/uploads',
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, PrismaService, StorageService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {} 