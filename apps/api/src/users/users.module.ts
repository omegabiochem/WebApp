// import { Module } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { UsersController } from './users.controller';
// import { PrismaService } from 'prisma/prisma.service';
// import { MailModule } from 'src/mail/mail.module';

// @Module({
//   imports: [MailModule],
//   providers: [UsersService, PrismaService],
//   controllers: [UsersController],
// })
// export class UsersModule {}
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
