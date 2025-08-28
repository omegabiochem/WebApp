/*
  Warnings:

  - You are about to drop the `AuditTrail` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BalanceReading` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED_BY_CLIENT', 'CLIENT_NEEDS_CORRECTION', 'RECEIVED_BY_FRONTDESK', 'FRONTDESK_ON_HOLD', 'FRONTDESK_REJECTED', 'UNDER_TESTING_REVIEW', 'TESTING_ON_HOLD', 'TESTING_REJECTED', 'UNDER_QA_REVIEW', 'QA_NEEDS_CORRECTION', 'QA_REJECTED', 'UNDER_ADMIN_REVIEW', 'ADMIN_NEEDS_CORRECTION', 'ADMIN_REJECTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SYSTEMADMIN', 'ADMIN', 'FRONTDESK', 'MICRO', 'CHEMISTRY', 'QA', 'CLIENT');

-- DropTable
DROP TABLE "public"."AuditTrail";

-- DropTable
DROP TABLE "public"."BalanceReading";

-- CreateTable
CREATE TABLE "public"."MicroMixReport" (
    "id" TEXT NOT NULL,
    "reportNumber" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'M',
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
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroMixReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'CLIENT',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sample" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sampleCode" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicroMixReport_reportNumber_key" ON "public"."MicroMixReport"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_sampleCode_key" ON "public"."Sample"("sampleCode");
