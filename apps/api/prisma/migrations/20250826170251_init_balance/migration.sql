/*
  Warnings:

  - You are about to drop the `MicroMixReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Sample` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "public"."MicroMixReport";

-- DropTable
DROP TABLE "public"."Sample";

-- DropTable
DROP TABLE "public"."User";

-- DropEnum
DROP TYPE "public"."ReportStatus";

-- DropEnum
DROP TYPE "public"."UserRole";

-- CreateTable
CREATE TABLE "public"."BalanceReading" (
    "id" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "BalanceReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditTrail" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);
