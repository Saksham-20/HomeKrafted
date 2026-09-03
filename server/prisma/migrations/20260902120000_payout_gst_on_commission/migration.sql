-- GST on the platform's commission fee (2026-09-02).
-- Nullable on purpose: rows written before this migration have no GST
-- concept, and NULL ("field didn't exist") must stay distinct from 0
-- ("no fee was charged, so nothing was taxed").
ALTER TABLE "Payout" ADD COLUMN "gstAmount" DECIMAL(12,2);
ALTER TABLE "Payout" ADD COLUMN "gstPct" DECIMAL(5,2);
