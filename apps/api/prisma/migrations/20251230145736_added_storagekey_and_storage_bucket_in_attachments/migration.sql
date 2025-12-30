-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageDriver" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ChemistryAttachment" ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageDriver" TEXT NOT NULL DEFAULT 'local';
