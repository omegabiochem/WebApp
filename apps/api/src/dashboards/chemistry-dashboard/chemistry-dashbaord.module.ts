
import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { DashboardReportModule } from '../dashboard-report.module';
import { ChemistryDashboardController } from './chemistry-dashboard.controller';
import { ChemistryDashboardService } from './chemistry-dashboard.service';

@Module({
  imports: [DashboardReportModule],
  controllers: [ChemistryDashboardController],
  providers: [ChemistryDashboardService, PrismaService],
})
export class ChemistryDashboardModule {}