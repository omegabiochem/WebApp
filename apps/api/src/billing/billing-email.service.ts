import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
  UserRole,
} from '@prisma/client';

import type { Readable } from 'stream';

import { PrismaService } from 'prisma/prisma.service';

import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { getRequestContext } from '../common/request-context';

import { SendInvoiceDto } from './dto/send-invoice.dto';
import { BillingPdfService } from './billing-pdf.service';

type AuthUser = {
  userId: string;
  role: UserRole;
};

@Injectable()
export class BillingEmailService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly mail:
      MailService,

    private readonly storage:
      StorageService,

    private readonly pdf:
      BillingPdfService,
  ) {}

  /* =========================================================
     AUTH
  ========================================================= */

  private assertSender(
    user: AuthUser,
  ) {
    if (
      ![
        'FRONTDESK',
        'ADMIN',
        'SYSTEMADMIN',
      ].includes(user.role)
    ) {
      throw new ForbiddenException(
        'You do not have permission to send invoices',
      );
    }
  }

  /* =========================================================
     HELPERS
  ========================================================= */

  private normalizeEmail(
    value:
      | string
      | null
      | undefined,
  ) {
    return String(
      value ?? '',
    )
      .trim()
      .toLowerCase();
  }

  private async streamToBuffer(
    stream: Readable,
  ): Promise<Buffer> {
    const chunks:
      Buffer[] = [];

    for await (
      const chunk of stream
    ) {
      chunks.push(
        Buffer.isBuffer(
          chunk,
        )
          ? chunk
          : Buffer.from(
              chunk,
            ),
      );
    }

    return Buffer.concat(
      chunks,
    );
  }

  private errorMessage(
    error: any,
  ) {
    return String(
      error?.message ??
        error ??
        'Unknown email error',
    ).slice(
      0,
      4000,
    );
  }


  private addDays(
    value: Date,
    days: number,
  ) {
    return new Date(
      value.getTime() +
        days * 24 * 60 * 60 * 1000,
    );
  }

  /* =========================================================
     AUDIT
  ========================================================= */

  private async audit(
    user: AuthUser,
    args: {
      action: string;
      invoiceId: string;
      clientCode: string;
      details: string;
      changes?: Record<
        string,
        any
      >;
    },
  ) {
    const ctx =
      getRequestContext();

    await this.prisma.auditTrail.create({
      data: {
        action:
          args.action,

        entity:
          'BILLING_INVOICE',

        entityId:
          args.invoiceId,

        userId:
          user.userId,

        role:
          user.role,

        ipAddress:
          ctx?.ip ??
          null,

        clientCode:
          args.clientCode,

        details:
          args.details,

        changes:
          (args.changes ??
            {}) as Prisma.InputJsonValue,
      },
    });
  }

  /* =========================================================
     SCHEDULE / CANCEL SEND
  ========================================================= */

  async scheduleInvoice(
    user: AuthUser,
    invoiceId: string,
    dto: {
      scheduledSendAt: string | Date;
      toEmail?: string;
    },
  ) {
    this.assertSender(user);

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Only CONFIRMED invoices can be scheduled for sending',
      );
    }

    if (!invoice.invoiceNumber) {
      throw new BadRequestException('Invoice number is missing');
    }

    const scheduledSendAt = new Date(dto?.scheduledSendAt);

    if (Number.isNaN(scheduledSendAt.getTime())) {
      throw new BadRequestException('scheduledSendAt must be a valid date/time');
    }

    if (scheduledSendAt.getTime() <= Date.now() + 30_000) {
      throw new BadRequestException(
        'Scheduled send time must be in the future',
      );
    }

    const toEmail = this.normalizeEmail(
      dto?.toEmail || invoice.billingEmail,
    );

    if (!toEmail) {
      throw new BadRequestException(
        'Invoice has no billing email. Provide toEmail.',
      );
    }

    const dueDate = this.addDays(scheduledSendAt, 30);
    const now = new Date();

    await this.prisma.billingInvoice.update({
      where: {
        id: invoice.id,
      },
      data: {
        dueDate,
        scheduledSendAt,
        scheduledToEmail: toEmail,
        scheduledBy: user.userId,
        scheduledAt: now,
        updatedBy: user.userId,
      },
    });

    /*
     * Regenerate the preview immediately so the scheduled due
     * date appears in the PDF. The scheduled worker regenerates
     * once more at actual delivery time before sending.
     */
    await this.pdf.generateForDelivery(user, invoice.id);

    await this.audit(user, {
      action: invoice.scheduledSendAt
        ? 'INVOICE_SEND_RESCHEDULED'
        : 'INVOICE_SEND_SCHEDULED',
      invoiceId: invoice.id,
      clientCode: invoice.clientCode,
      details: `${
        invoice.scheduledSendAt ? 'Rescheduled' : 'Scheduled'
      } ${invoice.invoiceNumber} for ${scheduledSendAt.toISOString()}`,
      changes: {
        scheduledSendAt: scheduledSendAt.toISOString(),
        scheduledToEmail: toEmail,
        dueDate: dueDate.toISOString(),
      },
    });

    return this.prisma.billingInvoice.findUnique({
      where: {
        id: invoice.id,
      },
    });
  }

  async cancelScheduledInvoice(
    user: AuthUser,
    invoiceId: string,
  ) {
    this.assertSender(user);

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'CONFIRMED') {
      throw new BadRequestException(
        'Only CONFIRMED invoices can have a scheduled send cancelled',
      );
    }

    if (!invoice.scheduledSendAt) {
      throw new BadRequestException('Invoice does not have a scheduled send');
    }

    const previousSchedule = invoice.scheduledSendAt;
    const previousRecipient = invoice.scheduledToEmail;

    await this.prisma.billingInvoice.update({
      where: {
        id: invoice.id,
      },
      data: {
        dueDate: null,
        scheduledSendAt: null,
        scheduledToEmail: null,
        scheduledBy: null,
        scheduledAt: null,
        updatedBy: user.userId,
      },
    });

    /*
     * Remove the scheduled due date from the current preview.
     * A future Send Now or Schedule Send will create the final due date.
     */
    await this.pdf.generateForDelivery(user, invoice.id);

    await this.audit(user, {
      action: 'INVOICE_SEND_SCHEDULE_CANCELLED',
      invoiceId: invoice.id,
      clientCode: invoice.clientCode,
      details: `Cancelled scheduled send for ${invoice.invoiceNumber}`,
      changes: {
        previousScheduledSendAt: previousSchedule.toISOString(),
        previousScheduledToEmail: previousRecipient,
      },
    });

    return this.prisma.billingInvoice.findUnique({
      where: {
        id: invoice.id,
      },
    });
  }

  /* =========================================================
     SEND
  ========================================================= */

  async sendInvoice(
    user: AuthUser,
    invoiceId: string,
    dto: SendInvoiceDto,
  ) {
    this.assertSender(
      user,
    );

    const invoice =
      await this.prisma.billingInvoice.findUnique({
        where: {
          id:
            invoiceId,
        },
      });

    if (!invoice) {
      throw new NotFoundException(
        'Invoice not found',
      );
    }

    /*
     * DRAFT and VOID can never be emailed
     * as official invoices.
     */
    if (
      invoice.status !==
        'CONFIRMED' &&
      invoice.status !==
        'SENT'
    ) {
      throw new BadRequestException(
        'Only CONFIRMED invoices can be sent',
      );
    }

    /*
     * Explicit resend protection.
     */
    if (
      invoice.status ===
        'SENT' &&
      dto.resend !== true
    ) {
      throw new BadRequestException(
        'Invoice has already been sent. Set resend=true to send it again.',
      );
    }

    if (
      !invoice.invoiceNumber
    ) {
      throw new BadRequestException(
        'Invoice number is missing',
      );
    }

    /*
     * Default to confirmed billing-email snapshot.
     *
     * Admin/frontdesk may override recipient explicitly
     * when necessary.
     */
    const toEmail =
      this.normalizeEmail(
        dto.toEmail ||
          invoice.billingEmail,
      );

    if (!toEmail) {
      throw new BadRequestException(
        'Invoice has no billing email. Provide toEmail.',
      );
    }

    const ccEmails =
      Array.from(
        new Set(
          (
            dto.ccEmails ??
            []
          )
            .map(
              (email) =>
                this.normalizeEmail(
                  email,
                ),
            )
            .filter(Boolean),
        ),
      );

    const subject =
      dto.subject?.trim() ||
      `Invoice ${invoice.invoiceNumber} - Omega BioChem Lab`;

    const messageBody =
      dto.messageBody?.trim() ||
      `Please find attached invoice ${invoice.invoiceNumber} for your records.

If you have any questions regarding this invoice, please contact Omega BioChem Lab.`;

    /*
     * Initial delivery gets its due date from the actual send attempt.
     * The final PDF is regenerated immediately before Postmark delivery.
     *
     * Resends keep the original SENT PDF and original due date.
     */
    let deliveryInvoice = invoice;
    const initialDeliveryAt = new Date();

    if (invoice.status === 'CONFIRMED') {
      const dueDate = this.addDays(initialDeliveryAt, 30);

      await this.prisma.billingInvoice.update({
        where: {
          id: invoice.id,
        },
        data: {
          dueDate,
          updatedBy: user.userId,
        },
      });

      await this.pdf.generateForDelivery(user, invoice.id);

      const refreshed = await this.prisma.billingInvoice.findUnique({
        where: {
          id: invoice.id,
        },
      });

      if (!refreshed) {
        throw new NotFoundException('Invoice not found after PDF generation');
      }

      deliveryInvoice = refreshed;
    }

    if (
      !deliveryInvoice.pdfStorageKey ||
      !deliveryInvoice.pdfFilename ||
      !deliveryInvoice.pdfChecksum ||
      !deliveryInvoice.pdfCreatedAt
    ) {
      throw new BadRequestException(
        'Invoice PDF is not available for delivery',
      );
    }

    /*
     * Read the EXACT PDF saved on the invoice.
     */
    let pdfBuffer:
      Buffer;

    try {
      const stream =
        await this.storage.createReadStream(
          deliveryInvoice.pdfStorageKey,
        );

      pdfBuffer =
        await this.streamToBuffer(
          stream,
        );
    } catch (error: any) {
      throw new BadRequestException(
        `Unable to read invoice PDF: ${this.errorMessage(
          error,
        )}`,
      );
    }

    if (
      pdfBuffer.length ===
      0
    ) {
      throw new BadRequestException(
        'Stored invoice PDF is empty',
      );
    }

    try {
      /*
       * Postmark happens FIRST.
       *
       * Invoice only becomes SENT after
       * Postmark accepts the message.
       */
      const result =
        await this.mail.sendInvoiceEmail({
          to:
            toEmail,

          cc:
            ccEmails,

          subject,

          messageBody,

          invoiceId:
            invoice.id,

          invoiceNumber:
            invoice.invoiceNumber,

          clientCode:
            invoice.clientCode,

          attachment: {
            filename:
              deliveryInvoice.pdfFilename,

            content:
              pdfBuffer,
          },
        });

      const emailAcceptedAt = new Date();

      const invoiceSentAt =
        invoice.status === 'SENT'
          ? invoice.sentAt ?? emailAcceptedAt
          : initialDeliveryAt;

      /*
       * Persist history + invoice status atomically
       * after successful Postmark acceptance.
       */
      const transactionResult =
        await this.prisma.$transaction(
          async (tx) => {
            const email =
              await tx.billingInvoiceEmail.create({
                data: {
                  invoiceId:
                    invoice.id,

                  toEmail,

                  ccEmails,

                  subject,

                  messageBody,

                  status:
                    'SENT',

                  provider:
                    'POSTMARK',

                  providerMessageId:
                    result.MessageID ??
                    null,

                  sentBy:
                    user.userId,

                  sentAt:
                    emailAcceptedAt,

                  error:
                    null,
                },
              });

            const updatedInvoice =
              await tx.billingInvoice.update({
                where: {
                  id:
                    invoice.id,
                },

                data: {
                  status:
                    'SENT',

                  sentAt:
                    invoiceSentAt,

                  sentBy:
                    user.userId,

                  dueDate:
                    deliveryInvoice.dueDate,

                  scheduledSendAt:
                    null,

                  scheduledToEmail:
                    null,

                  scheduledBy:
                    null,

                  scheduledAt:
                    null,

                  updatedBy:
                    user.userId,
                },
              });

            return {
              email,
              updatedInvoice,
            };
          },
        );

      await this.audit(
        user,
        {
          action:
            invoice.status ===
            'SENT'
              ? 'INVOICE_RESENT'
              : 'INVOICE_SENT',

          invoiceId:
            invoice.id,

          clientCode:
            invoice.clientCode,

          details:
            `${
              invoice.status ===
              'SENT'
                ? 'Resent'
                : 'Sent'
            } ${invoice.invoiceNumber} to ${toEmail}`,

          changes: {
            toEmail,

            ccEmails,

            provider:
              'POSTMARK',

            providerMessageId:
              result.MessageID ??
              null,

            pdfChecksum:
              deliveryInvoice.pdfChecksum,
          },
        },
      );

      return {
        invoiceId:
          invoice.id,

        invoiceNumber:
          invoice.invoiceNumber,

        status:
          transactionResult.updatedInvoice.status,

        toEmail,

        ccEmails,

        subject,

        provider:
          'POSTMARK',

        providerMessageId:
          result.MessageID ??
          null,

        sentAt:
          invoiceSentAt,

        emailAcceptedAt,

        dueDate:
          transactionResult.updatedInvoice.dueDate,

        emailHistoryId:
          transactionResult.email.id,

        resent:
          invoice.status ===
          'SENT',
      };
    } catch (error: any) {
      const errorText =
        this.errorMessage(
          error,
        );

      /*
       * Record failed Postmark attempt.
       *
       * Most importantly:
       * DO NOT change invoice.status.
       */
      await this.prisma.billingInvoiceEmail
        .create({
          data: {
            invoiceId:
              invoice.id,

            toEmail,

            ccEmails,

            subject,

            messageBody,

            status:
              'FAILED',

            provider:
              'POSTMARK',

            providerMessageId:
              null,

            sentBy:
              user.userId,

            sentAt:
              null,

            error:
              errorText,
          },
        })
        .catch(() => undefined);

      await this.audit(
        user,
        {
          action:
            'INVOICE_EMAIL_FAILED',

          invoiceId:
            invoice.id,

          clientCode:
            invoice.clientCode,

          details:
            `Failed to send ${invoice.invoiceNumber} to ${toEmail}`,

          changes: {
            toEmail,

            ccEmails,

            error:
              errorText,
          },
        },
      ).catch(
        () =>
          undefined,
      );

      throw new BadRequestException(
        `Invoice email failed: ${errorText}`,
      );
    }
  }
}