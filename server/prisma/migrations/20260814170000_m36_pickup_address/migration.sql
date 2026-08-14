-- M36b — the pickup address a rider collects from.
--
-- Additive only. Every column is nullable: the 13 existing HomeKrafters
-- applied before the form asked, so NULL here correctly reads as "we
-- never asked them" rather than "they have no address". Nothing is
-- backfilled and nothing is inferred from `Vendor.location`, which is a
-- deliberately coarse public label ("Sector 35, Chandigarh") and not an
-- address anybody could drive to.
--
-- PRIVACY: these columns hold a home cook's HOME ADDRESS, collected under
-- an explicit on-form promise that buyers never see it. They must never
-- be selected into a public payload — see the doc comments on
-- `VendorProfile` in schema.prisma, and `test/unit/vendor-privacy.spec.ts`,
-- which fails the build if the public vendor mapper starts reading them.

ALTER TABLE "SellerApplication" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "landmark" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "pickupPhone" TEXT;

ALTER TABLE "VendorProfile" ADD COLUMN "pickupAddressLine1" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "pickupAddressLine2" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "pickupLandmark" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "pickupPincode" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "pickupPhone" TEXT;
