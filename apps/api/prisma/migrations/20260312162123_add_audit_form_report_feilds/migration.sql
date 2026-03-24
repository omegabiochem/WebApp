-- AlterTable
ALTER TABLE "AuditTrail" ADD COLUMN     "formNumber" TEXT,
ADD COLUMN     "formType" "FormType",
ADD COLUMN     "reportNumber" TEXT;

-- CreateIndex
CREATE INDEX "AuditTrail_formNumber_idx" ON "AuditTrail"("formNumber");

-- CreateIndex
CREATE INDEX "AuditTrail_reportNumber_idx" ON "AuditTrail"("reportNumber");

-- CreateIndex
CREATE INDEX "AuditTrail_formType_idx" ON "AuditTrail"("formType");

-- CreateIndex
CREATE INDEX "AuditTrail_entity_formNumber_idx" ON "AuditTrail"("entity", "formNumber");

-- CreateIndex
CREATE INDEX "AuditTrail_entity_reportNumber_idx" ON "AuditTrail"("entity", "reportNumber");
