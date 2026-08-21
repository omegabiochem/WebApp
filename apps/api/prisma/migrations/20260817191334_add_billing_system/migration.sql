-- CreateEnum
CREATE TYPE "BillingDepartment" AS ENUM ('MICRO', 'CHEMISTRY');

-- CreateEnum
CREATE TYPE "BillingPriceBasis" AS ENUM ('FLAT', 'PER_ACTIVE');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SENT', 'VOID');

-- CreateEnum
CREATE TYPE "BillingSourceType" AS ENUM ('REPORT', 'CHEMISTRY_REPORT');

-- CreateEnum
CREATE TYPE "BillingEmailStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "ChemistryReport" ADD COLUMN     "billingReadyAt" TIMESTAMP(3),
ADD COLUMN     "resultSentToClientAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClientDetails" ADD COLUMN     "billingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingStartAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "billingReadyAt" TIMESTAMP(3),
ADD COLUMN     "resultSentToClientAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingPriceRule" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "department" "BillingDepartment" NOT NULL,
    "formType" "FormType" NOT NULL,
    "testKey" TEXT NOT NULL,
    "testLabel" TEXT,
    "activeCount" INTEGER,
    "priceBasis" "BillingPriceBasis" NOT NULL DEFAULT 'FLAT',
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "clientCode" TEXT NOT NULL,
    "activeKey" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "clientName" TEXT,
    "clientLegalName" TEXT,
    "billingContactName" TEXT,
    "billingEmail" TEXT,
    "billingPhone" TEXT,
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,
    "pdfFilename" TEXT,
    "pdfStorageKey" TEXT,
    "pdfStorageBucket" TEXT,
    "pdfChecksum" TEXT,
    "pdfCreatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sourceType" "BillingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chargeKey" TEXT NOT NULL,
    "activeChargeKey" TEXT,
    "formType" "FormType" NOT NULL,
    "formNumber" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "resultSentToClientAt" TIMESTAMP(3),
    "billingReadyAt" TIMESTAMP(3) NOT NULL,
    "testKey" TEXT NOT NULL,
    "testLabel" TEXT,
    "activeCount" INTEGER,
    "priceBasis" "BillingPriceBasis" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "pricingRuleId" TEXT,
    "pricingIssue" TEXT,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "manualOverrideReason" TEXT,
    "manualOverrideBy" TEXT,
    "manualOverrideAt" TIMESTAMP(3),
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoiceEmail" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "messageBody" TEXT,
    "status" "BillingEmailStatus" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'POSTMARK',
    "providerMessageId" TEXT,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingInvoiceEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoiceSequence" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillingInvoiceSequence_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_idx" ON "BillingPriceRule"("clientCode");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_formType_idx" ON "BillingPriceRule"("clientCode", "formType");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_formType_testKey_idx" ON "BillingPriceRule"("clientCode", "formType", "testKey");

-- CreateIndex
CREATE INDEX "BillingPriceRule_clientCode_formType_testKey_activeCount_idx" ON "BillingPriceRule"("clientCode", "formType", "testKey", "activeCount");

-- CreateIndex
CREATE INDEX "BillingPriceRule_effectiveFrom_idx" ON "BillingPriceRule"("effectiveFrom");

-- CreateIndex
CREATE INDEX "BillingPriceRule_active_idx" ON "BillingPriceRule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_activeKey_key" ON "BillingInvoice"("activeKey");

-- CreateIndex
CREATE INDEX "BillingInvoice_clientCode_idx" ON "BillingInvoice"("clientCode");

-- CreateIndex
CREATE INDEX "BillingInvoice_periodStart_periodEnd_idx" ON "BillingInvoice"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BillingInvoice_clientCode_periodStart_idx" ON "BillingInvoice"("clientCode", "periodStart");

-- CreateIndex
CREATE INDEX "BillingInvoice_status_idx" ON "BillingInvoice"("status");

-- CreateIndex
CREATE INDEX "BillingInvoice_createdAt_idx" ON "BillingInvoice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoiceLine_activeChargeKey_key" ON "BillingInvoiceLine"("activeChargeKey");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_invoiceId_idx" ON "BillingInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_sourceType_sourceId_idx" ON "BillingInvoiceLine"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_chargeKey_idx" ON "BillingInvoiceLine"("chargeKey");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_clientCode_idx" ON "BillingInvoiceLine"("clientCode");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_formType_idx" ON "BillingInvoiceLine"("formType");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_billingReadyAt_idx" ON "BillingInvoiceLine"("billingReadyAt");

-- CreateIndex
CREATE INDEX "BillingInvoiceEmail_invoiceId_createdAt_idx" ON "BillingInvoiceEmail"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoiceEmail_status_idx" ON "BillingInvoiceEmail"("status");

-- CreateIndex
CREATE INDEX "BillingInvoiceEmail_providerMessageId_idx" ON "BillingInvoiceEmail"("providerMessageId");

-- CreateIndex
CREATE INDEX "ChemistryReport_billingReadyAt_idx" ON "ChemistryReport"("billingReadyAt");

-- CreateIndex
CREATE INDEX "ChemistryReport_clientCode_billingReadyAt_idx" ON "ChemistryReport"("clientCode", "billingReadyAt");

-- CreateIndex
CREATE INDEX "Report_billingReadyAt_idx" ON "Report"("billingReadyAt");

-- CreateIndex
CREATE INDEX "Report_clientCode_billingReadyAt_idx" ON "Report"("clientCode", "billingReadyAt");

-- AddForeignKey
ALTER TABLE "BillingInvoiceLine" ADD CONSTRAINT "BillingInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoiceEmail" ADD CONSTRAINT "BillingInvoiceEmail_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
