-- CreateTable
CREATE TABLE "public"."ClientNameDirectory" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNameDirectory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientNameDirectory_clientCode_idx" ON "public"."ClientNameDirectory"("clientCode");

-- CreateIndex
CREATE INDEX "ClientNameDirectory_clientCode_active_idx" ON "public"."ClientNameDirectory"("clientCode", "active");

-- CreateIndex
CREATE INDEX "ClientNameDirectory_clientCode_name_idx" ON "public"."ClientNameDirectory"("clientCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNameDirectory_clientCode_normalizedName_key" ON "public"."ClientNameDirectory"("clientCode", "normalizedName");
