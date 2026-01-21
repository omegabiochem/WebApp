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

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { ChemistryAttachmentsModule } from './attachments/chemistryattachments.module';
import { RequestContextMiddleware } from './common/context.middleware';
import { FaviconController } from './favicon.controller';
import { MessagesModule } from './messages/messages.module';

import { AttachmentsGlobalModule } from './attachments/attachments.global.module';

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
    ChemistryReportsModule,
    ChemistryAttachmentsModule,
    MessagesModule,
    AttachmentsGlobalModule
  ],
  controllers: [HealthController, FaviconController],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    PrismaService,
    ESignService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
