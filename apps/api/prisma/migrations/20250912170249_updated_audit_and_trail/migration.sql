/*
  Warnings:

  - Added the required column `entity` to the `AuditTrail` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AuditTrail" ADD COLUMN     "changes" JSONB,
ADD COLUMN     "entity" TEXT NOT NULL,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "role" "public"."UserRole";
