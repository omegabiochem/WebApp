-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChemistryReportStatus" ADD VALUE 'CHANGE_REQUESTED';
ALTER TYPE "ChemistryReportStatus" ADD VALUE 'UNDER_CHANGE_UPDATE';
ALTER TYPE "ChemistryReportStatus" ADD VALUE 'CORRECTION_REQUESTED';
ALTER TYPE "ChemistryReportStatus" ADD VALUE 'UNDER_CORRECTION_UPDATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportStatus" ADD VALUE 'CHANGE_REQUESTED';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_CHANGE_UPDATE';
ALTER TYPE "ReportStatus" ADD VALUE 'CORRECTION_REQUESTED';
ALTER TYPE "ReportStatus" ADD VALUE 'UNDER_CORRECTION_UPDATE';

-- AlterTable
ALTER TABLE "ChemistryReport" ADD COLUMN     "workflowRequestKind" TEXT,
ADD COLUMN     "workflowRequestedAt" TIMESTAMP(3),
ADD COLUMN     "workflowRequestedByRole" "UserRole",
ADD COLUMN     "workflowReturnStatus" "ChemistryReportStatus";

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "workflowRequestKind" TEXT,
ADD COLUMN     "workflowRequestedAt" TIMESTAMP(3),
ADD COLUMN     "workflowRequestedByRole" "UserRole",
ADD COLUMN     "workflowReturnStatus" "ReportStatus";
