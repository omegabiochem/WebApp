-- CreateEnum
CREATE TYPE "public"."TestingInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."TestingInquiryEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "public"."TestingInquiry" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "testingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productType" TEXT,
    "sampleCount" INTEGER,
    "requirements" TEXT NOT NULL,
    "turnaround" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "status" "public"."TestingInquiryStatus" NOT NULL DEFAULT 'NEW',
    "emailStatus" "public"."TestingInquiryEmailStatus" NOT NULL DEFAULT 'PENDING',
    "emailError" TEXT,
    "emailedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestingInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestingInquiry_reference_key" ON "public"."TestingInquiry"("reference");

-- CreateIndex
CREATE INDEX "TestingInquiry_createdAt_idx" ON "public"."TestingInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "TestingInquiry_status_createdAt_idx" ON "public"."TestingInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TestingInquiry_ipHash_createdAt_idx" ON "public"."TestingInquiry"("ipHash", "createdAt");
