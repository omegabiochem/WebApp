-- CreateIndex
CREATE INDEX "ChemistryReport_createdAt_idx" ON "ChemistryReport"("createdAt");

-- CreateIndex
CREATE INDEX "ChemistryReport_updatedAt_idx" ON "ChemistryReport"("updatedAt");

-- CreateIndex
CREATE INDEX "ChemistryReport_status_idx" ON "ChemistryReport"("status");

-- CreateIndex
CREATE INDEX "ChemistryReport_formType_idx" ON "ChemistryReport"("formType");

-- CreateIndex
CREATE INDEX "ChemistryReport_clientCode_idx" ON "ChemistryReport"("clientCode");

-- CreateIndex
CREATE INDEX "ChemistryReport_clientCode_createdAt_idx" ON "ChemistryReport"("clientCode", "createdAt");

-- CreateIndex
CREATE INDEX "ChemistryReport_clientCode_status_idx" ON "ChemistryReport"("clientCode", "status");

-- CreateIndex
CREATE INDEX "ChemistryReport_clientCode_formType_idx" ON "ChemistryReport"("clientCode", "formType");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "Report_updatedAt_idx" ON "Report"("updatedAt");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_formType_idx" ON "Report"("formType");

-- CreateIndex
CREATE INDEX "Report_clientCode_idx" ON "Report"("clientCode");

-- CreateIndex
CREATE INDEX "Report_clientCode_createdAt_idx" ON "Report"("clientCode", "createdAt");

-- CreateIndex
CREATE INDEX "Report_clientCode_status_idx" ON "Report"("clientCode", "status");

-- CreateIndex
CREATE INDEX "Report_clientCode_formType_idx" ON "Report"("clientCode", "formType");
