import { Module } from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { ChemistryReportsController } from './chemistryreports.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [ChemistryReportsController],
  providers: [ChemistryReportsService, PrismaService],
})
export class ChemistryReportsModule {}
