-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "reportId" TEXT,
    "chemistryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "UserRole" NOT NULL,
    "senderName" TEXT,
    "body" TEXT NOT NULL,
    "mentions" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageThread_clientCode_idx" ON "MessageThread"("clientCode");

-- CreateIndex
CREATE INDEX "MessageThread_reportId_idx" ON "MessageThread"("reportId");

-- CreateIndex
CREATE INDEX "MessageThread_chemistryId_idx" ON "MessageThread"("chemistryId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
