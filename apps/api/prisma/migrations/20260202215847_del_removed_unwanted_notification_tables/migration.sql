/*
  Warnings:

  - You are about to drop the column `recipientMode` on the `ClientSequence` table. All the data in the column will be lost.
  - You are about to drop the `ClientNotificationRecipient` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ClientNotificationSetting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClientNotificationRecipient" DROP CONSTRAINT "ClientNotificationRecipient_clientCode_fkey";

-- AlterTable
ALTER TABLE "ClientSequence" DROP COLUMN "recipientMode";

-- DropTable
DROP TABLE "ClientNotificationRecipient";

-- DropTable
DROP TABLE "ClientNotificationSetting";

-- DropEnum
DROP TYPE "ClientNotifyKind";

-- DropEnum
DROP TYPE "ClientRecipientMode";
