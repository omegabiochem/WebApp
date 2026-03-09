-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isCommonAccount" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CommonAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastFailedLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommonAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonAccountMember" (
    "id" TEXT NOT NULL,
    "commonAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowedRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommonAccountMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommonAuthChallenge" (
    "id" TEXT NOT NULL,
    "challengeToken" TEXT NOT NULL,
    "commonAccountId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "selectedUserId" TEXT,
    "selectedRole" "UserRole",
    "twoFactorCodeHash" TEXT,
    "twoFactorExpiresAt" TIMESTAMP(3),
    "twoFactorAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommonAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommonAccount_userId_key" ON "CommonAccount"("userId");

-- CreateIndex
CREATE INDEX "CommonAccountMember_commonAccountId_active_idx" ON "CommonAccountMember"("commonAccountId", "active");

-- CreateIndex
CREATE INDEX "CommonAccountMember_userId_idx" ON "CommonAccountMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommonAccountMember_commonAccountId_userId_key" ON "CommonAccountMember"("commonAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommonAuthChallenge_challengeToken_key" ON "CommonAuthChallenge"("challengeToken");

-- CreateIndex
CREATE INDEX "CommonAuthChallenge_commonAccountId_expiresAt_idx" ON "CommonAuthChallenge"("commonAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "CommonAuthChallenge_selectedUserId_idx" ON "CommonAuthChallenge"("selectedUserId");

-- AddForeignKey
ALTER TABLE "CommonAccountMember" ADD CONSTRAINT "CommonAccountMember_commonAccountId_fkey" FOREIGN KEY ("commonAccountId") REFERENCES "CommonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommonAccountMember" ADD CONSTRAINT "CommonAccountMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommonAuthChallenge" ADD CONSTRAINT "CommonAuthChallenge_commonAccountId_fkey" FOREIGN KEY ("commonAccountId") REFERENCES "CommonAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
