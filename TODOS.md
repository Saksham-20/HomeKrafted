# TODOS

Deferred work with the reasoning attached, so a future session can tell
"decided against" from "not got to yet". Created in M27, because until
then "deferred" meant a sentence in a planning document that stopped being
read the moment the milestone closed.

`docs/PRODUCTION-AUDIT.md` remains the ranked product backlog and
`docs/LAUNCH-READINESS.md` the launch checklist. This file is narrower: it
holds the things a specific piece of work decided not to do, with enough
context to pick them up cold.

---

## Owner decisions, not engineering ones

### Commission collection
**What:** `commissionPct` (default 10) is modelled on the admin analytics
screen and deducted nowhere. `Payout.amount` is gross.
**Why it's here:** a take rate is a business decision. M27 attached a
*date* to it ("decide before the first real order", `LAUNCH-READINESS`
§3b) rather than a number, because a deferral with no forcing function is
a standing decision to lose money on every order — and retrofitting 10%
onto HomeKrafters who have seen gross payouts reads as a pay cut.
**Watch out:** meal subscriptions are recurring and prepaid, so a
per-order loss multiplies per cycle. That is the gate §3b said not to
cross, and M19 crossed it.

---

## Follow-ups from M27

### Extract a shared `cancelOrderTx`
**What:** `OrdersService.cancelOrder` refunds, restocks, reverses cashback
and stamps `cancelledAt` in one transaction. `AdminOrdersService.overrideStatus`
does none of that, so M27 **refuses** `cancelled`/`returned` there rather
than half-doing them.
**Why not now:** extracting a reusable transaction touches the money path,
and the milestone already carried two P0s. The refusal is correct and
safe; this would make the admin able to cancel *properly*, which is a
feature.
**Start at:** `server/src/orders/orders.service.ts` (`cancelOrder`),
`server/src/admin/orders.service.ts` (`OVERRIDE_FORBIDDEN`).

### Stored image variants
**What:** one stored size serves every slot — a 210px card downloads the
same file as a full-width banner.
**Why not now:** `next/image` cannot optimise uploads (it resolves them
against its own server, which does not serve `/uploads/`), so the fix is
stored variants or teaching the CDN to make them. M27's GCS driver leaves
the seam ready: N variants is N `put()` calls with suffixed keys, no
interface change.
**Start at:** `server/src/uploads/image-pipeline.ts` (`ProcessedImage` is
the single-object return that would become a set).

### GMV by module on `/admin/analytics`
**Why not now:** it renders ₹0 against seed data and its design would be
wrong in ways only real orders reveal. The moderation-SLA card shipped
instead because it serves supply onboarding, which starts before launch.

### Apostrophe normalisation
**What:** ~566 straight contractions in user-facing copy versus ~20 curly.
**Why not now:** a mechanical sweep over every string at the least stable
moment before launch, for a defect no user has reported. A quiet-week
task.

### Sentry on the web app
**What:** `@sentry/nestjs` shipped; `@sentry/nextjs` did not.
**Why not now:** Next 16 builds with Turbopack and Sentry's build-time
instrumentation is webpack-plugin-based; confirming it works is a research
task, not a config line. Server-side capture is where the value is —
that is where a 500 on checkout lives.

---

## Standing backlog (from `docs/PRODUCTION-AUDIT.md`)

Listed here only so this file is not read as the complete picture. The
audit is the ranked source.

- **Refund-to-card execution** — an admin resolves a return with a wallet
  credit; money never returns to the card. Razorpay refunds unwired.
- **Payout execution** — `POST /admin/payouts/:id/pay` records a
  settlement somebody performed by hand. Fine at ten HomeKrafters. M27
  wrote down the ceiling: acceptable to roughly 20 orders/week.
- **Real support conversations** (audit #18) — `/support` is a scripted
  client-side auto-reply while `/admin/support` reads real tickets.
- **Support-ticket reply notifications** (§2.7) — a customer reply reopens
  a ticket and tells nobody.
- **Cohort/retention analytics** (Phase 2 #15's open half).
- **Full-text search + a denormalised price column** — search and price
  sort read the whole matching set.
- **Pagination** on `/admin/catalog/reviews` and `/admin/collections` —
  fine now, slow at volume. The `/admin/orders` pattern is the one to
  copy.
