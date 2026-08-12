-- M32: admin-issued sign-in details that stay legible until they are used.
--
-- Additive, no backfill, safe against a live database.
--
-- `tempPassword` holds a temporary password in the clear. That is a
-- deliberate exception, not an oversight — see the field's doc comment in
-- `schema.prisma`. It is only ever a credential its owner has not used
-- yet: every path that sets a real password (`auth/password/change`,
-- `auth/password/reset`) nulls it in the same statement, and
-- `mustChangePassword` guarantees the value stops working at first
-- sign-in. Retire the column once SendGrid/Twilio keys exist and the
-- invite link can actually be delivered.
--
-- `credentialsClaimedAt` is the honest answer to "who has actually
-- onboarded?" — approval creates an account, but somebody choosing their
-- own password is the first evidence a real person is behind it.
ALTER TABLE "User"
  ADD COLUMN "tempPassword" TEXT,
  ADD COLUMN "tempPasswordIssuedAt" TIMESTAMP(3),
  ADD COLUMN "credentialsClaimedAt" TIMESTAMP(3);
