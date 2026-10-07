-- CreateEnum
CREATE TYPE "public"."ApeReportResult" AS ENUM ('PASS', 'FAIL');

-- AlterTable
ALTER TABLE "public"."ApeReportDetails" ADD COLUMN     "result" "public"."ApeReportResult" NOT NULL DEFAULT 'PASS';
