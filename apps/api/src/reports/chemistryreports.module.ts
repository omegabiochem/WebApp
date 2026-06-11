import { Module } from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { ChemistryReportsController } from './chemistryreports.controller';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from 'src/auth/esign.service';
import { ChemistryAttachmentsService } from 'src/attachments/chemistryattachments.service';
import { StorageService } from 'src/storage/storage.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ReportsGateway } from './reports.gateway';
import { DashboardReportModule } from 'src/dashboards/dashboard-report.module';

@Module({
  imports: [NotificationsModule,DashboardReportModule],
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
