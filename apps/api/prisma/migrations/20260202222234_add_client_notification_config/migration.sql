-- CreateEnum
CREATE TYPE "ClientNotifyMode" AS ENUM ('USERS_ONLY', 'CUSTOM_ONLY', 'USERS_PLUS_CUSTOM');

-- CreateTable
CREATE TABLE "ClientNotificationConfig" (
    "clientCode" TEXT NOT NULL,
    "mode" "ClientNotifyMode" NOT NULL DEFAULT 'USERS_PLUS_CUSTOM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNotificationConfig_pkey" PRIMARY KEY ("clientCode")
);

-- CreateTable
CREATE TABLE "ClientNotificationEmail" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNotificationEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientNotificationConfig_mode_idx" ON "ClientNotificationConfig"("mode");

-- CreateIndex
CREATE INDEX "ClientNotificationEmail_clientCode_active_idx" ON "ClientNotificationEmail"("clientCode", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNotificationEmail_clientCode_email_key" ON "ClientNotificationEmail"("clientCode", "email");

-- AddForeignKey
ALTER TABLE "ClientNotificationEmail" ADD CONSTRAINT "ClientNotificationEmail_clientCode_fkey" FOREIGN KEY ("clientCode") REFERENCES "ClientNotificationConfig"("clientCode") ON DELETE CASCADE ON UPDATE CASCADE;
