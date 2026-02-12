import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaService } from 'prisma/prisma.service';
import { FormsController } from './forms.controller';
import { StorageService } from 'src/storage/storage.service';

@Module({
  controllers: [MessagesController, FormsController],
  providers: [MessagesService, PrismaService, StorageService],
})
export class MessagesModule {}
