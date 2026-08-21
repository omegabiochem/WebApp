-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledBy" TEXT,
ADD COLUMN     "scheduledSendAt" TIMESTAMP(3),
ADD COLUMN     "scheduledToEmail" TEXT;

-- CreateTable
CREATE TABLE "BillingInvoiceExtraCharge" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sourceType" "BillingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "formNumber" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoiceExtraCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingInvoiceExtraCharge_invoiceId_idx" ON "BillingInvoiceExtraCharge"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoiceExtraCharge_invoiceId_sourceType_sourceId_idx" ON "BillingInvoiceExtraCharge"("invoiceId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_scheduledSendAt_idx" ON "BillingInvoice"("scheduledSendAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_status_scheduledSendAt_idx" ON "BillingInvoice"("status", "scheduledSendAt");

-- AddForeignKey
ALTER TABLE "BillingInvoiceExtraCharge" ADD CONSTRAINT "BillingInvoiceExtraCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
