import { Module } from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { ChemistryReportsController } from './chemistryreports.controller';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from 'src/auth/esign.service';

@Module({
  controllers: [ChemistryReportsController],
  providers: [ChemistryReportsService, PrismaService,ESignService],
})
export class ChemistryReportsModule {}
