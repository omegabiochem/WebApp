import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportSyncService } from './dashboard-report-sync.service';
import { SystemAdminDashboardModule } from './system-admin-dashboard/system-admin-dashboard.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';

@Module({
  providers: [
    PrismaService,
    DashboardReportSyncService,
  ],
  exports: [
    DashboardReportSyncService,
  ],
})
export class DashboardReportModule {}