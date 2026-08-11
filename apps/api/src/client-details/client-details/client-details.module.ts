import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { ClientDetailsController } from './client-details.controller';
import { ClientDetailsService } from './client-details.service';

@Module({
  controllers: [ClientDetailsController],
  providers: [
    PrismaService,
    ClientDetailsService,
  ],
  exports: [
    ClientDetailsService,
  ],
})
export class ClientDetailsModule {}