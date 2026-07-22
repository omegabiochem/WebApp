-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'APE';

-- AlterTable
ALTER TABLE "DashboardReport" ADD COLUMN     "organisms" JSONB;

-- CreateTable
CREATE TABLE "ApeDetails" (
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
    "dateTested" TIMESTAMP(3),
    "preliminaryResults" TEXT,
    "preliminaryResultsDate" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "organisms" JSONB,
    "comments" TEXT,
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

    CONSTRAINT "ApeDetails_pkey" PRIMARY KEY ("reportId")
);

-- AddForeignKey
ALTER TABLE "ApeDetails" ADD CONSTRAINT "ApeDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
