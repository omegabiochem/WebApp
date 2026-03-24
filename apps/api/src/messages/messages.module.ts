import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaService } from 'prisma/prisma.service';
import { FormsController } from './forms.controller';
import { StorageService } from 'src/storage/storage.service';

import { MailService } from '../mail/mail.service';
import { NotificationRecipientsService } from '../mail/notification-recipients.service';
import { NotificationService } from '../notifications/inAppNotifications/notification.service';
import { NotificationGateway } from '../notifications/inAppNotifications/notification.gateway';
import { MessageNotificationsService } from 'src/notifications/message-notifications.service';
import { MessageDigestService } from 'src/notifications/message-digest.service';

@Module({
  controllers: [MessagesController, FormsController],
  providers: [
    MessagesService,
    MessageNotificationsService,
    MessageDigestService,
    PrismaService,
    StorageService,
    MailService,
    NotificationRecipientsService,
    NotificationService,
    NotificationGateway,
  ],
})
export class MessagesModule {}
