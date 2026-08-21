-- DropForeignKey
ALTER TABLE "BillingInvoiceEmail" DROP CONSTRAINT "BillingInvoiceEmail_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "BillingInvoiceLine" DROP CONSTRAINT "BillingInvoiceLine_invoiceId_fkey";

-- AddForeignKey
ALTER TABLE "BillingInvoiceLine" ADD CONSTRAINT "BillingInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoiceEmail" ADD CONSTRAINT "BillingInvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
