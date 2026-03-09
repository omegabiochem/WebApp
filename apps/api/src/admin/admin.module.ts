import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CommonAccountsController } from './common-accounts.controller';
import { CommonAccountsService } from './common-accounts.service';

@Module({
  controllers: [AdminController, CommonAccountsController],
  providers: [PrismaService, AdminService, CommonAccountsService],
})
export class AdminModule {}
