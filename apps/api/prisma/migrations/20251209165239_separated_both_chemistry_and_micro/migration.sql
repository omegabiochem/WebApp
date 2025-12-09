/*
  Warnings:

  - The primary key for the `ChemistryMixDetails` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `reportId` on the `ChemistryMixDetails` table. All the data in the column will be lost.
  - The `status` column on the `ChemistryMixDetails` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `chemistryId` to the `ChemistryMixDetails` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ChemistryStatus" AS ENUM ('DRAFT', 'SUBMITTED_BY_CLIENT', 'CLIENT_NEEDS_CORRECTION', 'UNDER_CLIENT_CORRECTION', 'RESUBMISSION_BY_CLIENT', 'RECEIVED_BY_FRONTDESK', 'FRONTDESK_ON_HOLD', 'FRONTDESK_NEEDS_CORRECTION', 'UNDER_CLIENT_REVIEW', 'UNDER_TESTING_REVIEW', 'TESTING_ON_HOLD', 'TESTING_NEEDS_CORRECTION', 'RESUBMISSION_BY_TESTING', 'UNDER_QA_REVIEW', 'QA_NEEDS_CORRECTION', 'UNDER_ADMIN_REVIEW', 'ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'UNDER_RESUBMISSION_ADMIN_REVIEW', 'APPROVED', 'LOCKED');

-- DropForeignKey
ALTER TABLE "ChemistryMixActive" DROP CONSTRAINT "ChemistryMixActive_chemistryId_fkey";

-- DropForeignKey
ALTER TABLE "ChemistryMixDetails" DROP CONSTRAINT "ChemistryMixDetails_reportId_fkey";

-- AlterTable
ALTER TABLE "ChemistryMixDetails" DROP CONSTRAINT "ChemistryMixDetails_pkey",
DROP COLUMN "reportId",
ADD COLUMN     "chemistryId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ChemistryStatus" NOT NULL DEFAULT 'DRAFT',
ADD CONSTRAINT "ChemistryMixDetails_pkey" PRIMARY KEY ("chemistryId");

-- CreateTable
CREATE TABLE "ChemistryReport" (
    "id" TEXT NOT NULL,
    "formNumber" TEXT NOT NULL,
    "reportNumber" TEXT,
    "prefix" TEXT NOT NULL DEFAULT 'BC',
    "status" "ChemistryStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formType" "FormType" NOT NULL DEFAULT 'CHEMISTRY_MIX',

    CONSTRAINT "ChemistryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemistryStatusHistory" (
    "id" TEXT NOT NULL,
    "chemistryId" TEXT NOT NULL,
    "from" "ChemistryStatus" NOT NULL,
    "to" "ChemistryStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "role" "UserRole",
    "ipAddress" TEXT,

    CONSTRAINT "ChemistryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemistryAttachment" (
    "id" TEXT NOT NULL,
    "chemistryId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "pages" INTEGER,
    "source" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ChemistryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChemistryReport_formNumber_key" ON "ChemistryReport"("formNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChemistryReport_reportNumber_key" ON "ChemistryReport"("reportNumber");

-- CreateIndex
CREATE INDEX "ChemistryStatusHistory_chemistryId_createdAt_idx" ON "ChemistryStatusHistory"("chemistryId", "createdAt");

-- CreateIndex
CREATE INDEX "ChemistryAttachment_chemistryId_idx" ON "ChemistryAttachment"("chemistryId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemistryAttachment_chemistryId_checksum_key" ON "ChemistryAttachment"("chemistryId", "checksum");

-- AddForeignKey
ALTER TABLE "ChemistryMixDetails" ADD CONSTRAINT "ChemistryMixDetails_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemistryMixActive" ADD CONSTRAINT "ChemistryMixActive_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryMixDetails"("chemistryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemistryStatusHistory" ADD CONSTRAINT "ChemistryStatusHistory_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemistryAttachment" ADD CONSTRAINT "ChemistryAttachment_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
