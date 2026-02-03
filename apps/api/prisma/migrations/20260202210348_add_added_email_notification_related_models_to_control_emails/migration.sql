-- CreateEnum
CREATE TYPE "ClientRecipientMode" AS ENUM ('USERS_ONLY', 'CUSTOM_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "ClientNotifyKind" AS ENUM ('REPORT_UPDATES', 'MESSAGES');

-- AlterTable
ALTER TABLE "ClientSequence" ADD COLUMN     "recipientMode" "ClientRecipientMode" NOT NULL DEFAULT 'USERS_ONLY';

-- CreateTable
CREATE TABLE "ClientNotificationRecipient" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "kind" "ClientNotifyKind" NOT NULL DEFAULT 'REPORT_UPDATES',
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientNotificationRecipient_clientCode_kind_idx" ON "ClientNotificationRecipient"("clientCode", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNotificationRecipient_clientCode_kind_email_key" ON "ClientNotificationRecipient"("clientCode", "kind", "email");
