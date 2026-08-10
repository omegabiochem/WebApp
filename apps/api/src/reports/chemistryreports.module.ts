import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ChemistryAttachmentsService } from 'src/attachments/chemistryattachments.service';
import { ESignService } from 'src/auth/esign.service';
import { DashboardReportModule } from 'src/dashboards/dashboard-report.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { StorageService } from 'src/storage/storage.service';
import { ChemistryReportsController } from './chemistryreports.controller';
import { ChemistryReportsService } from './chemistryreports.service';
import { ReportsGateway } from './reports.gateway';

@Module({
  imports: [NotificationsModule, DashboardReportModule],
  controllers: [ChemistryReportsController],
  providers: [
    ChemistryReportsService,
    ReportsGateway,
    PrismaService,
    ESignService,
    ChemistryAttachmentsService,
    StorageService,
  ],
})
export class ChemistryReportsModule {}