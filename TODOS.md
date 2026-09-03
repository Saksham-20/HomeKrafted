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

## Launch blockers — consolidated checklist (2026-09-02)

Compiled from `docs/LAUNCH-READINESS.md`, `CLAUDE.md` and the M34 review.
The readiness doc stays the source of reasoning; this is the working
checklist. Tick here *and* there.

### Hard gates
- [ ] Rotate seeded admin password on production (`scripts/rotate-admin.sh` on the box; §0.1 — the only ⛔)
- [ ] SendGrid **or** Twilio key — the single blocker on onboarding any real HomeKrafter (§0.3)
- [ ] Twilio (`TWILIO_*`) — phone OTP sign-in for everyone
- [ ] Razorpay: live keys + dashboard webhook (`payment.captured` → `/api/v1/payments/webhook` + `RAZORPAY_WEBHOOK_SECRET`) + KYC for settlement account
- [ ] WhatsApp Cloud API keys — snacks module is dead without them
- [ ] Off-box backups (private GCS bucket) — dumps and every photo live only on the VPS
- [ ] `NEXT_PUBLIC_SITE_URL` set to the real host
- [ ] `client/lib/legal.ts` placeholders (registered name/address/phone) + qualified legal review of the policy pages
- [ ] GST registration / invoicing / TCS question; FSSAI aggregator obligations
- [ ] Real support contact on the site
- [ ] Take-rate decision — flip `commissionEnabled` or write down why not (§3b; meal subscriptions multiply the loss per cycle)
- [ ] Delete demo accounts + `OTP_TEST_CODE` the day real customers arrive (§0.2 — one action, same accounts)

### Ops
- [ ] `SENTRY_DSN` — a 500 on checkout is currently invisible (largest ops gap)
- [ ] External uptime check (UptimeRobot at `/health` — the on-box healthcheck watches itself)
- [ ] Staging environment; CI gate on deploy

### Workflows a real user hits
- [ ] Refund-to-card execution (Razorpay refunds unwired; settlement is wallet credit)
- [ ] Payout execution (hand-recorded; ceiling ~20 orders/week per M27)
- [ ] Support-ticket reply notifications (reply reopens, nobody told)

### Production data (operator, not deploy)
- [ ] Rename two storefronts named after an email address (`/admin/sellers`; M34 review)
- [ ] Re-run `ReviewAggregatesService` recompute on prod (seeded "4.9 · 204" vs 2 real rows)
- [ ] Confirm the three "Backed by" relationships in writing before promoting the site

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

### ~~`ProductCard`'s `onCardClick` variant is nested-interactive~~ — DONE
Deleted, not worked around. The prop turned the card into a
`role="button"` div containing the wishlist and add buttons (axe's
`nested-interactive`, the one finding left on the M28 sweep), and its sole
caller in the whole codebase was `/gallery`'s own demo swatch. That swatch
now passes an `href` — the only clickable shape the card has, and the
honest demo of the M22 stretched link. Kept here as a worked example of
the call this file exists to record: an API surface whose only consumer is
its own demo page is a deletion candidate, and deleting it is what removes
the finding permanently.

### Full-suite e2e flakiness
**What:** `npm run test:e2e` is not reliably green under full parallel
load. Observed: 1 failure, then 15, then 0, then (M28) 1 —
`seller-analytics.e2e-spec.ts` failing in `beforeAll` at
`createCategory`. That spec passes alone in 3.7s, and `createCategory`
uses a unique slug, so it is contention (deadlock or pool exhaustion),
not shared fixture state.
**Why not now:** it is pre-existing, the harness already carries
deadlock-retry logic, and chasing it properly means instrumenting the
suite rather than guessing. But **a suite that fails ~1 in N runs for
reasons nobody has pinned is a suite people learn to re-run**, which is
how a real regression gets waved through.
**Start at:** `server/test/e2e/harness.ts`, and capture full jest output —
the M28 run's failure detail was truncated to twelve lines, which is why
this still has no diagnosis.

### ~~The mobile portal nav does not scroll the active item into view~~ — DONE (M29)
Fixed in `client/lib/useScrollActiveIntoView.ts`, applied to all three
portal shells, pinned by `e2e/tests/portal-nav.spec.ts` (10 cases: 4 seller,
3 account, 3 admin, each asserting the active item is inside the strip's
visible box and still is 700ms later).

Kept here because **one of the three recorded findings was wrong, and it
was the one that stopped the work.** Findings 1 and 2 stood exactly as
written (`scrollIntoView({inline:'nearest'})` no-ops here; `offsetLeft`
measures from `BODY` because the nav establishes no containing block, so
`getBoundingClientRect` deltas are the correct measure). Finding 3 said
"something resets `scrollLeft` to 0 within 500ms — suspect App Router
scroll restoration, **or the nav being remounted after the effect**".

Measured at 390px against a real seller session before writing any fix:
setting `scrollLeft = 739` on `/seller/payouts` clamped to the strip's
maximum of 726 and was **still 726 twelve hundred milliseconds later**,
with no `scroll` event in between. There is no resetter. It was the second
hypothesis — `SellerShell` gates its body behind an async HomeKrafter
resolve, so the nav does not exist on the first effect pass and `pathname`
never changes afterwards, so an effect keyed on the pathname alone never
ran again. The fix is a **callback ref**: attaching the node is what
schedules the work, so a late mount is handled by construction.

The asymmetry is the lesson worth keeping: with a plain `useRef` the
account and admin strips scrolled correctly on every route while the seller
strip sat at 0 on all of them. A fix verified on one portal would have
looked complete. So would a watchdog rAF loop, which is what the plan for
this item originally called for — and it would have been permanent code
defending against something that is not happening.

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

## Follow-ups from the M34 design review (2026-08-13)

Three of these are **not code** — they are production data an operator
fixes in the admin panel, and they will not go away by deploying
anything.

### Two live storefronts are named after somebody's email address
**What:** `/gifts` shows `JASHANPREETSINGH3105@GMAIL.C…` as the maker
line on two listings (Handmade Concrete Diyas, Heart Floral Candle).
**Why it matters:** that line is the brand on every product card and
every order, on a marketplace whose whole pitch is trusting a named
stranger — and it publishes a personal email address on a public page.
**Why not fixed here:** M32's `businessName` validation blocks new ones;
these predate it, and renaming a real storefront is an operator decision
about somebody's business, not a code change. Fix via `/admin/sellers`.

### Product trust numbers disagree with themselves
**What:** `/product/ragi-almond-cookies` shows "4.9 · 204 reviews" above
a tab reading "Reviews (2)".
**Why it matters:** a seeded aggregate against real rows. On a platform
selling verifiable trust, a number a visitor can check and disprove in
one click is worse than a low one.
**Fix:** re-run `ReviewAggregatesService`'s recompute on production. The
machinery is right; the seeded values are stale.

### Add-to-cart signs you out of your own context
**What:** adding to cart while signed out returns 401 and hard-redirects
to `/login`, losing the product page.
**Why not now:** structural — either a guest cart or a return-to
redirect, both bigger than a style fix. It was the single biggest drain
in the review's goodwill walk (finished 60/100), and even Zomato defers
the login to checkout. Worth ranking into
`docs/PRODUCTION-AUDIT.md` rather than doing in passing.

### Noted, not fixed: three polish items
`PromoBand`'s H3s (32px) visually outrank section H2s (27px) — display
licence, left alone. Desktop nav links are 24px-tall targets — desktop
pointer context, and the drawer's are 44px. No current-section indicator
in the desktop nav — breadcrumbs cover the listing routes.

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
