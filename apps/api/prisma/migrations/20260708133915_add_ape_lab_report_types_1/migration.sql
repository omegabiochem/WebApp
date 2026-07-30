-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('APE_VALIDATION_REPORT', 'APE_REPORT', 'SYSTEM_SUITABILITY_REPORT', 'ID_REPORT', 'ENVIRONMENTAL_REPORT');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "parentReportId" TEXT,
ADD COLUMN     "reportType" "ReportType";

-- CreateTable
CREATE TABLE "ApeValidationReportDetails" (
    "reportId" TEXT NOT NULL,
    "client" TEXT,
    "dateSent" TIMESTAMP(3),
    "typeOfTest" TEXT,
    "sampleType" TEXT,
    "formulaNo" TEXT,
    "description" TEXT,
    "lotNo" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "testSopNo" TEXT,
    "testReference" TEXT,
    "dateTested" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "validationSections" JSONB,
    "testedBy" TEXT,
    "testedDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedDate" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corrections" JSONB,
    "footerRevNo" TEXT,
    "footerDateEffective" TIMESTAMP(3),

    CONSTRAINT "ApeValidationReportDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "ApeReportDetails" (
    "reportId" TEXT NOT NULL,
    "client" TEXT,
    "dateSent" TIMESTAMP(3),
    "typeOfTest" TEXT,
    "sampleType" TEXT,
    "formulaNo" TEXT,
    "description" TEXT,
    "lotNo" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "testSopNo" TEXT,
    "testReference" TEXT,
    "dateTested" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "apeReportSections" JSONB,
    "testedBy" TEXT,
    "testedDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedDate" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corrections" JSONB,
    "footerRevNo" TEXT,
    "footerDateEffective" TIMESTAMP(3),

    CONSTRAINT "ApeReportDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateIndex
CREATE INDEX "Report_reportType_idx" ON "Report"("reportType");

-- CreateIndex
CREATE INDEX "Report_parentReportId_idx" ON "Report"("parentReportId");

-- CreateIndex
CREATE INDEX "Report_clientCode_reportType_idx" ON "Report"("clientCode", "reportType");

-- AddForeignKey
ALTER TABLE "ApeValidationReportDetails" ADD CONSTRAINT "ApeValidationReportDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApeReportDetails" ADD CONSTRAINT "ApeReportDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
