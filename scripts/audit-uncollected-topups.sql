-- Audit: wallet balance that was credited without anyone paying for it.
--
-- WHY THIS EXISTS
-- ---------------
-- `WalletService#maybeFireAutoTopupTx` used to post a `credit`/`topup`
-- ledger entry for `AutoTopupRule.topupAmount` whenever a debit dropped a
-- wallet below its threshold — with no Razorpay charge and no captured
-- payment behind it. `PUT /wallet/auto-topup` is owner-scoped and its DTO
-- capped nothing, so any signed-in shopper could set a large `topupAmount`,
-- spend once, and mint real spendable balance. That balance buys real food
-- from real home kitchens, who then draw real payouts against it.
--
-- The credit is disabled now. This finds what it already created.
--
-- HOW IT TELLS THE TWO APART
-- --------------------------
-- The legitimate top-up path is `WalletService#creditTopupTx`, reachable
-- only from the HMAC-verified Razorpay webhook, and it ALWAYS sets
-- `refId = razorpayOrderId`. The auto-top-up path set no `refId` at all.
-- So `refId IS NULL` on a `topup` row is exactly the uncollected case —
-- no join needed, and the 3% top-up bonus (written as `category = 'cashback'`)
-- cannot contaminate the result.
--
-- Run READ-ONLY first. Decide per row before clawing anything back:
-- writing off a legitimate top-up would be its own trust incident.
--
--   psql "$DATABASE_URL" -f scripts/audit-uncollected-topups.sql

\echo '== Uncollected auto-top-up credits, newest first =='

SELECT
  wt."createdAt",
  wt."id"            AS transaction_id,
  wt."walletId",
  u."email",
  u."phone",
  wt."amount",
  wt."balanceAfter"
FROM "WalletTransaction" wt
JOIN "Wallet" w ON w."id" = wt."walletId"
JOIN "User"   u ON u."id" = w."userId"
WHERE wt."category" = 'topup'
  AND wt."refId" IS NULL
  AND wt."title"  = 'Auto top-up'
ORDER BY wt."createdAt" DESC;

\echo ''
\echo '== Totals per affected wallet (this is the exposure) =='

SELECT
  w."id"                 AS wallet_id,
  u."email",
  COUNT(*)               AS uncollected_credits,
  SUM(wt."amount")       AS uncollected_total,
  w."balance"            AS current_balance
FROM "WalletTransaction" wt
JOIN "Wallet" w ON w."id" = wt."walletId"
JOIN "User"   u ON u."id" = w."userId"
WHERE wt."category" = 'topup'
  AND wt."refId" IS NULL
  AND wt."title"  = 'Auto top-up'
GROUP BY w."id", u."email", w."balance"
ORDER BY uncollected_total DESC;

\echo ''
\echo '== Rules that could still have fired (should be none enabled after the fix) =='

SELECT
  r."id"      AS rule_id,
  r."walletId",
  u."email",
  r."enabled",
  r."thresholdAmount",
  r."topupAmount"
FROM "AutoTopupRule" r
JOIN "Wallet" w ON w."id" = r."walletId"
JOIN "User"   u ON u."id" = w."userId"
WHERE r."enabled" = true
ORDER BY r."topupAmount" DESC;

-- CLAWBACK, if a row turns out to be illegitimate:
-- do NOT delete the ledger row — the ledger is append-only and a deletion
-- makes the balance unauditable. Post a compensating debit through the
-- admin endpoint instead, so it lands with a reason and an audit entry:
--
--   POST /api/v1/wallet/adjust
--   { "userId": "...", "direction": "debit", "amount": <amount>,
--     "reason": "Reversing uncollected auto-top-up credit <transaction_id>" }
