-- CreateTable
CREATE TABLE "COADetails" (
    "chemistryId" TEXT NOT NULL,
    "client" TEXT,
    "dateSent" TIMESTAMP(3),
    "sampleDescription" TEXT,
    "coaVerification" BOOLEAN NOT NULL DEFAULT false,
    "lotBatchNo" TEXT,
    "manufactureDate" TIMESTAMP(3),
    "formulaId" TEXT,
    "sampleSize" TEXT,
    "dateReceived" TIMESTAMP(3),
    "sampleTypes" "SampleType"[],
    "coaRows" JSONB,
    "comments" TEXT,
    "testedBy" TEXT,
    "testedDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedDate" TIMESTAMP(3),
    "status" "ChemistryReportStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corrections" JSONB,

    CONSTRAINT "COADetails_pkey" PRIMARY KEY ("chemistryId")
);

-- CreateIndex
CREATE INDEX "COADetails_status_idx" ON "COADetails"("status");

-- AddForeignKey
ALTER TABLE "COADetails" ADD CONSTRAINT "COADetails_chemistryId_fkey" FOREIGN KEY ("chemistryId") REFERENCES "ChemistryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
