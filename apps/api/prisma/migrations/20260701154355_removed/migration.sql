/*
  Warnings:

  - You are about to drop the column `preliminaryResults` on the `ApeDetails` table. All the data in the column will be lost.
  - You are about to drop the column `preliminaryResultsDate` on the `ApeDetails` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ApeDetails" DROP COLUMN "preliminaryResults",
DROP COLUMN "preliminaryResultsDate";
