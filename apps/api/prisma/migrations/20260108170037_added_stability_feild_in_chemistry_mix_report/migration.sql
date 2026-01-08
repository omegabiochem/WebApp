-- AlterEnum
ALTER TYPE "SampleType" ADD VALUE 'STABILITY';

-- AlterTable
ALTER TABLE "ChemistryMixDetails" ADD COLUMN     "stabilityNote" TEXT;
