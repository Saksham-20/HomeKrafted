-- M32: a richer, standardised `/sell` application.
--
-- All five columns are nullable and nothing is backfilled: every existing
-- application was submitted against a form that never asked these
-- questions, and inventing a value for a real person's row would be worse
-- than leaving it blank. "Didn't say" is a state the admin screens render.
ALTER TABLE "SellerApplication" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "fssaiNumber" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "yearsMaking" INTEGER;
ALTER TABLE "SellerApplication" ADD COLUMN "capacityPerDay" INTEGER;
