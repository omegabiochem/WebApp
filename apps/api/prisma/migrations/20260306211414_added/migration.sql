-- AlterTable
ALTER TABLE "ChemistryReport" ADD COLUMN     "ReportnumberAssignedAt" TIMESTAMP(3),
ADD COLUMN     "ReportnumberAssignedBy" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "ReportnumberAssignedAt" TIMESTAMP(3),
ADD COLUMN     "ReportnumberAssignedBy" TEXT;
