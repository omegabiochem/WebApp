-- CreateIndex
CREATE INDEX "AuditTrail_entity_entityId_createdAt_idx" ON "public"."AuditTrail"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditTrail_userId_createdAt_idx" ON "public"."AuditTrail"("userId", "createdAt");
