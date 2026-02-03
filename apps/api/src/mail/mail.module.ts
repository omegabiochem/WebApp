import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationRecipientsService } from './notification-recipients.service';

@Module({
  providers: [MailService, PrismaService, NotificationRecipientsService],
  exports: [MailService, NotificationRecipientsService],
})
export class MailModule {}
