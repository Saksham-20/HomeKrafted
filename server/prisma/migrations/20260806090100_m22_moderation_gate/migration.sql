-- M22 part 2 of 2: the review gate itself.
--
-- The default flips to 'pending' on all three catalogues. **No UPDATE
-- runs**, and that is deliberate: a column default applies only to new
-- rows, so every listing that already exists keeps the status it has.
-- Applying an approval gate retroactively would delist a live catalogue
-- and take every HomeKrafter's income with it until an admin worked
-- through the backlog.

-- Product ------------------------------------------------------------
ALTER TABLE "Product" ADD COLUMN "moderationNote" TEXT;
ALTER TABLE "Product" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Product" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Product" ALTER COLUMN "moderationStatus" SET DEFAULT 'pending';

ALTER TABLE "Product" ADD CONSTRAINT "Product_moderatedById_fkey"
  FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_moderationStatus_submittedAt_idx" ON "Product"("moderationStatus", "submittedAt");

-- MealPlan -----------------------------------------------------------
ALTER TABLE "MealPlan" ADD COLUMN "moderationNote" TEXT;
ALTER TABLE "MealPlan" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "MealPlan" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "MealPlan" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "MealPlan" ALTER COLUMN "moderationStatus" SET DEFAULT 'pending';

ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_moderatedById_fkey"
  FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Snack --------------------------------------------------------------
-- This table had no moderation column at all before M22. Existing rows
-- are backfilled to 'active' by the column default on ADD COLUMN, which
-- is the correct outcome for the same reason as above: they are live.
ALTER TABLE "Snack" ADD COLUMN "moderationStatus" "ProductModerationStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "Snack" ALTER COLUMN "moderationStatus" SET DEFAULT 'pending';
ALTER TABLE "Snack" ADD COLUMN "moderationNote" TEXT;
ALTER TABLE "Snack" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Snack" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "Snack" ADD COLUMN "submittedAt" TIMESTAMP(3);

ALTER TABLE "Snack" ADD CONSTRAINT "Snack_moderatedById_fkey"
  FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Snack_moderationStatus_submittedAt_idx" ON "Snack"("moderationStatus", "submittedAt");
