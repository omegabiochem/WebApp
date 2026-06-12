import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { MicroDashboardController } from './micro-dashboard.controller';
import { MicroDashboardService } from './micro-dashboard.service';

@Module({
  controllers: [MicroDashboardController],
  providers: [MicroDashboardService, PrismaService],
})
export class MicroDashboardModule {}