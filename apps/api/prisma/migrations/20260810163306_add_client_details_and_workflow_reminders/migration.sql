-- CreateEnum
CREATE TYPE "WorkflowReminderSourceType" AS ENUM ('REPORT', 'CHEMISTRY_REPORT');

-- CreateEnum
CREATE TYPE "WorkflowReminderTargetSide" AS ENUM ('CLIENT', 'LAB', 'APPROVAL_TEAM');

-- CreateEnum
CREATE TYPE "WorkflowReminderKind" AS ENUM ('CHANGE', 'CORRECTION');

-- CreateTable
CREATE TABLE "ClientDetails" (
    "clientCode" TEXT NOT NULL,
    "name" TEXT,
    "legalName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "secondaryContactName" TEXT,
    "secondaryContactEmail" TEXT,
    "secondaryContactPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'USA',
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "workdayStartMinutes" INTEGER NOT NULL DEFAULT 540,
    "workdayEndMinutes" INTEGER NOT NULL DEFAULT 1020,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "workflowReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "workflowReminderIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "workflowReminderMaxCount" INTEGER NOT NULL DEFAULT 10,
    "billingContactName" TEXT,
    "billingEmail" TEXT,
    "billingPhone" TEXT,
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostalCode" TEXT,
    "billingCountry" TEXT,
    "paymentTerms" TEXT,
    "accountManager" TEXT,
    "notes" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientDetails_pkey" PRIMARY KEY ("clientCode")
);

-- CreateTable
CREATE TABLE "WorkflowReminder" (
    "id" TEXT NOT NULL,
    "sourceType" "WorkflowReminderSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "formNumber" TEXT NOT NULL,
    "clientCode" TEXT,
    "expectedStatus" TEXT NOT NULL,
    "requestKind" "WorkflowReminderKind",
    "requestedByRole" "UserRole",
    "targetSide" "WorkflowReminderTargetSide" NOT NULL,
    "activeKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReminderAt" TIMESTAMP(3) NOT NULL,
    "lastReminderAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "maxReminders" INTEGER NOT NULL DEFAULT 10,
    "claimedAt" TIMESTAMP(3),
    "claimKey" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientDetails_name_idx" ON "ClientDetails"("name");

-- CreateIndex
CREATE INDEX "ClientDetails_active_idx" ON "ClientDetails"("active");

-- CreateIndex
CREATE INDEX "ClientDetails_timeZone_idx" ON "ClientDetails"("timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowReminder_activeKey_key" ON "WorkflowReminder"("activeKey");

-- CreateIndex
CREATE INDEX "WorkflowReminder_nextReminderAt_resolvedAt_idx" ON "WorkflowReminder"("nextReminderAt", "resolvedAt");

-- CreateIndex
CREATE INDEX "WorkflowReminder_sourceType_sourceId_idx" ON "WorkflowReminder"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "WorkflowReminder_clientCode_idx" ON "WorkflowReminder"("clientCode");

-- CreateIndex
CREATE INDEX "WorkflowReminder_expectedStatus_idx" ON "WorkflowReminder"("expectedStatus");

-- CreateIndex
CREATE INDEX "WorkflowReminder_claimedAt_idx" ON "WorkflowReminder"("claimedAt");
