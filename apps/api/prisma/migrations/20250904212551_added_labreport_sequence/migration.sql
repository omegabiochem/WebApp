-- CreateTable
CREATE TABLE "public"."LabReportSequence" (
    "department" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LabReportSequence_pkey" PRIMARY KEY ("department")
);
