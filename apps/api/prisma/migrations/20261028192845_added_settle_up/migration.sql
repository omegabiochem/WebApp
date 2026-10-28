-- CreateEnum
CREATE TYPE "public"."BillingPaymentMethod" AS ENUM ('ACH', 'CHECK', 'WIRE', 'CASH', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "public"."BillingInvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" "public"."BillingPaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "BillingInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingInvoicePayment_invoiceId_createdAt_idx" ON "public"."BillingInvoicePayment"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoicePayment_invoiceId_reversedAt_idx" ON "public"."BillingInvoicePayment"("invoiceId", "reversedAt");

-- AddForeignKey
ALTER TABLE "public"."BillingInvoicePayment" ADD CONSTRAINT "BillingInvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
