-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'STERILITY';

-- CreateTable
CREATE TABLE "sterilityDetails" (
    "reportId" TEXT NOT NULL,
    "client" TEXT,
    "dateSent" TIMESTAMP(3),
    "typeOfTest" TEXT,
    "sampleType" TEXT,
    "formulaNo" TEXT,
    "description" TEXT,
    "lotNo" TEXT,
    "volumeTested" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "testSopNo" TEXT,
    "dateTested" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "ftm_turbidity" TEXT,
    "scdb_turbidity" TEXT,
    "ftm_observation" TEXT,
    "scdb_observation" TEXT,
    "ftm_result" TEXT,
    "scdb_result" TEXT,
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

    CONSTRAINT "sterilityDetails_pkey" PRIMARY KEY ("reportId")
);

-- AddForeignKey
ALTER TABLE "sterilityDetails" ADD CONSTRAINT "sterilityDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
