/*
  Warnings:

  - Added the required column `kind` to the `ChemistryAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChemistryAttachment" ADD COLUMN     "kind" "AttachmentKind" NOT NULL;
