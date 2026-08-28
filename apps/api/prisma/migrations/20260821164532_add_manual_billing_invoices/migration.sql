-- CreateEnum
CREATE TYPE "BillingInvoiceKind" AS ENUM ('REPORT', 'MANUAL');

-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "invoiceKind" "BillingInvoiceKind" NOT NULL DEFAULT 'REPORT';

-- CreateTable
CREATE TABLE "BillingManualInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingManualInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingManualInvoiceLine_invoiceId_idx" ON "BillingManualInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_invoiceKind_idx" ON "BillingInvoice"("invoiceKind");

-- AddForeignKey
ALTER TABLE "BillingManualInvoiceLine" ADD CONSTRAINT "BillingManualInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
