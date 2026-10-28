import { Module } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { MailModule } from 'src/mail/mail.module';
import { TestingInquiriesController } from './testing-inquiries.controller';
import { TestingInquiriesService } from './testing-inquiries.service';
import { TestingInquiriesAdminController } from './testing-inquiries-admin.controller';

@Module({
  imports: [MailModule],
  controllers: [TestingInquiriesController, TestingInquiriesAdminController],
  providers: [TestingInquiriesService, PrismaService],
})
export class TestingInquiriesModule {}
