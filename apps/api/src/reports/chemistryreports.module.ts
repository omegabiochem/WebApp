import { Module } from '@nestjs/common';
import { ChemistryReportsService } from './chemistryreports.service';
import { ChemistryReportsController } from './chemistryreports.controller';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from 'src/auth/esign.service';
import { ChemistryAttachmentsService } from 'src/attachments/chemistryattachments.service';
import { StorageService } from 'src/storage/storage.service';
import { NotificationsModule } from 'src/notifications/report-notification.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChemistryReportsController],
  providers: [
    ChemistryReportsService,
    PrismaService,
    ESignService,
    ChemistryAttachmentsService,
    StorageService,
  ],
})
export class ChemistryReportsModule {}
