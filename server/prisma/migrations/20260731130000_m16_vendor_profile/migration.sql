-- CreateEnum
CREATE TYPE "VendorPhotoKind" AS ENUM ('kitchen', 'process', 'team', 'award');

-- CreateTable
CREATE TABLE "VendorProfile" (
    "vendorId" TEXT NOT NULL,
    "tagline" TEXT,
    "story" TEXT,
    "knownFor" TEXT[],
    "languages" TEXT[],
    "prepTimeMins" INTEGER,
    "responseTimeMins" INTEGER,
    "capacityPerDay" INTEGER,
    "minOrderValue" DECIMAL(10,2),
    "workingDays" INTEGER[],
    "opensAt" TEXT,
    "closesAt" TEXT,
    "cancellationPolicy" TEXT,
    "returnPolicy" TEXT,
    "customOrderPolicy" TEXT,
    "acceptsCustomOrders" BOOLEAN NOT NULL DEFAULT false,
    "packagingNote" TEXT,
    "hygieneNote" TEXT,
    "fssaiNumber" TEXT,
    "fssaiExpiry" TIMESTAMP(3),
    "fssaiVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "addressVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verificationNote" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("vendorId")
);

-- CreateTable
CREATE TABLE "VendorPhoto" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "kind" "VendorPhotoKind" NOT NULL DEFAULT 'kitchen',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPhoto_vendorId_sortOrder_idx" ON "VendorPhoto"("vendorId", "sortOrder");

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPhoto" ADD CONSTRAINT "VendorPhoto_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

