/*
  Warnings:

  - A unique constraint covering the columns `[formNumber]` on the table `MicroMixReport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MicroMixReport_formNumber_key" ON "public"."MicroMixReport"("formNumber");
