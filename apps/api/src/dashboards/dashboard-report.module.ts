import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportSyncService } from './dashboard-report-sync.service';

@Module({
  providers: [PrismaService, DashboardReportSyncService],
  exports: [DashboardReportSyncService],
})
export class DashboardReportModule {}
