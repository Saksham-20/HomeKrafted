-- M37: the plaintext temporary password is no longer stored anywhere.
-- It now exists only in the HTTP response of the issue/approve call;
-- a lost password is re-issued (rotating the hash), never re-read.
-- `tempPasswordIssuedAt` stays — it drives the "issued, not yet used"
-- state in the admin queue.
ALTER TABLE "User" DROP COLUMN "tempPassword";
