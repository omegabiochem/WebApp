-- AlterTable
ALTER TABLE "COADetails" ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT;

-- AlterTable
ALTER TABLE "ChemistryMixDetails" ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT;

-- AlterTable
ALTER TABLE "MicroMixDetails" ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT;

-- AlterTable
ALTER TABLE "MicroMixWaterDetails" ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT;

-- AlterTable
ALTER TABLE "sterilityDetails" ADD COLUMN     "footerDateEffective" TIMESTAMP(3),
ADD COLUMN     "footerRevNo" TEXT;
