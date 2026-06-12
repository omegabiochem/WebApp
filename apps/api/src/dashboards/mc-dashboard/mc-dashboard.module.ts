import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportModule } from '../dashboard-report.module';
import { McDashboardController } from './mc-dashboard.controller';
import { McDashboardService } from './mc-dashboard.service';

@Module({
  imports: [DashboardReportModule],
  controllers: [McDashboardController],
  providers: [McDashboardService, PrismaService],
})
export class McDashboardModule {}