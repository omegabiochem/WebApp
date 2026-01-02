/*
  Warnings:

  - You are about to drop the `ChemistryMixActive` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ChemistryMixActive" DROP CONSTRAINT "ChemistryMixActive_chemistryId_fkey";

-- AlterTable
ALTER TABLE "ChemistryMixDetails" ADD COLUMN     "actives" JSONB;

-- DropTable
DROP TABLE "ChemistryMixActive";
