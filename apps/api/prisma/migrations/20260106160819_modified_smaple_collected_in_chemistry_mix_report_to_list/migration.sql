ALTER TABLE "ChemistryMixDetails"
  ALTER COLUMN "sampleCollected"
  TYPE "SampleCollected"[]
  USING CASE
    WHEN "sampleCollected" IS NULL THEN NULL
    ELSE ARRAY["sampleCollected"]::"SampleCollected"[]
  END;
