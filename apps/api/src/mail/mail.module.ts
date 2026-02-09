import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaService } from 'prisma/prisma.service';
import { NotificationRecipientsService } from './notification-recipients.service';
import { SmsService } from './sms.service';

@Module({
  providers: [
    MailService,
    PrismaService,
    NotificationRecipientsService,
    SmsService,
  ],
  exports: [MailService, NotificationRecipientsService, SmsService],
})
export class MailModule {}
