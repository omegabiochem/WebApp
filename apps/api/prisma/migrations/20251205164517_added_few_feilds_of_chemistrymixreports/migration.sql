-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('ID', 'PERCENT_ASSAY');

-- CreateEnum
CREATE TYPE "SampleCollected" AS ENUM ('TOP_BEG', 'MID', 'BOTTOM_END');

-- CreateTable
CREATE TABLE "ChemistryMixDetails" (
    "id" SERIAL NOT NULL,
    "client" TEXT,
    "dateSent" TIMESTAMP(3),
    "sampleDescription" TEXT,
    "testType" "TestType",
    "sampleCollected" "SampleCollected",

    CONSTRAINT "ChemistryMixDetails_pkey" PRIMARY KEY ("id")
);
