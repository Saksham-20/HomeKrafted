-- M50 — a HomeKrafter can ask for a shelf or an occasion that isn't there.
--
-- The ask is recorded; an admin mints the real `Category`/`Occasion` row.
-- That is what keeps `Occasion` admin-only (the invariant pinned by
-- `test/unit/occasion-admin-only.spec.ts`) while giving the person who
-- found the list too short somewhere to say so.

CREATE TYPE "TaxonomyKind" AS ENUM ('category', 'occasion');

CREATE TYPE "TaxonomySuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- Drift from M47, not part of this change: that migration added the column
-- with a DB-level `DEFAULT ARRAY[]` which the Prisma model never declared,
-- so every `migrate diff` since has carried this line. Dropping it changes
-- no behaviour — Prisma writes the list explicitly on every insert, and a
-- raw insert that omits it produces NULL, which the client already reads
-- as the empty list. Folded in here so the next diff is honest.
ALTER TABLE "User" ALTER COLUMN "adminScopes" DROP DEFAULT;

CREATE TABLE "TaxonomySuggestion" (
    "id" TEXT NOT NULL,
    "kind" "TaxonomyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "group" "ProductKind",
    "note" TEXT,
    "status" "TaxonomySuggestionStatus" NOT NULL DEFAULT 'pending',
    "suggestedById" TEXT NOT NULL,
    "vendorId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "resultCategoryId" TEXT,
    "resultOccasionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxonomySuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxonomySuggestion_status_createdAt_idx" ON "TaxonomySuggestion"("status", "createdAt");

CREATE INDEX "TaxonomySuggestion_suggestedById_idx" ON "TaxonomySuggestion"("suggestedById");

ALTER TABLE "TaxonomySuggestion" ADD CONSTRAINT "TaxonomySuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaxonomySuggestion" ADD CONSTRAINT "TaxonomySuggestion_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxonomySuggestion" ADD CONSTRAINT "TaxonomySuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
