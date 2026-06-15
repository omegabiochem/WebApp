import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportModule } from '../dashboard-report.module';
import { FrontdeskDashboardController } from './frontdesk-dashboard.controller';
import { FrontdeskDashboardService } from './frontdesk-dashboard.service';

@Module({
  imports: [DashboardReportModule],
  controllers: [FrontdeskDashboardController],
  providers: [FrontdeskDashboardService, PrismaService],
})
export class FrontdeskDashboardModule {}