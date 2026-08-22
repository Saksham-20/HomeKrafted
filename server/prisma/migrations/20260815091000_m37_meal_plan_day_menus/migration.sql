-- M37: per-date menus for meal plans. `weeklyMenu` stays the undated
-- rotation; a row here overrides it for one date. Lock state is computed
-- on read, never stored.
CREATE TABLE "MealPlanDayMenu" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lines" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanDayMenu_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealPlanDayMenu_planId_date_key" ON "MealPlanDayMenu"("planId", "date");

CREATE INDEX "MealPlanDayMenu_date_idx" ON "MealPlanDayMenu"("date");

ALTER TABLE "MealPlanDayMenu" ADD CONSTRAINT "MealPlanDayMenu_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
