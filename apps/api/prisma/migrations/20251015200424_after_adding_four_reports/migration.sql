/*
  Warnings:

  - You are about to drop the `MicroMixReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('MICRO_GENERAL', 'MICRO_GENERAL_WATER', 'MICRO_MIX', 'MICRO_MIX_WATER');

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_reportId_fkey";

-- DropForeignKey
ALTER TABLE "StatusHistory" DROP CONSTRAINT "StatusHistory_reportId_fkey";

-- DropTable
DROP TABLE "MicroMixReport";

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "formNumber" TEXT NOT NULL,
    "reportNumber" TEXT,
    "prefix" TEXT NOT NULL DEFAULT 'M',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formType" "FormType" NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicroMixDetails" (
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
    "tbc_dilution" TEXT,
    "tbc_gram" TEXT,
    "tbc_result" TEXT,
    "tbc_spec" TEXT,
    "tmy_dilution" TEXT,
    "tmy_gram" TEXT,
    "tmy_result" TEXT,
    "tmy_spec" TEXT,
    "pathogens" JSONB,
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

    CONSTRAINT "MicroMixDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "MicroMixWaterDetails" (
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
    "tbc_dilution" TEXT,
    "tbc_gram" TEXT,
    "tbc_result" TEXT,
    "tbc_spec" TEXT,
    "tmy_dilution" TEXT,
    "tmy_gram" TEXT,
    "tmy_result" TEXT,
    "tmy_spec" TEXT,
    "pathogens" JSONB,
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

    CONSTRAINT "MicroMixWaterDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "MicroGeneralDetails" (
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
    "tbc_dilution" TEXT,
    "tbc_gram" TEXT,
    "tbc_result" TEXT,
    "tbc_spec" TEXT,
    "tmy_dilution" TEXT,
    "tmy_gram" TEXT,
    "tmy_result" TEXT,
    "tmy_spec" TEXT,
    "pathogens" JSONB,
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

    CONSTRAINT "MicroGeneralDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "MicroGeneralWaterDetails" (
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
    "tbc_dilution" TEXT,
    "tbc_gram" TEXT,
    "tbc_result" TEXT,
    "tbc_spec" TEXT,
    "tmy_dilution" TEXT,
    "tmy_gram" TEXT,
    "tmy_result" TEXT,
    "tmy_spec" TEXT,
    "pathogens" JSONB,
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

    CONSTRAINT "MicroGeneralWaterDetails_pkey" PRIMARY KEY ("reportId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_formNumber_key" ON "Report"("formNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reportNumber_key" ON "Report"("reportNumber");

-- AddForeignKey
ALTER TABLE "MicroMixDetails" ADD CONSTRAINT "MicroMixDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroMixWaterDetails" ADD CONSTRAINT "MicroMixWaterDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroGeneralDetails" ADD CONSTRAINT "MicroGeneralDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicroGeneralWaterDetails" ADD CONSTRAINT "MicroGeneralWaterDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
