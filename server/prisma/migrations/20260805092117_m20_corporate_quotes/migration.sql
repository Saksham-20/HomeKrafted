-- `CorporateInquiry` already holds rows on production, so the generated
-- `ADD COLUMN "updatedAt" NOT NULL` with no default would have failed
-- outright. Backfilled with CURRENT_TIMESTAMP below; Prisma's `@updatedAt`
-- maintains it from then on.

-- CreateEnum
CREATE TYPE "CorporateOrderType" AS ENUM ('corporate', 'bulk');

-- CreateEnum
CREATE TYPE "CorporateQuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "CorporateInquiry" ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "orderType" "CorporateOrderType" NOT NULL DEFAULT 'corporate',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows now read "updated when this migration ran", which is
-- wrong but harmless — the column only orders the admin queue. Backfilling
-- from `createdAt` is the honest value for a row nobody has touched.
UPDATE "CorporateInquiry" SET "updatedAt" = "createdAt";

-- CreateTable
CREATE TABLE "CorporateQuote" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "status" "CorporateQuoteStatus" NOT NULL DEFAULT 'draft',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "tokenHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedName" TEXT,
    "declinedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "vendorId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CorporateQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorporateQuote_tokenHash_key" ON "CorporateQuote"("tokenHash");

-- CreateIndex
CREATE INDEX "CorporateQuote_inquiryId_idx" ON "CorporateQuote"("inquiryId");

-- CreateIndex
CREATE INDEX "CorporateQuote_status_idx" ON "CorporateQuote"("status");

-- CreateIndex
CREATE INDEX "CorporateQuoteLine_quoteId_idx" ON "CorporateQuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "CorporateQuoteLine_vendorId_idx" ON "CorporateQuoteLine"("vendorId");

-- CreateIndex
CREATE INDEX "CorporateInquiry_status_createdAt_idx" ON "CorporateInquiry"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CorporateQuote" ADD CONSTRAINT "CorporateQuote_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CorporateInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateQuote" ADD CONSTRAINT "CorporateQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateQuoteLine" ADD CONSTRAINT "CorporateQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "CorporateQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateQuoteLine" ADD CONSTRAINT "CorporateQuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateQuoteLine" ADD CONSTRAINT "CorporateQuoteLine_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
