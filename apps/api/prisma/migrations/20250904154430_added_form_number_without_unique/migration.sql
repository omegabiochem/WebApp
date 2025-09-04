/*
  Warnings:

  - Added the required column `formNumber` to the `MicroMixReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."MicroMixReport" ADD COLUMN     "formNumber" TEXT NOT NULL;
