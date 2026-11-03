-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "isDirect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
