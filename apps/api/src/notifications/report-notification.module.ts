// import { Module } from '@nestjs/common';
// import { ReportNotificationsService } from './report-notifications.service';
// import { MailModule } from '../mail/mail.module';
// import { ChemistryReportNotificationsService } from './chemistryreport-notification.service';

// @Module({
//   imports: [MailModule], // because ReportNotificationsService depends on MailService
//   providers: [ReportNotificationsService, ChemistryReportNotificationsService],
//   exports: [ReportNotificationsService, ChemistryReportNotificationsService], // ✅ must export so ReportsModule can use it
// })
// export class NotificationsModule {}
// apps/api/src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

import { MailModule } from '../mail/mail.module';

import { ReportNotificationsService } from './report-notifications.service';
import { ChemistryReportNotificationsService } from './chemistryreport-notification.service';

import { ClientNotificationsService } from './client-notifications.service';
import { ClientNotificationsController } from './client-notifications.controller';

@Module({
  imports: [
    MailModule, // ✅ required for email sending
  ],
  controllers: [
    ClientNotificationsController, // ✅ ADMIN API (new)
  ],
  providers: [
    PrismaService,                 // ✅ needed for client notifications
    ClientNotificationsService,    // ✅ custom emails + mode logic
    ReportNotificationsService,    // existing
    ChemistryReportNotificationsService,
  ],
  exports: [
    ClientNotificationsService,    // (optional but useful later)
    ReportNotificationsService,
    ChemistryReportNotificationsService,
  ],
})
export class NotificationsModule {}
