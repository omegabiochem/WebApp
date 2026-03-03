-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimKey" TEXT,
    "scope" TEXT NOT NULL,
    "dept" TEXT,
    "clientCode" TEXT,
    "recipientsKey" TEXT NOT NULL,
    "tag" TEXT,
    "reportId" TEXT NOT NULL,
    "formType" "FormType" NOT NULL,
    "formNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "reportUrl" TEXT,
    "actorUserId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationOutbox_sentAt_createdAt_idx" ON "NotificationOutbox"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_claimedAt_idx" ON "NotificationOutbox"("claimedAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_scope_dept_clientCode_idx" ON "NotificationOutbox"("scope", "dept", "clientCode");
