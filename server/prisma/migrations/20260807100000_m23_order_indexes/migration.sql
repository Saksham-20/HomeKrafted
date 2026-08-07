-- M23. Indexes matching the queries the app actually runs.
--
-- Every index below replaces a sequential scan on a table that only grows,
-- so each is a page that gets slower every week it is left alone. Found by
-- reading each `findMany`'s `where`+`orderBy` against the index list, not
-- by guessing.
--
-- `Order_userId_idx` -> `Order_userId_placedAt_idx`: nothing queries Order
-- by `userId` alone. `OrdersService.list` and `reorder` both filter on
-- `userId` and sort `placedAt desc`, so the old index matched rows and then
-- left Postgres to sort them by hand. The composite covers both, and still
-- serves any `userId`-only lookup from its leading column.
--
-- `OrderItem_productId_idx` is the important one. A HomeKrafter's orders
-- are defined as "orders containing one of my products"
-- (`items.some.productId in [...]`) — used by `SellerOrdersService.list`
-- and `assertOwned`, `SellerAnalyticsService`, and
-- `VendorProfileService.stats`. With no index there, every seller-portal
-- page scanned the whole OrderItem table, so each kitchen's dashboard got
-- slower with every order placed by anyone on the platform.
--
-- `PhoneOtp_phone_idx` -> the four-column index: `OtpService.verify` does
-- `findFirst({ where: { phone, purpose, consumedAt: null }, orderBy:
-- { createdAt: 'desc' } })`. On the phone column alone that re-reads and
-- re-sorts every OTP ever issued to a number on each verification attempt
-- — the hot path of the only sign-in an approved HomeKrafter has.

-- DropIndex
DROP INDEX "Order_userId_idx";

-- DropIndex
DROP INDEX "PhoneOtp_phone_idx";

-- Pre-existing drift, cleared here rather than left to reappear in every
-- future `migrate diff`. M20 added `updatedAt` with `DEFAULT
-- CURRENT_TIMESTAMP` purely so `ADD COLUMN ... NOT NULL` could succeed on
-- rows that already existed; the schema never declared a default. Prisma's
-- `@updatedAt` supplies the value on every insert and update, so the
-- database default has never once been used.
-- AlterTable
ALTER TABLE "CorporateInquiry" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Order_userId_placedAt_idx" ON "Order"("userId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_placedAt_idx" ON "Order"("placedAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_purpose_consumedAt_createdAt_idx" ON "PhoneOtp"("phone", "purpose", "consumedAt", "createdAt");
