-- CreateTable
CREATE TABLE "MessageNotificationOutbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimKey" TEXT,
    "scope" TEXT NOT NULL,
    "dept" TEXT,
    "clientCode" TEXT,
    "recipientsKey" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderRole" "UserRole" NOT NULL,
    "senderName" TEXT,
    "preview" TEXT NOT NULL,
    "actionUrl" TEXT,
    "reportId" TEXT,
    "chemistryId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "MessageNotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageNotificationOutbox_sentAt_createdAt_idx" ON "MessageNotificationOutbox"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "MessageNotificationOutbox_claimedAt_idx" ON "MessageNotificationOutbox"("claimedAt");

-- CreateIndex
CREATE INDEX "MessageNotificationOutbox_scope_dept_clientCode_idx" ON "MessageNotificationOutbox"("scope", "dept", "clientCode");

-- CreateIndex
CREATE INDEX "MessageNotificationOutbox_threadId_createdAt_idx" ON "MessageNotificationOutbox"("threadId", "createdAt");
