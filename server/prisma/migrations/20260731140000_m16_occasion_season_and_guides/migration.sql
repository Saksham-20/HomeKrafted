-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageSrc" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Occasion" ADD COLUMN     "celebratedOn" TIMESTAMP(3),
ADD COLUMN     "imageSrc" TEXT,
ADD COLUMN     "tagline" TEXT;

