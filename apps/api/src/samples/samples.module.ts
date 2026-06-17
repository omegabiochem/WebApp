import { Module } from '@nestjs/common';
import { SamplesService } from './samples.service';
import { SamplesController } from './samples.controller';
import { PrismaService } from 'prisma/prisma.service';
import { IdleTimeoutGuard } from 'src/common/idle-timeout.guard';

@Module({
  controllers: [SamplesController],
  providers: [SamplesService,PrismaService, IdleTimeoutGuard],
})
export class SamplesModule {}
