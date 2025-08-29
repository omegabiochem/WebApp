/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[inviteToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `inviteToken` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordVersion` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "inviteToken" TEXT NOT NULL,
ADD COLUMN     "inviteTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "passwordVersion" INTEGER NOT NULL,
ADD COLUMN     "tempPasswordExpiresAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "userIdSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "public"."User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "public"."User"("inviteToken");
