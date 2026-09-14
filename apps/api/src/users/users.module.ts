// src/users/users.module.ts

import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { MailModule } from '../mail/mail.module';
import { NotificationModule } from '../notifications/inAppNotifications/notification.module';
import { RolesGuard } from 'src/common/roles.guard';


@Module({
  imports: [
    MailModule,
    NotificationModule,
  ],

  controllers: [
    UsersController,
  ],

  providers: [
    UsersService,
    PrismaService,
    RolesGuard,
  ],

  exports: [
    UsersService,
  ],
})
export class UsersModule {}