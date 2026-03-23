import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

import { MailModule } from '../mail/mail.module';

import { ReportNotificationsService } from './report-notifications.service';
import { ChemistryReportNotificationsService } from './chemistryreport-notification.service';

import { ClientNotificationsService } from './client-notifications.service';
import { ClientNotificationsController } from './client-notifications.controller';
import { NotificationsDigestService } from './notifications-digest.service';
import { NotificationModule } from './inAppNotifications/notification.module';


@Module({
  imports: [
    MailModule, // ✅ required for email sending
    NotificationModule,
  ],
  controllers: [
    ClientNotificationsController, // ✅ ADMIN API (new)
  ],
  providers: [
    PrismaService,
    NotificationsDigestService, // ✅ needed for client notifications
    ClientNotificationsService, // ✅ custom emails + mode logic
    ReportNotificationsService, // existing
    ChemistryReportNotificationsService,
  ],
  exports: [
    ClientNotificationsService, // (optional but useful later)
    ReportNotificationsService,
    ChemistryReportNotificationsService,
  ],
})
export class NotificationsModule {}
