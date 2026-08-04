-- M19: capture out-of-area applicants, and make the platform's default
-- delivery radius actually reachable.
--
-- TWO CHANGES, BOTH SMALL, BOTH FIXING A SILENT BUG.
--
-- 1. `areaLabel` — the apply form now offers `area = 'other'` with a free
--    text locality, so someone outside the tricity can register interest.
--    Such an application is a WAITLIST entry, not an approvable one:
--    `approveApplication` refuses any area that does not resolve through
--    `TRICITY_AREAS`. The previous behaviour fell back to `TRICITY_CENTRE`,
--    which planted every out-of-area kitchen at Chandigarh's exact centre —
--    so it sorted as ~0 km from every buyer and passed every radius filter.
--
-- 2. `deliveryRadiusKm` becomes nullable and loses its default. With
--    `Int NOT NULL DEFAULT 10`, `approveApplication`'s
--    `application.deliveryRadiusKm || defaultRadiusKm` always saw a truthy
--    10, so `PlatformSetting.defaultDeliveryRadiusKm` could never apply.
--    NULL is the only way to express "they didn't say" — which is what the
--    form now sends when the applicant leaves the optional field alone.
--
-- Existing rows keep their stored 10. That is correct: those applicants
-- answered the question back when it was mandatory, and overwriting their
-- answer with NULL would silently widen or narrow a real kitchen's range.

ALTER TABLE "SellerApplication" ADD COLUMN "areaLabel" TEXT;

ALTER TABLE "SellerApplication" ALTER COLUMN "deliveryRadiusKm" DROP DEFAULT;
ALTER TABLE "SellerApplication" ALTER COLUMN "deliveryRadiusKm" DROP NOT NULL;
