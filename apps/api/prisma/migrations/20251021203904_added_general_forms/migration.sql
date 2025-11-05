/*
  Warnings:

  - You are about to drop the column `formulaNo` on the `MicroGeneralWaterDetails` table. All the data in the column will be lost.
  - You are about to drop the column `manufactureDate` on the `MicroGeneralWaterDetails` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MicroGeneralWaterDetails" DROP COLUMN "formulaNo",
DROP COLUMN "manufactureDate",
ADD COLUMN     "idNo" TEXT,
ADD COLUMN     "samplingDate" TIMESTAMP(3);
