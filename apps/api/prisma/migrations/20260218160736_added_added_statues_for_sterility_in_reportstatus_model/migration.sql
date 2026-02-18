-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_TESTING_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'TESTING_ON_HOLD';
ALTER TYPE "ReportStatus" ADD VALUE 'TESTING_NEEDS_CORRECTION';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_CLIENT_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'CLIENT_NEEDS_CORRECTION';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_CLIENT_CORRECTION';
ALTER TYPE "ReportStatus" ADD VALUE 'RESUBMISSION_BY_CLIENT';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_RESUBMISSION_TESTING_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_QA_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'QA_NEEDS_CORRECTION';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_RESUBMISSION_ADMIN_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_RESUBMISSION_QA_REVIEW';
ALTER TYPE "ReportStatus" ADD VALUE 'APPROVED';

