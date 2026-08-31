import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import {
  BillingDepartment,
  BillingInvoiceStatus,
  BillingSourceType,
  FormType,
} from '@prisma/client';

import type { Request, Response } from 'express';

import { BillingPricingService } from './billing-pricing.service';
import { BillingService } from './billing.service';
import { BillingPdfService } from './billing-pdf.service';
import { BillingEmailService } from './billing-email.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingBackfillService } from './billing-backfill.service';

import { CreatePriceRuleDto } from './dto/create-price-rule.dto';
import { UpdatePriceRuleDto } from './dto/update-price-rule.dto';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { ConfirmInvoiceDto } from './dto/confirm-invoice.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly pricing: BillingPricingService,
    private readonly pdf: BillingPdfService,
    private readonly email: BillingEmailService,
    private readonly scheduler: BillingSchedulerService,
    private readonly backfill: BillingBackfillService,
  ) {}

  /* =========================================================
     SUMMARY
  ========================================================= */

  @Get('summary')
  getSummary(
    @Req() req: Request,
    @Query('month') month?: string,
    @Query('clientCode') clientCode?: string,
  ) {
    return this.billing.getSummary((req as any).user, {
      month,
      clientCode,
    });
  }

  /* =========================================================
     PRICING
  ========================================================= */

  /*
   * Client-name dropdown.
   *
   * The service first auto-discovers names from existing
   * Micro/Chemistry reports for this clientCode and then
   * returns the centralized directory.
   */
  @Get('client-names')
  listClientNames(
    @Req() req: Request,
    @Query('clientCode') clientCode: string,
  ) {
    return this.pricing.listClientNames(
      (req as any).user,
      clientCode,
    );
  }

  @Get('prices')
  listPrices(
    @Req() req: Request,
    @Query('clientCode') clientCode?: string,
    @Query('client') client?: string,
    @Query('department') department?: BillingDepartment,
    @Query('formType') formType?: FormType,
    @Query('active') active?: string,
  ) {
    return this.pricing.list((req as any).user, {
      clientCode,
      client,
      department,
      formType,
      active,
    });
  }

  @Post('prices')
  createPrice(
    @Req() req: Request,
    @Body() dto: CreatePriceRuleDto,
  ) {
    return this.pricing.create((req as any).user, dto);
  }

  @Delete('prices/:id')
  deletePriceRule(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.pricing.remove((req as any).user, id);
  }

  @Patch('prices/:id')
  updatePrice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePriceRuleDto,
  ) {
    return this.pricing.update((req as any).user, id, dto);
  }

  /* =========================================================
     UNBILLED
  ========================================================= */

  @Get('unbilled')
  getUnbilled(
    @Req() req: Request,
    @Query('month') month?: string,
    @Query('clientCode') clientCode?: string,
  ) {
    return this.billing.getUnbilled((req as any).user, {
      month,
      clientCode,
    });
  }

  /* =========================================================
     GENERATE DRAFTS

     Keep this route ABOVE invoices/:id.
  ========================================================= */

  @Post('invoices/generate')
  generateInvoices(
    @Req() req: Request,
    @Body() dto: GenerateInvoicesDto,
  ) {
    return this.billing.generateDraftInvoices((req as any).user, dto);
  }

  /* =========================================================
     MANUAL INVOICES
  ========================================================= */

  @Post('invoices/manual')
  createManualInvoice(
    @Req() req: Request,
    @Body()
    body: {
      clientCode: string;
      notes?: string;
    },
  ) {
    return this.billing.createManualInvoice(
      (req as any).user,
      body,
    );
  }

  @Post('invoices/:invoiceId/manual-lines')
  addManualInvoiceLine(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Body()
    body: {
      description: string;
      quantity: string | number;
      unitPrice: string | number;
    },
  ) {
    return this.billing.addManualInvoiceLine(
      (req as any).user,
      invoiceId,
      body,
    );
  }

  @Patch('invoices/:invoiceId/manual-lines/:lineId')
  updateManualInvoiceLine(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Param('lineId') lineId: string,
    @Body()
    body: {
      description?: string;
      quantity?: string | number;
      unitPrice?: string | number;
    },
  ) {
    return this.billing.updateManualInvoiceLine(
      (req as any).user,
      invoiceId,
      lineId,
      body,
    );
  }

  @Delete('invoices/:invoiceId/manual-lines/:lineId')
  deleteManualInvoiceLine(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Param('lineId') lineId: string,
  ) {
    return this.billing.deleteManualInvoiceLine(
      (req as any).user,
      invoiceId,
      lineId,
    );
  }

  /* =========================================================
     REFRESH PRICING
  ========================================================= */

  @Post('invoices/:id/refresh-pricing')
  refreshInvoicePricing(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.billing.refreshInvoicePricing((req as any).user, id);
  }

  /* =========================================================
     UPDATE DRAFT
  ========================================================= */

  @Patch('invoices/:id/draft')
  updateInvoiceDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
  ) {
    return this.billing.updateInvoiceDraft((req as any).user, id, dto);
  }

  /* =========================================================
     MANUAL PRICE OVERRIDE
  ========================================================= */

  @Patch('invoices/:invoiceId/lines/:lineId')
  overrideInvoiceLine(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateInvoiceLineDto,
  ) {
    return this.billing.overrideInvoiceLine(
      (req as any).user,
      invoiceId,
      lineId,
      dto,
    );
  }

  /* =========================================================
     REPORT-LEVEL ADDITIONAL CHARGES
  ========================================================= */

  @Post('invoices/:invoiceId/extra-charges')
  addInvoiceExtraCharge(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Body()
    body: {
      sourceType: BillingSourceType;
      sourceId: string;
      name: string;
      amount: string | number;
    },
  ) {
    return this.billing.addInvoiceExtraCharge(
      (req as any).user,
      invoiceId,
      body,
    );
  }

  @Patch('invoices/:invoiceId/extra-charges/:chargeId')
  updateInvoiceExtraCharge(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Param('chargeId') chargeId: string,
    @Body()
    body: {
      name?: string;
      amount?: string | number;
    },
  ) {
    return this.billing.updateInvoiceExtraCharge(
      (req as any).user,
      invoiceId,
      chargeId,
      body,
    );
  }

  @Delete('invoices/:invoiceId/extra-charges/:chargeId')
  deleteInvoiceExtraCharge(
    @Req() req: Request,
    @Param('invoiceId') invoiceId: string,
    @Param('chargeId') chargeId: string,
  ) {
    return this.billing.deleteInvoiceExtraCharge(
      (req as any).user,
      invoiceId,
      chargeId,
    );
  }

  /* =========================================================
     CONFIRM
  ========================================================= */

  @Post('invoices/:id/confirm')
  confirmInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ConfirmInvoiceDto,
  ) {
    return this.billing.confirmInvoice((req as any).user, id, dto);
  }

  /* =========================================================
     REOPEN CONFIRMED INVOICE
  ========================================================= */

  @Post('invoices/:id/reopen')
  reopenConfirmedInvoice(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.billing.reopenConfirmedInvoice(
      (req as any).user,
      id,
    );
  }

  /* =========================================================
     CREATE REVISION FROM SENT INVOICE
  ========================================================= */

  @Post('invoices/:id/revise')
  createInvoiceRevision(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.billing.createInvoiceRevision(
      (req as any).user,
      id,
    );
  }

  /* =========================================================
     INVOICE LIST
  ========================================================= */

  @Get('invoices')
  listInvoices(
    @Req() req: Request,
    @Query('month') month?: string,
    @Query('clientCode') clientCode?: string,
    @Query('status') status?: BillingInvoiceStatus,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.billing.listInvoices((req as any).user, {
      month,
      clientCode,
      status,
      page,
      perPage,
    });
  }

  /* =========================================================
     GENERATE / REGENERATE PDF
  ========================================================= */

  @Post('invoices/:id/pdf')
  generateInvoicePdf(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.pdf.generate((req as any).user, id);
  }

  /* =========================================================
     VIEW / DOWNLOAD PDF
  ========================================================= */

  @Get('invoices/:id/pdf')
  async getInvoicePdf(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Query('download') download?: string,
  ) {
    const result = await this.pdf.getStoredPdf((req as any).user, id);

    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `${
        download === '1' || download === 'true'
          ? 'attachment'
          : 'inline'
      }; filename="${result.filename.replace(/"/g, '')}"`,
    );

    if (result.size != null) {
      res.setHeader('Content-Length', String(result.size));
    }

    if (result.checksum) {
      res.setHeader('ETag', `"${result.checksum}"`);
    }

    result.stream.on('error', (error) => {
      console.error('Invoice PDF stream error:', error);

      if (!res.headersSent) {
        res.status(500);
      }

      res.end();
    });

    result.stream.pipe(res);
  }

  /* =========================================================
     SEND NOW / RESEND
  ========================================================= */

  @Post('invoices/:id/send')
  sendInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SendInvoiceDto,
  ) {
    return this.email.sendInvoice((req as any).user, id, body);
  }

  /* =========================================================
     SCHEDULE / RESCHEDULE / CANCEL SEND
  ========================================================= */

  @Post('invoices/:id/schedule-send')
  scheduleInvoiceSend(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      scheduledSendAt: string;
      toEmail?: string;
    },
  ) {
    return this.email.scheduleInvoice((req as any).user, id, body);
  }

  @Delete('invoices/:id/schedule-send')
  cancelInvoiceSendSchedule(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.email.cancelScheduledInvoice((req as any).user, id);
  }

  /* =========================================================
     VOID INVOICE
  ========================================================= */

  @Post('invoices/:id/void')
  voidInvoice(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: VoidInvoiceDto,
  ) {
    return this.billing.voidInvoice((req as any).user, id, body);
  }

  /* =========================================================
     MANUAL BILLING SCHEDULER TEST
  ========================================================= */

  @Post('scheduler/run')
  runBillingScheduler(
    @Req() req: Request,
    @Body()
    body: {
      month?: string;
    },
  ) {
    return this.scheduler.runManual((req as any).user, body?.month);
  }

  /* =========================================================
     BACKFILL
  ========================================================= */

  @Get('backfill/preview')
  previewBillingBackfill(@Req() req: Request) {
    return this.backfill.preview((req as any).user);
  }

  @Post('backfill/apply')
  applyBillingBackfill(@Req() req: Request) {
    return this.backfill.apply((req as any).user);
  }

  /* =========================================================
     INVOICE DETAIL
  ========================================================= */

  @Get('invoices/:id')
  getInvoice(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    return this.billing.getInvoice((req as any).user, id);
  }
}
