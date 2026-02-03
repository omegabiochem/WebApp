-- AlterTable
ALTER TABLE "ClientNotificationRecipient" ALTER COLUMN "kind" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ClientNotificationSetting" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "mode" "ClientRecipientMode" NOT NULL DEFAULT 'USERS_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientNotificationSetting_clientCode_key" ON "ClientNotificationSetting"("clientCode");

-- AddForeignKey
ALTER TABLE "ClientNotificationRecipient" ADD CONSTRAINT "ClientNotificationRecipient_clientCode_fkey" FOREIGN KEY ("clientCode") REFERENCES "ClientNotificationSetting"("clientCode") ON DELETE CASCADE ON UPDATE CASCADE;
