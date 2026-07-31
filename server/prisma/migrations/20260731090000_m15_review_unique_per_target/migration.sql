-- M15: one review per person per thing.
--
-- Before this, `POST /reviews` had no call site at all, so nothing could
-- write a second review — but the moment a submission UI exists, "review
-- bomb a HomeKrafter" is a two-line script without this constraint.

-- Any pre-existing duplicates would block the index below. Keeps the
-- earliest review of each (user, target) and drops the rest: the app is
-- about to forbid the extras anyway, and failing the migration instead
-- would leave the constraint permanently unapplied on the one database
-- that actually has the problem.
DELETE FROM "Review" a
USING "Review" b
WHERE a."userId" = b."userId"
  AND a."targetType" = b."targetType"
  AND a."targetId" = b."targetId"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_targetType_targetId_key" ON "Review"("userId", "targetType", "targetId");
