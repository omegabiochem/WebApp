-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "clientCode" TEXT;

-- CreateTable
CREATE TABLE "public"."ClientSequence" (
    "clientCode" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientSequence_pkey" PRIMARY KEY ("clientCode")
);
