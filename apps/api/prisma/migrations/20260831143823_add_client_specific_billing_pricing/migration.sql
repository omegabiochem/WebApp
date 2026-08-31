-- DropIndex
DROP INDEX "public"."BillingInvoiceLine_clientCode_idx";

-- AlterTable
ALTER TABLE "public"."BillingInvoiceLine" ADD COLUMN     "client" TEXT;

-- AlterTable
ALTER TABLE "public"."BillingPriceRule" ADD COLUMN     "client" TEXT;

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_clientCode_client_idx" ON "public"."BillingInvoiceLine"("clientCode", "client");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_client_idx" ON "public"."BillingPriceRule"("clientCode", "client");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_client_formType_idx" ON "public"."BillingPriceRule"("clientCode", "client", "formType");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_client_formType_testKey_idx" ON "public"."BillingPriceRule"("clientCode", "client", "formType", "testKey");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_client_formType_testKey_itemKey_idx" ON "public"."BillingPriceRule"("clientCode", "client", "formType", "testKey", "itemKey");
