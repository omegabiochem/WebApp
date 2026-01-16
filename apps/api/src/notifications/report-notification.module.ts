import { Module } from '@nestjs/common';
import { ReportNotificationsService } from './report-notifications.service';
import { MailModule } from '../mail/mail.module';
import { ChemistryReportNotificationsService } from './chemistryreport-notification.service';

@Module({
  imports: [MailModule], // because ReportNotificationsService depends on MailService
  providers: [ReportNotificationsService, ChemistryReportNotificationsService],
  exports: [ReportNotificationsService, ChemistryReportNotificationsService], // ✅ must export so ReportsModule can use it
})
export class NotificationsModule {}
