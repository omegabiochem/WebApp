-- AlterTable
ALTER TABLE "WorkflowReminder" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0;
