/*
  Warnings:

  - The primary key for the `ChemistryMixDetails` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `ChemistryMixDetails` table. All the data in the column will be lost.
  - You are about to drop the column `testType` on the `ChemistryMixDetails` table. All the data in the column will be lost.
  - Added the required column `reportId` to the `ChemistryMixDetails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ChemistryMixDetails` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SampleType" AS ENUM ('BULK', 'FINISHED_GOOD', 'RAW_MATERIAL', 'PROCESS_VALIDATION', 'CLEANING_VALIDATION', 'COMPOSITE', 'DI_WATER_SAMPLE');

-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'CHEMISTRY_MIX';

-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'CONTENT_UNIFORMITY';

-- AlterTable
ALTER TABLE "ChemistryMixDetails" DROP CONSTRAINT "ChemistryMixDetails_pkey",
DROP COLUMN "id",
DROP COLUMN "testType",
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "corrections" JSONB,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "formulaId" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lotBatchNo" TEXT,
ADD COLUMN     "manufactureDate" TIMESTAMP(3),
ADD COLUMN     "numberOfActives" TEXT,
ADD COLUMN     "reportId" TEXT NOT NULL,
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "reviewedDate" TIMESTAMP(3),
ADD COLUMN     "sampleSize" TEXT,
ADD COLUMN     "sampleTypes" "SampleType"[],
ADD COLUMN     "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "testTypes" "TestType"[],
ADD COLUMN     "testedBy" TEXT,
ADD COLUMN     "testedDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedBy" TEXT,
ADD CONSTRAINT "ChemistryMixDetails_pkey" PRIMARY KEY ("reportId");

-- CreateTable
CREATE TABLE "ChemistryMixActive" (
    "id" TEXT NOT NULL,
    "chemistryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "sopNo" TEXT,
    "formulaPct" DECIMAL(10,4),
    "resultPct" DECIMAL(10,4),
    "dateTestInit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemistryMixActive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChemistryMixActive_chemistryId_idx" ON "ChemistryMixActive"("chemistryId");

-- AddForeignKey
ALTER TABLE "ChemistryMixActive" ADD CONSTRAINT "ChemistryMixActive_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryMixDetails"("reportId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemistryMixDetails" ADD CONSTRAINT "ChemistryMixDetails_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
