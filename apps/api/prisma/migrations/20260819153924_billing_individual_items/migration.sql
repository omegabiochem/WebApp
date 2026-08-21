-- AlterTable
ALTER TABLE "BillingInvoiceLine" ADD COLUMN     "itemKey" TEXT,
ADD COLUMN     "itemLabel" TEXT;

-- AlterTable
ALTER TABLE "BillingPriceRule" ADD COLUMN     "itemKey" TEXT,
ADD COLUMN     "itemLabel" TEXT;

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_testKey_itemKey_idx" ON "BillingInvoiceLine"("testKey", "itemKey");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_formType_testKey_itemKey_idx" ON "BillingPriceRule"("clientCode", "formType", "testKey", "itemKey");
