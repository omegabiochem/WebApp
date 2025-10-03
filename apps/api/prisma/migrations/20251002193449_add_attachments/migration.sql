/*
  Warnings:

  - A unique constraint covering the columns `[reportId,checksum]` on the table `Attachment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "Attachment_reportId_idx" ON "Attachment"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_reportId_checksum_key" ON "Attachment"("reportId", "checksum");
