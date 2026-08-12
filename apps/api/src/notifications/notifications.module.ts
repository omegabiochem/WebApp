import { Module } from '@nestjs/common';

import { PrismaService } from 'prisma/prisma.service';

import { MailModule } from '../mail/mail.module';

import {
  ReportNotificationsService,
} from './report-notifications.service';

import {
  ChemistryReportNotificationsService,
} from './chemistryreport-notification.service';

import {
  ClientNotificationsService,
} from './client-notifications.service';

import {
  ClientNotificationsController,
} from './client-notifications.controller';

import {
  NotificationsDigestService,
} from './notifications-digest.service';

import {
  NotificationModule,
} from './inAppNotifications/notification.module';

import {
  WorkflowReminderService,
} from './workflow-reminder.service';
import { NotificationGateway } from './inAppNotifications/notification.gateway';



@Module({
  imports: [
    MailModule,
    NotificationModule,
  ],

  controllers: [
    ClientNotificationsController,
  ],

  providers: [
    PrismaService,

    NotificationGateway,

    NotificationsDigestService,
    ClientNotificationsService,
    ReportNotificationsService,
    ChemistryReportNotificationsService,
    WorkflowReminderService,
  ],

  exports: [
    NotificationGateway,

    ClientNotificationsService,
    ReportNotificationsService,
    ChemistryReportNotificationsService,
    WorkflowReminderService,
  ],
})
export class NotificationsModule {}