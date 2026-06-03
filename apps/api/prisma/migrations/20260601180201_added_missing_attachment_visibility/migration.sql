-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'LAB_ONLY';

-- AlterTable
ALTER TABLE "ChemistryAttachment" ADD COLUMN     "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'LAB_ONLY';
