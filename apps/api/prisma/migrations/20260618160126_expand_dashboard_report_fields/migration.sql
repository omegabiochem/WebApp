-- AlterTable
ALTER TABLE "DashboardReport" ADD COLUMN     "coaRows" JSONB,
ADD COLUMN     "coaVerification" BOOLEAN,
ADD COLUMN     "corrections" JSONB,
ADD COLUMN     "dateCompleted" TIMESTAMP(3),
ADD COLUMN     "detailCreatedAt" TIMESTAMP(3),
ADD COLUMN     "detailCreatedBy" TEXT,
ADD COLUMN     "detailLockedAt" TIMESTAMP(3),
ADD COLUMN     "detailStatus" TEXT,
ADD COLUMN     "detailUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "detailUpdatedBy" TEXT,
ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT,
ADD COLUMN     "ftm_observation" TEXT,
ADD COLUMN     "ftm_result" TEXT,
ADD COLUMN     "ftm_turbidity" TEXT,
ADD COLUMN     "pathogens" JSONB,
ADD COLUMN     "prefix" TEXT,
ADD COLUMN     "preliminaryResults" TEXT,
ADD COLUMN     "preliminaryResultsDate" TIMESTAMP(3),
ADD COLUMN     "reportNumberAssignedAt" TIMESTAMP(3),
ADD COLUMN     "reportNumberAssignedBy" TEXT,
ADD COLUMN     "reviewedDate" TIMESTAMP(3),
ADD COLUMN     "sampleCollected" JSONB,
ADD COLUMN     "sampleTypes" JSONB,
ADD COLUMN     "scdb_observation" TEXT,
ADD COLUMN     "scdb_result" TEXT,
ADD COLUMN     "scdb_turbidity" TEXT,
ADD COLUMN     "sourceCreatedBy" TEXT,
ADD COLUMN     "sourceLockedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUpdatedBy" TEXT,
ADD COLUMN     "stabilityNote" TEXT,
ADD COLUMN     "tbc_dilution" TEXT,
ADD COLUMN     "tbc_gram" TEXT,
ADD COLUMN     "tbc_result" TEXT,
ADD COLUMN     "tbc_spec" TEXT,
ADD COLUMN     "testSopNo" TEXT,
ADD COLUMN     "testTypes" JSONB,
ADD COLUMN     "testedDate" TIMESTAMP(3),
ADD COLUMN     "tmy_dilution" TEXT,
ADD COLUMN     "tmy_gram" TEXT,
ADD COLUMN     "tmy_result" TEXT,
ADD COLUMN     "tmy_spec" TEXT,
ADD COLUMN     "volumeTested" TEXT,
ADD COLUMN     "workflowRequestKind" TEXT,
ADD COLUMN     "workflowRequestedAt" TIMESTAMP(3),
ADD COLUMN     "workflowRequestedByRole" "UserRole",
ADD COLUMN     "workflowReturnStatus" TEXT;

-- CreateIndex
CREATE INDEX "DashboardReport_dateCompleted_idx" ON "DashboardReport"("dateCompleted");

-- CreateIndex
CREATE INDEX "DashboardReport_testedDate_idx" ON "DashboardReport"("testedDate");

-- CreateIndex
CREATE INDEX "DashboardReport_reviewedDate_idx" ON "DashboardReport"("reviewedDate");

-- CreateIndex
CREATE INDEX "DashboardReport_manufactureDate_idx" ON "DashboardReport"("manufactureDate");

-- CreateIndex
CREATE INDEX "DashboardReport_samplingDate_idx" ON "DashboardReport"("samplingDate");
