-- CreateEnum
CREATE TYPE "public"."SupportTicketActivityType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'NOTE');

-- CreateTable
CREATE TABLE "public"."SupportTicketActivity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "public"."SupportTicketActivityType" NOT NULL,
    "message" TEXT,
    "fromStatus" "public"."SupportTicketStatus",
    "toStatus" "public"."SupportTicketStatus",
    "assignedToId" TEXT,
    "assignedToName" TEXT,

    CONSTRAINT "SupportTicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketActivity_ticketId_createdAt_idx" ON "public"."SupportTicketActivity"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketActivity_actorId_idx" ON "public"."SupportTicketActivity"("actorId");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "public"."SupportTicket"("assignedToId");

-- AddForeignKey
ALTER TABLE "public"."SupportTicketActivity" ADD CONSTRAINT "SupportTicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportTicketActivity" ADD CONSTRAINT "SupportTicketActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
