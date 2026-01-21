-- AlterTable
ALTER TABLE "ChemistryReport" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
