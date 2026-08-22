-- M47 — sub-admins: which parts of the panel an admin may reach.

CREATE TYPE "AdminScope" AS ENUM (
  'catalog', 'sellers', 'orders', 'support', 'finance', 'users', 'settings', 'analytics'
);

ALTER TABLE "User" ADD COLUMN "adminScopes" "AdminScope"[] DEFAULT ARRAY[]::"AdminScope"[];

-- **Every existing admin keeps everything.** An empty list means "no
-- access at all" (see the schema comment on `User.adminScopes`), which is
-- the safe direction for a permission system — but only because this
-- backfill exists. Without it, deploying M47 locks every current operator
-- out of the panel on the first request.
UPDATE "User"
SET "adminScopes" = ARRAY[
  'catalog', 'sellers', 'orders', 'support', 'finance', 'users', 'settings', 'analytics'
]::"AdminScope"[]
WHERE "role" = 'admin';
