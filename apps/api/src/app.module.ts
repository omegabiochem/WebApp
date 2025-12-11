// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { AuthModule } from './auth/auth.module';

// @Module({
//   imports: [AuthModule],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SamplesModule } from './samples/samples.module';
import { JwtStrategy } from './common/jwt.strategy';
import { UsersModule } from './users/users.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './common/roles.guard';
import { ReportsModule } from './reports/reports.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { BalanceModule } from './balancer/balance.module';
import { PrismaService } from 'prisma/prisma.service';
import { ESignService } from './auth/esign.service';
import { AuditModule } from './audit/audit.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { HealthController } from './health.controller';
import { ChemistryReportsModule } from './reports/chemistryreports.module';



@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    SamplesModule,
    UsersModule,
    ReportsModule,
    BalanceModule,
    AuditModule,
    AttachmentsModule,
    ChemistryReportsModule
  ],
  controllers: [HealthController],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }, PrismaService, ESignService
  ],
})
export class AppModule { }

