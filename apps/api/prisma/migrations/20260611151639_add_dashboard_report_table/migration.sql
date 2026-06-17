-- CreateTable
CREATE TABLE "DashboardReport" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "formNumber" TEXT,
    "reportNumber" TEXT,
    "client" TEXT,
    "clientCode" TEXT,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dateSent" TIMESTAMP(3),
    "dateTested" TIMESTAMP(3),
    "dateReceived" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "typeOfTest" TEXT,
    "sampleType" TEXT,
    "formulaNo" TEXT,
    "description" TEXT,
    "lotNo" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "sampleDescription" TEXT,
    "lotBatchNo" TEXT,
    "formulaId" TEXT,
    "sampleSize" TEXT,
    "numberOfActives" TEXT,
    "comments" TEXT,
    "idNo" TEXT,
    "samplingDate" TIMESTAMP(3),
    "testedBy" TEXT,
    "reviewedBy" TEXT,
    "searchableText" TEXT,

    CONSTRAINT "DashboardReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardReport_sourceType_idx" ON "DashboardReport"("sourceType");

-- CreateIndex
CREATE INDEX "DashboardReport_formType_idx" ON "DashboardReport"("formType");

-- CreateIndex
CREATE INDEX "DashboardReport_status_idx" ON "DashboardReport"("status");

-- CreateIndex
CREATE INDEX "DashboardReport_clientCode_idx" ON "DashboardReport"("clientCode");

-- CreateIndex
CREATE INDEX "DashboardReport_client_idx" ON "DashboardReport"("client");

-- CreateIndex
CREATE INDEX "DashboardReport_formNumber_idx" ON "DashboardReport"("formNumber");

-- CreateIndex
CREATE INDEX "DashboardReport_reportNumber_idx" ON "DashboardReport"("reportNumber");

-- CreateIndex
CREATE INDEX "DashboardReport_dateSent_idx" ON "DashboardReport"("dateSent");

-- CreateIndex
CREATE INDEX "DashboardReport_dateTested_idx" ON "DashboardReport"("dateTested");

-- CreateIndex
CREATE INDEX "DashboardReport_dateReceived_idx" ON "DashboardReport"("dateReceived");

-- CreateIndex
CREATE INDEX "DashboardReport_createdAt_idx" ON "DashboardReport"("createdAt");

-- CreateIndex
CREATE INDEX "DashboardReport_updatedAt_idx" ON "DashboardReport"("updatedAt");

-- CreateIndex
CREATE INDEX "DashboardReport_clientCode_dateSent_idx" ON "DashboardReport"("clientCode", "dateSent");

-- CreateIndex
CREATE INDEX "DashboardReport_clientCode_createdAt_idx" ON "DashboardReport"("clientCode", "createdAt");

-- CreateIndex
CREATE INDEX "DashboardReport_formType_dateSent_idx" ON "DashboardReport"("formType", "dateSent");

-- CreateIndex
CREATE INDEX "DashboardReport_status_dateSent_idx" ON "DashboardReport"("status", "dateSent");

-- CreateIndex
CREATE INDEX "DashboardReport_formType_status_dateSent_idx" ON "DashboardReport"("formType", "status", "dateSent");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardReport_sourceType_sourceId_key" ON "DashboardReport"("sourceType", "sourceId");
