import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { QaDashboardController } from './qa-dashboard.controller';
import { QaDashboardService } from './qa-dashboard.service';

@Module({
  controllers: [QaDashboardController],
  providers: [QaDashboardService, PrismaService],
})
export class QaDashboardModule {}