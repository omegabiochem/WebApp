-- AlterTable
ALTER TABLE "User" ADD COLUMN     "refreshTokenExpAt" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT,
ADD COLUMN     "refreshTokenRotatedAt" TIMESTAMP(3);
