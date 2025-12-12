/*
  Warnings:

  - The `status` column on the `ChemistryMixDetails` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `ChemistryReport` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `ChemistryStatusHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChemistryReportStatus" AS ENUM ('DRAFT', 'SUBMITTED_BY_CLIENT', 'CLIENT_NEEDS_CORRECTION', 'UNDER_CLIENT_CORRECTION', 'RESUBMISSION_BY_CLIENT', 'UNDER_RESUBMISSION_TESTING_REVIEW', 'RECEIVED_BY_FRONTDESK', 'FRONTDESK_ON_HOLD', 'FRONTDESK_NEEDS_CORRECTION', 'UNDER_CLIENT_REVIEW', 'UNDER_TESTING_REVIEW', 'TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'RESUBMISSION_BY_TESTING', 'UNDER_QA_REVIEW', 'QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW', 'ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'UNDER_RESUBMISSION_ADMIN_REVIEW', 'APPROVED', 'LOCKED');

-- DropForeignKey
ALTER TABLE "ChemistryStatusHistory" DROP CONSTRAINT "ChemistryStatusHistory_chemistryId_fkey";

-- AlterTable
ALTER TABLE "ChemistryMixDetails" DROP COLUMN "status",
ADD COLUMN     "status" "ChemistryReportStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "ChemistryReport" DROP COLUMN "status",
ADD COLUMN     "status" "ChemistryReportStatus" NOT NULL DEFAULT 'DRAFT';

-- DropTable
DROP TABLE "ChemistryStatusHistory";

-- DropEnum
DROP TYPE "ChemistryStatus";

-- CreateTable
CREATE TABLE "ChemistryReportStatusHistory" (
    "id" TEXT NOT NULL,
    "chemistryId" TEXT NOT NULL,
    "from" "ChemistryReportStatus" NOT NULL,
    "to" "ChemistryReportStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "role" "UserRole",
    "ipAddress" TEXT,

    CONSTRAINT "ChemistryReportStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChemistryReportStatusHistory_chemistryId_createdAt_idx" ON "ChemistryReportStatusHistory"("chemistryId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChemistryReportStatusHistory" ADD CONSTRAINT "ChemistryReportStatusHistory_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
