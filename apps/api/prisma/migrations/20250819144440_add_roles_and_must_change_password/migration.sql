/*
  Warnings:

  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SYSTEMADMIN', 'ADMIN', 'FRONTDESK', 'MICRO', 'CHEMISTRY', 'QA', 'CLIENT');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "role",
ADD COLUMN     "role" "public"."UserRole" NOT NULL DEFAULT 'CLIENT';
