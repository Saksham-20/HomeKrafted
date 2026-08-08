-- M25: record whether a contact has actually been proved.
--
-- Additive and safe to run against a live database: two columns with
-- defaults, then a one-off backfill.
--
-- The backfill marks every EXISTING row verified. That is deliberate.
-- These accounts were created before any verification step existed, so
-- there is no evidence either way — and because OTP delivery is still a
-- logged stub until Twilio/SendGrid keys are set, defaulting them to
-- `false` would show every current user a "verify your email" prompt they
-- have no way to satisfy. New rows start `false` and earn it. Same shape
-- as M22 leaving pre-existing listings `active` rather than delisting a
-- live catalogue.
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "emailVerified" = true WHERE "email" IS NOT NULL;
UPDATE "User" SET "phoneVerified" = true WHERE "phone" IS NOT NULL;
