/* SAFE PATCH for existing rows:
   - Make inviteToken and userId NULLable
   - Give passwordVersion a DEFAULT and NOT NULL (backfills existing rows with 1)
   - Keep unique indexes (Postgres allows multiple NULLs)
*/

-- AlterTable
ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "inviteToken" TEXT,
  ADD COLUMN IF NOT EXISTS "inviteTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "tempPasswordExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "userIdSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_userId_key" ON "public"."User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_inviteToken_key" ON "public"."User"("inviteToken");

-- Optional: case-insensitive uniqueness for userId (recommended)
CREATE UNIQUE INDEX IF NOT EXISTS user_userid_lower_unique
ON "public"."User" ((lower("userId"))) WHERE "userId" IS NOT NULL;
