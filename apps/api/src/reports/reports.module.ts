// import { Module } from '@nestjs/common';
// import { ReportsController } from './reports.controller';
// import { ReportsService } from './reports.service';

// @Module({
//   controllers: [ReportsController],
//   providers: [ReportsService],
// })
// export class ReportsModule {}


// import { Module } from '@nestjs/common';
// import { ReportsController } from './reports.controller';
// import { ReportsService } from './reports.service';

// @Module({
//   controllers: [ReportsController],
//   providers: [ReportsService],
// })
// export class ReportsModule {}
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsGateway } from './reports.gateway';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from 'src/auth/esign.service';
import { AttachmentsController } from 'src/attachments/attachments.controller';
import { AttachmentsService } from 'src/attachments/attachments.service';
import { StorageService } from 'src/storage/storage.service';
import { NotificationsModule } from 'src/notifications/report-notification.module';

@Module({
  imports:[NotificationsModule],
  controllers: [ReportsController,AttachmentsController],
  providers: [ReportsService,ReportsGateway,PrismaService,ESignService,AttachmentsService,StorageService],
})
export class ReportsModule {}
