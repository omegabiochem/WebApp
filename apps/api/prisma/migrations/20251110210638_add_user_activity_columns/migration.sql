/*
  Warnings:

  - The values [MICRO_GENERAL,MICRO_GENERAL_WATER] on the enum `FormType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `MicroGeneralDetails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MicroGeneralWaterDetails` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FormType_new" AS ENUM ('MICRO_MIX', 'MICRO_MIX_WATER');
ALTER TABLE "Report" ALTER COLUMN "formType" TYPE "FormType_new" USING ("formType"::text::"FormType_new");
ALTER TYPE "FormType" RENAME TO "FormType_old";
ALTER TYPE "FormType_new" RENAME TO "FormType";
DROP TYPE "FormType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "MicroGeneralDetails" DROP CONSTRAINT "MicroGeneralDetails_reportId_fkey";

-- DropForeignKey
ALTER TABLE "MicroGeneralWaterDetails" DROP CONSTRAINT "MicroGeneralWaterDetails_reportId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActivityAt" TIMESTAMP(6),
ADD COLUMN     "lastLoginAt" TIMESTAMP(6);

-- DropTable
DROP TABLE "MicroGeneralDetails";

-- DropTable
DROP TABLE "MicroGeneralWaterDetails";
