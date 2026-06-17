import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ClientDashboardController } from './client-dashboard.controller';
import { ClientDashboardService } from './client-dashboard.service';

@Module({
  controllers: [ClientDashboardController],
  providers: [ClientDashboardService, PrismaService],
})
export class ClientDashboardModule {}