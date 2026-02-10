import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, PrismaService, MailService],
})
export class SupportModule {}
