import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingPaymentMethod, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { getRequestContext } from '../common/request-context';

type AuthUser = { userId: string; role: UserRole };
type PaymentInput = {
  amount: string | number;
  paidAt: string;
  method: BillingPaymentMethod;
  reference?: string;
  notes?: string;
};
const ALLOWED_METHODS: BillingPaymentMethod[] = [
  'ACH',
  'CHECK',
  'WIRE',
  'CASH',
  'CARD',
  'OTHER',
];

@Injectable()
export class BillingPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  private assertReader(user: AuthUser) {
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user?.role))
      throw new ForbiddenException('Billing access denied');
  }
  private assertManager(user: AuthUser) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user?.role))
      throw new ForbiddenException(
        'Payment changes require ADMIN or SYSTEMADMIN',
      );
  }

  async getSummary(user: AuthUser, invoiceId: string) {
    this.assertReader(user);
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const paid = invoice.payments
      .filter((p) => !p.reversedAt)
      .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
    const balance = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      invoice.total.minus(paid),
    );
    const paymentStatus =
      invoice.status === 'VOID'
        ? 'VOID'
        : paid.gte(invoice.total) && invoice.total.gt(0)
          ? 'PAID'
          : paid.gt(0)
            ? 'PARTIALLY_PAID'
            : 'UNPAID';
    return {
      invoiceId,
      total: invoice.total.toFixed(2),
      paid: paid.toFixed(2),
      balance: balance.toFixed(2),
      paymentStatus,
      payments: invoice.payments.map((p) => ({
        ...p,
        amount: p.amount.toFixed(2),
      })),
    };
  }

  async record(user: AuthUser, invoiceId: string, input: PaymentInput) {
    this.assertManager(user);
    const amount = new Prisma.Decimal(String(input?.amount ?? ''));
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2)
      throw new BadRequestException(
        'Enter a positive payment amount with no more than 2 decimals',
      );
    if (!ALLOWED_METHODS.includes(input?.method))
      throw new BadRequestException('Invalid payment method');
    const paidAt = new Date(input?.paidAt);
    if (!Number.isFinite(paidAt.getTime()))
      throw new BadRequestException('Valid payment date is required');
    return this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.billingInvoice.findUnique({
          where: { id: invoiceId },
          select: { id: true, status: true, total: true },
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        if (!['CONFIRMED', 'SENT'].includes(invoice.status))
          throw new BadRequestException(
            'Only confirmed or sent invoices accept payment',
          );
        const existing = await tx.billingInvoicePayment.aggregate({
          where: { invoiceId, reversedAt: null },
          _sum: { amount: true },
        });
        const current = existing._sum.amount ?? new Prisma.Decimal(0);
        if (current.plus(amount).gt(invoice.total))
          throw new BadRequestException(
            `Payment exceeds outstanding balance: $${invoice.total.minus(current).toFixed(2)}`,
          );
        const payment = await tx.billingInvoicePayment.create({
          data: {
            invoiceId,
            amount,
            paidAt,
            method: input.method,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            recordedBy: user.userId,
          },
        });
        const ctx = getRequestContext();
        await tx.auditTrail.create({
          data: {
            action: 'BILLING_PAYMENT_RECORDED',
            entity: 'BILLING_INVOICE',
            entityId: invoiceId,
            userId: user.userId,
            role: user.role,
            ipAddress: ctx?.ip ?? null,
            details: `Payment ${payment.id} recorded: $${amount.toFixed(2)}`,
            changes: {
              paymentId: payment.id,
              amount: amount.toFixed(2),
              method: input.method,
              paidAt: paidAt.toISOString(),
            },
          },
        });
        return { id: payment.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async reverse(
    user: AuthUser,
    invoiceId: string,
    paymentId: string,
    reason: string,
  ) {
    this.assertManager(user);
    if (!reason?.trim())
      throw new BadRequestException('Reversal reason is required');
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.billingInvoicePayment.findFirst({
          where: { id: paymentId, invoiceId },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.reversedAt)
          throw new BadRequestException('Payment already reversed');
        const updated = await tx.billingInvoicePayment.update({
          where: { id: paymentId },
          data: {
            reversedAt: new Date(),
            reversedBy: user.userId,
            reversalReason: reason.trim(),
          },
        });
        const ctx = getRequestContext();
        await tx.auditTrail.create({
          data: {
            action: 'BILLING_PAYMENT_REVERSED',
            entity: 'BILLING_INVOICE',
            entityId: invoiceId,
            userId: user.userId,
            role: user.role,
            ipAddress: ctx?.ip ?? null,
            details: `Payment ${paymentId} reversed`,
            changes: {
              paymentId,
              amount: payment.amount.toFixed(2),
              reason: reason.trim(),
            },
          },
        });
        return { id: updated.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Prior-month invoice balances eligible for optional carry-forward. */
  async previousOutstanding(user: AuthUser, targetInvoiceId: string) {
    this.assertReader(user);
    const target = await this.prisma.billingInvoice.findUnique({
      where: { id: targetInvoiceId },
      select: {
        id: true,
        clientCode: true,
        status: true,
        invoiceKind: true,
        periodStart: true,
      },
    });
    if (!target) throw new NotFoundException('Invoice not found');
    const sources = await this.prisma.billingInvoice.findMany({
      where: {
        clientCode: target.clientCode,
        status: { in: ['CONFIRMED', 'SENT'] },
        periodStart: { lt: target.periodStart },
        id: { not: target.id },
      },
      select: {
        id: true,
        invoiceNumber: true,
        periodStart: true,
        total: true,
        payments: { where: { reversedAt: null }, select: { amount: true } },
      },
      orderBy: { periodStart: 'desc' },
    });
    const imported = await this.prisma.billingManualInvoiceLine.findMany({
      where: {
        description: {
          startsWith: 'Previous Month Pending: Outstanding Invoice [',
        },
        invoice: { status: { not: 'VOID' } },
      },
      select: { description: true },
    });
    const importedIds = new Set(
      imported.flatMap((row) => {
        const match =
          /^Previous Month Pending: Outstanding Invoice \[([^\]]+)\]/.exec(
            row.description,
          );
        return match ? [match[1]] : [];
      }),
    );
    return {
      items: sources.flatMap((source) => {
        if (importedIds.has(source.id)) return [];
        const paid = source.payments.reduce(
          (sum, payment) => sum.plus(payment.amount),
          new Prisma.Decimal(0),
        );
        const balance = source.total.minus(paid);
        if (balance.lte(0)) return [];
        return [
          {
            invoiceId: source.id,
            invoiceNumber: source.invoiceNumber ?? source.id,
            periodStart: source.periodStart,
            total: source.total.toFixed(2),
            paid: paid.toFixed(2),
            balance: balance.toFixed(2),
          },
        ];
      }),
    };
  }

  /** Adds an explicit prior invoice balance as a manual last-month charge. */
  async carryForward(
    user: AuthUser,
    targetInvoiceId: string,
    sourceInvoiceId: string,
  ) {
    this.assertManager(user);
    if (!sourceInvoiceId)
      throw new BadRequestException('Source invoice is required');
    const result = await this.prisma.$transaction(
      async (tx) => {
        const [target, source] = await Promise.all([
          tx.billingInvoice.findUnique({ where: { id: targetInvoiceId } }),
          tx.billingInvoice.findUnique({
            where: { id: sourceInvoiceId },
            include: { payments: { where: { reversedAt: null } } },
          }),
        ]);
        if (!target || !source)
          throw new NotFoundException('Invoice not found');
        if (target.status !== 'DRAFT' || target.invoiceKind !== 'REPORT')
          throw new BadRequestException(
            'Target must be a draft report invoice',
          );
        if (
          source.clientCode !== target.clientCode ||
          !['SENT', 'CONFIRMED'].includes(source.status) ||
          source.periodStart >= target.periodStart ||
          source.id === target.id
        )
          throw new BadRequestException(
            'Select a finalized older invoice for the same client',
          );
        const existing = await tx.billingManualInvoiceLine.findFirst({
          where: {
            description: {
              startsWith: `Previous Month Pending: Outstanding Invoice [${source.id}]`,
            },
            invoice: { status: { not: 'VOID' } },
          },
        });
        if (existing)
          throw new BadRequestException(
            'This invoice balance has already been carried forward',
          );
        const paid = source.payments.reduce(
          (sum, payment) => sum.plus(payment.amount),
          new Prisma.Decimal(0),
        );
        const balance = source.total.minus(paid);
        if (balance.lte(0))
          throw new BadRequestException(
            'The source invoice has no outstanding balance',
          );
        const description = `Previous Month Pending: Previous Month Outstanding Balance – Invoice ${source.invoiceNumber ?? source.id}`;
        const line = await tx.billingManualInvoiceLine.create({
          data: {
            invoiceId: target.id,
            description,
            quantity: 1,
            unitPrice: balance,
            amount: balance,
            createdBy: user.userId,
            updatedBy: user.userId,
          },
        });
        await tx.billingInvoice.update({
          where: { id: target.id },
          data: {
            subtotal: { increment: balance },
            total: { increment: balance },
            updatedBy: user.userId,
          },
        });
        const ctx = getRequestContext();
        await tx.auditTrail.create({
          data: {
            action: 'OUTSTANDING_INVOICE_CARRIED_FORWARD',
            entity: 'BILLING_INVOICE',
            entityId: target.id,
            clientCode: target.clientCode,
            userId: user.userId,
            role: user.role,
            ipAddress: ctx?.ip ?? null,
            details: `Prior invoice ${source.invoiceNumber} outstanding balance of ${balance.toFixed(2)} added`,
            changes: {
              sourceInvoiceId: source.id,
              targetInvoiceId: target.id,
              manualLineId: line.id,
              amount: balance.toFixed(2),
            },
          },
        });
        return { lineId: line.id, amount: balance.toFixed(2) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return result;
  }
}
