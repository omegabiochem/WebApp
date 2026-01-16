-- CreateTable
CREATE TABLE "MessageThreadRead" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThreadRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageThreadRead_userId_idx" ON "MessageThreadRead"("userId");

-- CreateIndex
CREATE INDEX "MessageThreadRead_threadId_idx" ON "MessageThreadRead"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThreadRead_threadId_userId_key" ON "MessageThreadRead"("threadId", "userId");

-- AddForeignKey
ALTER TABLE "MessageThreadRead" ADD CONSTRAINT "MessageThreadRead_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
