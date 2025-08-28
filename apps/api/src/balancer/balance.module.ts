import { Module } from '@nestjs/common';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [BalanceController],
  providers: [BalanceService, PrismaService],
})
export class BalanceModule {}
