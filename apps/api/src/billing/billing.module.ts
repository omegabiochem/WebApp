import { Module } from '@nestjs/common';

import { PrismaService } from 'prisma/prisma.service';

import { StorageService } from '../storage/storage.service';

import { BillingController } from './billing.controller';
import { BillingPricingService } from './billing-pricing.service';
import { BillingService } from './billing.service';
import { BillingPdfService } from './billing-pdf.service';
import { MailModule } from 'src/mail/mail.module';
import { BillingEmailService } from './billing-email.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingBackfillService } from './billing-backfill.service';

@Module({
  imports: [MailModule],

  controllers: [BillingController],

  providers: [
    PrismaService,
    StorageService,

    BillingPricingService,
    BillingService,
    BillingPdfService,
    BillingEmailService,
    BillingSchedulerService,
    BillingBackfillService,
  ],

  exports: [
    BillingPricingService,
    BillingService,
    BillingPdfService,
    BillingEmailService,
    BillingBackfillService,
  ],
})
export class BillingModule {}
