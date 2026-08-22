-- The kitchen pins its own exact spot (PATCH /seller/profile/coords).
-- NULL = coordinates are still the approval seed (pincode centroid or
-- curated area point) and no person has confirmed them.
ALTER TABLE "Vendor" ADD COLUMN "pinConfirmedAt" TIMESTAMP(3);
