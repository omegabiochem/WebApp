import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportModule } from '../dashboard-report.module';
import { SystemAdminDashboardController } from './system-admin-dashboard.controller';
import { SystemAdminDashboardService } from './system-admin-dashboard.service';

@Module({
  imports: [DashboardReportModule],
  controllers: [SystemAdminDashboardController],
  providers: [SystemAdminDashboardService, PrismaService],
})
export class SystemAdminDashboardModule {}