-- M22 part 1 of 2: the two new `ProductModerationStatus` members.
--
-- Split from the migration that uses them (20260806090100) because
-- Postgres refuses to *use* an enum value added in the same transaction:
-- `ALTER TABLE ... SET DEFAULT 'pending'` in this file would fail with
-- "unsafe use of new value 'pending' of enum type". Each Prisma migration
-- file runs in its own transaction, so two files is the fix.

ALTER TYPE "ProductModerationStatus" ADD VALUE 'pending' BEFORE 'active';
ALTER TYPE "ProductModerationStatus" ADD VALUE 'rejected' AFTER 'active';
