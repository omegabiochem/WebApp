-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QA_APPROVED', 'LOCKED');

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "dateSent" TIMESTAMP(3),
    "testType" TEXT,
    "sampleType" TEXT,
    "formulaNo" TEXT,
    "description" TEXT,
    "lotNo" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "testSop" TEXT,
    "dateTested" TIMESTAMP(3),
    "preliminaryResults" TEXT,
    "preliminaryDate" TIMESTAMP(3),
    "dateCompleted" TIMESTAMP(3),
    "totalBacterialCount" TEXT,
    "totalMoldYeastCount" TEXT,
    "pathogen_ecoli" TEXT,
    "pathogen_paeruginosa" TEXT,
    "pathogen_saureus" TEXT,
    "pathogen_salmonella" TEXT,
    "pathogen_clostridia" TEXT,
    "pathogen_calbicans" TEXT,
    "pathogen_bcepacia" TEXT,
    "pathogen_other" TEXT,
    "comments" TEXT,
    "testedByUserId" TEXT,
    "testedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
