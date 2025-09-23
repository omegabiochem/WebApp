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

@Module({
  controllers: [ReportsController],
  providers: [ReportsService,ReportsGateway,PrismaService,ESignService],
})
export class ReportsModule {}
