-- CreateTable
CREATE TABLE "VendorBlackoutDate" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,

    CONSTRAINT "VendorBlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorBlackoutDate_vendorId_date_idx" ON "VendorBlackoutDate"("vendorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBlackoutDate_vendorId_date_key" ON "VendorBlackoutDate"("vendorId", "date");

-- AddForeignKey
ALTER TABLE "VendorBlackoutDate" ADD CONSTRAINT "VendorBlackoutDate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

