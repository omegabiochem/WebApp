-- AlterTable
ALTER TABLE "AuditTrail" ADD COLUMN     "clientCode" TEXT;

-- CreateIndex
CREATE INDEX "AuditTrail_clientCode_createdAt_idx" ON "AuditTrail"("clientCode", "createdAt");
