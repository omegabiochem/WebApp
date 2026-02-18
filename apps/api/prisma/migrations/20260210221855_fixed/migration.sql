-- baseline placeholder to match applied migration in DB
-- (migration already applied in DB)-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_createdById_fkey";

-- AlterTable
ALTER TABLE "SupportTicket"
ALTER COLUMN "createdById" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;