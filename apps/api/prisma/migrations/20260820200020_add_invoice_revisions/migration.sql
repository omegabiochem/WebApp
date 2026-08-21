/*
  Warnings:

  - A unique constraint covering the columns `[revisionOfInvoiceId,revisionNumber]` on the table `BillingInvoice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "revisionNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisionOfInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "BillingInvoice_revisionOfInvoiceId_idx" ON "BillingInvoice"("revisionOfInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_revisionOfInvoiceId_revisionNumber_key" ON "BillingInvoice"("revisionOfInvoiceId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_revisionOfInvoiceId_fkey" FOREIGN KEY ("revisionOfInvoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
