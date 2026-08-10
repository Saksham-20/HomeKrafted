# M26 Sweep Execution — UI/UX-first screenshot sweep

**Status:** planning document, not yet run. Written 2026-08-09 against `main`
@ `6ce07bb`, with the QA stack already up at `localhost:3100` / `:4100`
(confirmed: `GET /` → 200; Wave 0.9's browser-layer fix and Wave 0.0's
ledger/coverage files are already landed — see `docs/M26-QA-LEDGER.md`
rows M26-001…004, fixed).

**Authority, in order:** `CLAUDE.md` (a fix may not break these rules —
non-negotiable) → `docs/M26-QA-PLAN.md` (the reviewed sweep plan: §5 Wave 0,
§7.1 design contract, §7.2 state contract, §8 personas, §9 waves, §11 fix
rules) → `docs/M26-QA-LEDGER.md` (single-writer, append-only, 7 rows so far)
→ `docs/route-inventory.tsv` (coverage checklist, 87 routes) →
`docs/PRODUCTION-AUDIT.md` (Phase 2/3/4 backlog — don't rediscover what's
already ranked there).

**This document does not replace `M26-QA-PLAN.md`.** It is the concrete
execution order for Waves 1–5 of that plan, run by a single session, with
one deliberate reframing the next section states plainly.

---

## 0. The one reframing, stated so nobody re-derives it mid-sweep

`M26-QA-PLAN.md` §1 rules that **Q1 ("will a user like this") and Q3 ("can
it be improved") produce a capped list of ≤5 proposals per wave, not
fixes** — because they have no stopping rule and every real defect this
project has caught came from Q2/Q4. That rule stands; it is not overridden.

**The user's brief for this session states UI/UX refinement as the #1
priority**, with an explicit loop: UNDERSTAND → TEST → SCREENSHOT →
CRITIQUE → FIX → RETEST → SCREENSHOT → CRITIQUE. That is a Q1/Q3-heavy loop
run at full weight, not capped-and-filed. The reconciliation:

- **Every finding still gets severity per `M26-QA-PLAN.md` §2**, written
  before the fix is estimated, and still goes in the ledger with the same
  columns. Nothing about *how a finding is judged* changes.
- **What changes is the cap.** §9's "at most five Q1/Q3 improvements per
  wave, written as proposals and not implemented" is *lifted* for this
  execution pass — a Q1/Q3 finding that is a small, token-only,
  CLAUDE.md-legal CSS/copy change gets fixed in the same loop that found
  it, screenshotted before/after, and logged, exactly like a P1/P2. A
  finding that would need new components, new API fields, or a real
  design decision (the "whose taste settles a five-second test" problem
  §7.1 flags) still goes to the wave's proposals section — the cap lifts
  for cheap fixes, not for scope.
- **The budget does not change.** §2's 6-day / 80-finding stop rule still
  applies, and still ends the sweep the moment either limit is hit — see
  §9 below for how the fix mix affects when that budget is actually
  spent.
- **Say this explicitly at wave close.** Each `## Wave N — closed` ledger
  heading should note "Q1/Q3 cap lifted for this pass, per
  M26-SWEEP-EXECUTION.md §0" once, so a later reader of the ledger doesn't
  read an uncapped Q1/Q3 count as a process violation.

If in doubt whether a specific finding is cheap-enough-to-fix-now or
needs-a-proposal, default to **proposal** — that is the safer failure
mode against `CLAUDE.md`'s non-negotiable rules (tokens.css is law,
handoff/ is read-only, no Tailwind/inline-style, gold never as text).

---

## 1. Preflight (5 minutes, do this before opening a browser)

```bash
curl -s -o /dev/null -w "web:%{http_code}\n" http://localhost:3100/
curl -s -o /dev/null -w "api:%{http_code}\n" http://localhost:4100/api/v1/settings/public
```

Both should be non-5xx (`api` 404 on a bare `/health` path is fine — there
is no such route; use `/api/v1/settings/public` to actually prove the API
answers). If either is down, this is not a sweep blocker to solve
creatively — check `docs/M26-QA-PLAN.md` §0.1's symptom table first, then
`./scripts/qa-up.sh`.

**Corporate quote token — mint it now, once, before Chunk G.**
`scripts/qa-up.sh` does not auto-mint one (`grep -n quote scripts/qa-up.sh`
confirms it only prints the instruction). Sign in as admin, open
`/admin/corporate`, build and send a quote against any inquiry (seed one
via `/corporate` first if the queue is empty), copy the token from the
emailed/logged link, and record it at the top of the ledger's Wave 1
section — every sweeper needs it and it cannot be re-derived from the DB
(stored only as a hash).

**Screenshot evidence directory** (new for this pass — the repo's existing
`.gstack/qa-reports/screenshots/` is a stale 2026-07-28 run that still
shows a Laundry booking screen, withdrawn since M19; don't add to it):

```
.gstack/qa-reports/m26-sweep/screenshots/<chunk-letter>/<route-slug>-<1280|390>-<before|after>.png
```

e.g. `.../m26-sweep/screenshots/D/wallet-390-before.png`. Reference this
path in the ledger's Evidence column.

---

## 2. Credentials (source: `docs/TESTING.md`, do not restate elsewhere)

All demo accounts share one password: **`Passw0rd!123`**. Sign in at
`/login` (one field — email or phone, it relabels itself) or
`/admin/login` for the admin account only (email+password, never a code).

| Persona | Email | Role / lands at | Notes |
|---|---|---|---|
| Shopper — Ananya | `ananya.iyer@example.com` | consumer → `/account` | has delivered orders (reviews), a subscription-eligible history |
| HomeKrafter — maker, Anjali | `anjali@anjaliskitchen.example` | seller → `/seller` | full verified profile — reference for "done right" screenshots |
| HomeKrafter — ex-laundry, Ravi | `ravi@freshfoldlaundry.example` | seller → `/seller` | historical pickups only; **the "Laundry" persona for withdrawn-module checks** |
| HomeKrafter — snacks, Meera | `meera@meerassnackbox.example` | seller → `/seller` | snack menu + meal plans |
| HomeKrafter — crafts, The Slow Studio | `studio@theslowstudio.example` | seller → `/seller` | ships nationally — `/gifts` |
| HomeKrafter — crafts, Maati & Thread | `hello@maatiandthread.example` | seller → `/seller` | second crafts account, for cross-account isolation checks |
| Admin | `admin@homekrafted.example` | admin → `/admin` | **rotate/verify this isn't the compromised shared password before any write-heavy admin chunk — `LAUNCH-READINESS.md` §0.1** |

**One-time code** (only for the numbers below, code is always `123456`):
`+919845012345` (Ananya), `+919876543210` (Anjali), `+919822011223` (Ravi),
`+919008033445` (Meera). Never works for an email, never signs in the
admin.

**Brand-new HomeKrafter** — no seed exists; mint one live during Chunk H
(apply at `/sell` with a throwaway email, approve as admin, use the
mailed/logged invite link — this *is* the persona `CLAUDE.md` and the M26
plan both flag as "has broken twice", so don't skip it for a seeded
shortcut).

**Fixtures the route inventory names as needed and not seeded by
default:** a non-empty cart (for `/checkout` — add anything as Ananya
first), a `pending`/`rejected` listing (create one as any HomeKrafter,
check into admin catalog moderation to get both states), an order in each
status for `/account/orders/[id]` and `/admin/orders/[type]/[id]` (seed
via `seed-browser-orders.ts` if the default 21 orders don't cover the
status you need for a screenshot).

---

## 3. The loop, operationalized per route

For every route in a chunk, at both 1280px and 390px, signed in per the
persona column:

1. **UNDERSTAND** — read the route's server component + client component
   before touching the browser (`app/<route>/page.tsx` →
   `components/<area>/<Thing>Client.tsx`). Note: what API calls does it
   make (`lib/api/<area>.ts`), what states can it be in (loading / empty /
   error / degraded / populated), what's the primary action per §7.1.
2. **TEST** — `mcp__playwright__browser_navigate` to the route as the
   persona would arrive (not always the URL bar — follow the nav link a
   real visitor would use at least once per chunk). Perform the persona's
   primary job (§8 table). Use `browser_resize` for the 390px pass, not a
   separate profile.
3. **SCREENSHOT** — `browser_take_screenshot`, full page, before any fix,
   saved to the path in §1. Also screenshot the loading state
   (`browser_navigate` + immediate screenshot, before the client hydrates)
   and the empty state (fresh account / cleared filter) where the route
   has one — loading and empty are the two states a single "final" shot
   never shows.
4. **CRITIQUE** — apply §5 (design contract) and §6 (state contract)
   below, and check the defect-suspect list in §7 first — most chunks
   have at least one item from that list sitting inside them, so confirm
   or refute it before free-form judging. Answer the plan's four
   questions (`M26-QA-PLAN.md` §1). Route a design defect through the Q1
   vs Q4 rule: blocks the primary action → Q4/P1; merely worse → Q1
   (fixed now under §0's lifted cap if cheap, else proposed).
5. **FIX** — CSS Modules + `var(--hk-*)` tokens only, no new hex, no
   inline `style={{}}` except genuinely dynamic values (`CLAUDE.md`). A
   copy fix respects the HomeKrafter-not-seller and
   no-Laundry-as-live-service rules. Keep the diff to the one component;
   don't refactor adjacent code in the same pass.
6. **RETEST + SCREENSHOT** — same route, same viewport, `-after` suffix.
7. **CRITIQUE again** — confirm the fix actually reads better, didn't
   break the other viewport (check both), and didn't introduce a new
   axe violation if the route is one of the 7 in `PUBLIC_ROUTES`
   (`e2e/tests/a11y.spec.ts:23`) — run `cd e2e && npx playwright test
   a11y.spec.ts -g "<route>"` for public routes; for seller/admin routes
   there is **no automated net** (§7.4 below), so the human check is the
   only one.
8. **LOG** — one row in `docs/M26-QA-LEDGER.md` (or the sweeper's prefixed
   file per §10.2) per root cause, `Dupe-of` for repeat call sites, per
   the format already in that file.

**A P0/P1 fix needs a regression test in the layer that would have caught
it** (`M26-QA-PLAN.md` §11) — browser-only → `e2e/`, query-enforced →
`server/test/e2e/`. A Q1/Q3-cap-lifted cosmetic fix does not need a new
spec unless it's one of the three the plan already names as owed
(degraded-provider copy, in-flight labels, notification-survives-order).

---

## 4. Chunks

Ordered as they should run (§9 explains the ordering logic). "Depth" is
the tier from `docs/route-inventory.tsv` — **A = full four-question depth
at both viewports, B = automated smoke plus a lighter human pass** (skim
5-second-read + one state per route, not the full loop). Every chunk lists
the routes verbatim from the inventory so nothing is invented.

### Chunk A — First contact (anon, no login)
**Depth:** A on `/`, `/login`; B elsewhere. **Persona:** Cold visitor.
**Primary action:** decide in 5 seconds whether this is real, and whether
they can shop. **Routes:** `/`, `/about`, `/app-promo`, `/contact`,
`/corporate`, `/privacy`, `/refunds`, `/terms`, `/support`, `LocationPrompt`
(mounted on `/`, not a route). **Verify:** the location prompt's copy and
whether "Skip" carries equal visual weight to "Use my location"
(`components/location/LocationPrompt.tsx`); after skipping, `/shop` and
`/snacks` show `LocationBar`'s "Showing everything — we don't know where
you are" line (`components/location/LocationBar.tsx:48`) — confirm it's
actually mounted and visible, not just present in source; footer/nav links
all resolve; no dead internal link. **Fixtures:** none — anon only.

### Chunk B — Discovery & browse (anon)
**Depth:** A on `/shop`, `/search`, `/snacks`; B on `/gifts`, `/hamper`,
`/meal-plans`, `/collections/[occasion]`, `/guides/[slug]`. **Persona:**
Cold visitor, returning shopper (browsing, not buying yet). **Primary
action:** find one product in two clicks; trust the price/rating/delivery
promise. **Routes:** `/shop`, `/search`, `/snacks`, `/gifts`, `/hamper`,
`/meal-plans`, `/collections`, `/collections/[occasion]`,
`/guides/[slug]`. **Verify:** filter chips at 390px (Chip component — see
§7 finding, this is where it lives), price/rating agreement between card
and detail page, the `/search` empty state (already strong — see §7,
compare weaker ones against it), pagination or infinite scroll behavior on
`/shop` at 390px. **Fixtures:** `seed:occasion`, `seed:collection` (both
seeded by `seed-crafts.ts`/`seed.ts` — confirm present, else re-seed).

### Chunk C — Product & storefront (anon + shopper)
**Depth:** A on `/product/[slug]`, `/storefront/[vendor]`. **Persona:**
Returning shopper, cold visitor. **Primary action:** decide to add to
cart; decide to trust this specific kitchen. **Routes:**
`/product/[slug]`, `/storefront/[vendor]`, plus the error pair
`/product/nope`, `/storefront/nope` (both must 404 through
`app/not-found.tsx`, not a blank page). **Verify:** the three seeded
storefront states named in `docs/TESTING.md` (Anjali's Kitchen = full
verified profile, Home Batch = licence submitted/unchecked, any other =
no profile at all — confirm the "no empty Story/Photos section" rule
holds, not a blank heading); `ImageSlot` `alt` quality on product/vendor
images (see §7 finding — this chunk is where most of it lives);
`sizes`/`priority` on the hero image only.

### Chunk D — Cart, checkout, wallet (anon → shopper, money)
**Depth:** A on all four. **Persona:** First-time buyer. **Primary
action:** pay, without double-charging, without losing the cart on a
refresh. **Routes:** `/cart`, `/checkout`, `/wallet`. **Verify — highest
value chunk in the sweep:** the in-flight state on **every** money
button — place order (already correct, `CheckoutClient.tsx:664-666`,
reference implementation), **top up wallet (confirmed broken — §7
finding #1)**; the degraded-payments copy (`cardPayments === false`
branch, already present and well-written in both `CheckoutClient.tsx` and
`WalletClient.tsx:195-206` — confirm it still renders honestly if
Razorpay keys have since landed, since that branch "never renders in CI
again and rots silently" per the plan); checkout with an **empty** cart
renders the empty branch, not a permanent nothing
(`CheckoutClient.tsx:391`); `/checkout`'s "Delivering to…" band matches
the picked address. **Fixtures:** seeded cart (add as Ananya first) —
route-inventory.tsv flags `/checkout` explicitly as needing this or it
"renders the empty branch forever."

### Chunk E — Consumer account, order lifecycle (shopper)
**Depth:** A on `/account/orders/[id]`, `/account/subscriptions`; B on the
rest. **Persona:** Returning shopper, meal subscriber. **Routes:**
`/account`, `/account/addresses`, `/account/following`,
`/account/notifications`, `/account/orders`, `/account/orders/[id]`,
`/account/profile`, `/account/referrals`, `/account/reviews`,
`/account/subscriptions`, `/account/wishlist`. **Verify:** cancel (before
`packed`) refunds **and reverses cashback**; return (within 7 days of
`deliveredAt`) moves no money and says so; review requires delivered;
reorder pre-fills the cart and names anything sold out/paused; the meal
subscription arithmetic ("why 11 meals when I paid 14" — skip pushes the
end date out, pause/cancel move no money); the bare-`<p>Loading…</p>`
pattern at `OrderDetailClient.tsx:78` and `ProfileClient.tsx:48`,
`FollowingClient.tsx:63` (§7 finding #4 — these are Tier-adjacent to the
Tier A order-detail route). **Fixtures:** `seed:order` for
`/account/orders/[id]` — use Ananya's seeded delivered order, or a fresh
one from Chunk D for the cancel/return paths (the seeded ones may be
outside the 7-day return window, which is correct behaviour, not a bug —
place a fresh order to see the window open).

### Chunk F — Snacks, meal-plan subscribe, full-meal promo (channel rules)
**Depth:** A on `/snacks`, `/meal-plans/[slug]`. **Persona:** Snack buyer,
meal subscriber. **Routes:** `/snacks`, `/meal-plans`,
`/meal-plans/[slug]`, `/app-promo` (full-meals promo half — already in
Chunk A's list, re-verify against `lib/channel.ts` here specifically).
**Verify — channel rules are `CLAUDE.md` non-negotiables:** Snacks has
**no cart, no checkout** anywhere — any add-to-cart button here is a P0
per the channel matrix, not a style nit; the delivery-window picker
carries the slot into the WhatsApp message (`Requested for: …`); a picker
never offers an already-past slot; the subscribe total is visible
**before** the button is pressed (`MealPlanSubscribeClient.tsx:213-231`,
already correct — the total sits above the button); the subscribe
button's in-flight label (`busy ? "Starting your plan…" : ...` at line
235 — already correct, reference implementation); the bare
`<p>Loading…</p>` at `MealPlanSubscribeClient.tsx:113` (§7 finding #4,
this one *is* Tier A). **Fixtures:** `seed:meal-plans` — confirm
`seed-meal-plans.ts` ran, or this whole chunk is empty and that's a false
positive, not a product bug (`M26-QA-PLAN.md` §0.1's symptom table).

### Chunk G — Corporate quotes (anon + admin, two-sided)
**Depth:** A on `/corporate/quote/[token]`; B on `/corporate`,
`/admin/corporate`, `/admin/corporate/[id]`. **Persona:** Corporate buyer
(token only, no account), admin. **Routes:** `/corporate`,
`/corporate/quote/[token]`, `/admin/corporate`, `/admin/corporate/[id]`,
plus `/corporate/quote/garbage` (must 404, identical wording to a
withdrawn link). **Verify:** no login wall on the token page; the line
table stacks (not sideways-scrolls) below 620px —
`QuoteClient.module.css:307-341` already solves this well, use it as the
reference when judging `CorporateInquiryDetailClient.module.css:148-151`'s
5-column admin builder grid, which only collapses to 2 columns at 780px
and was never given the same treatment (§7 finding #10); accept requires
typed name + tick, two steps; a spent/withdrawn/re-sent-superseded token
all 404 identically. **Fixtures:** the token minted in §1 preflight.

### Chunk H — Becoming and being a HomeKrafter (apply → approve → operate)
**Depth:** A on `/sell`, `/seller/listings`, `/seller/listings/new`,
`/seller/orders`, `/seller/payouts`; B on the rest of `/seller/*`.
**Persona:** Applicant, brand-new HomeKrafter, established HomeKrafter
(Anjali/Meera/the two craft studios), ex-laundry HomeKrafter (Ravi).
**Routes:** `/sell`, `/seller`, `/seller/login`, `/seller/analytics`,
`/seller/listings`, `/seller/listings/[id]`, `/seller/listings/new`,
`/seller/meal-plans`, `/seller/meal-plans/[id]`,
`/seller/meal-plans/deliveries`, `/seller/meal-plans/new`,
`/seller/menu`, `/seller/menu/[id]`, `/seller/menu/new`,
`/seller/orders`, `/seller/orders/[id]`, `/seller/payouts`,
`/seller/pickups`, `/seller/pickups/[id]`, `/seller/profile`,
`/seller/reviews`, `/seller/storefront`. **Verify — this chunk holds most
of §7's findings:** the moderation-reason-lost-on-edit gap (finding #3);
the seven dead-end not-found states (finding #2); the nine bare-loading
call sites, several of which are in this chunk (finding #4); the three
bare one-liner empty states on `/seller/orders`, `/seller/payouts`,
`/seller/reviews` (finding #5); §8.1's brand-new-HomeKrafter arc in
full — zero-everything dashboard, first listing going `pending`, day-two
"waiting" vs "broken." **Fixtures:** the invite-link HomeKrafter minted in
§2; `seed:own-listing`/`seed:own-order`/`seed:own-plan`/`seed:own-snack`/
`seed:own-pickup` are all row-scoped to whichever seller account is
signed in — use Anjali (maker), Meera (snacks + meal plans), a craft
studio (gifts), and Ravi (pickups only) to cover all four; **cross-check
that Anjali's session 404s on Meera's row IDs**, not 403s and not 200s —
that's a real permissions test, not a fixture problem.

### Chunk I — Admin oversight, moderation, payouts, disputes
**Depth:** A on `/admin/payouts`, `/admin/sellers`, `/admin/support`; B on
the rest. **Persona:** Admin. **Routes:** `/admin`, `/admin/analytics`,
`/admin/catalog`, `/admin/catalog/[id]`, `/admin/catalog/reviews`,
`/admin/collections`, `/admin/collections/[id]`, `/admin/collections/new`,
`/admin/collections/occasions`, `/admin/collections/promo`,
`/admin/login`, `/admin/orders`, `/admin/orders/[type]/[id]`,
`/admin/payouts`, `/admin/sellers`, `/admin/settings`, `/admin/support`,
`/admin/users`, `/admin/users/[id]`, `/admin/wallet`,
`/admin/wallet/[userId]`. **Verify — this is where finding #1's second
half lives:** the approve/reject buttons on `/admin/sellers`'s
application queue have **zero** in-flight state
(`components/admin/ApplicationRow.tsx:51-56`) — double-click it under
Wave-5-style hostility and confirm whether it double-submits (this is a
P1 candidate, not just cosmetic, per §7.2's explicit rule); every refusal
(reject/hide/takedown/flag) captures a reason and the HomeKrafter sees it
**verbatim**; the audit log answers "who did this" on every mutation;
CSV export opens clean in a spreadsheet (leading apostrophe on `+91…` and
`=`/`+`-prefixed cells). **Fixtures:** `seed:product`, `seed:collection`,
`seed:inquiry`, `seed:user`, `seed:order` (two-segment) — all present in
the base seed; a `pending`/`rejected` product needs creating live (via
Chunk H) since the seed defaults everything to `active`.

### Chunk J — Auth surfaces (all roles, signed out)
**Depth:** A on `/login`; B on the rest. **Persona:** everyone, signed
out. **Routes:** `/login`, `/signup` (same page per M25), `/forgot-password`,
`/reset-password`, `/admin/login`, `/seller/login`. **Verify:** the
one-field form relabels itself as you type; the 409→code branch for a
password-less approved HomeKrafter (typing any password shows "no
password yet" and offers the code, not "incorrect password" —
`auth-form.spec.ts` already pins this at the browser layer, re-verify
visually); "Use a code instead" is visible **before** any failure, not
only after one; forgot-password says "if an account exists" uniformly;
admin login rejects a code entirely and never signs in via social.
**Fixtures:** none beyond §2's accounts.

### Chunk K — Withdrawn-module & error-surface honesty pass
**Depth:** targeted, not a full route sweep — this chunk re-visits
specific states inside chunks already swept. **Persona:** ex-laundry
HomeKrafter (Ravi), anyone hitting a dead link. **Routes:** `/laundry`
(must 404), `/gallery` (must 404 in the production build only — run
`npm run build && npm start` for this one specifically, `npm run dev`
will show it and that is not a bug), a thrown render error (any route,
trigger by breaking a fetch), `/product/nope`, `/storefront/nope`,
`/guides/nope`, `/collections/nope`, `/corporate/quote/garbage`, a
signed-out deep link into `/account/*`, `/seller/*`, `/admin/*`.
**Verify:** no live copy names Laundry as something a buyer can still do
— ledger row M26-004 already fixed `OrdersListClient`, confirm no other
surface regressed the same way (grep `laundry` across `client/components`
case-insensitively as a final check, not just the one file already
fixed); `app/not-found.tsx`'s voice (specific, blames nobody, two ways
out) is the reference — anywhere else showing a *different* 404 style is
a P2 finding, one root cause.

### Chunk L — Cross-cutting: hostility, keyboard, 390px, a11y
**Depth:** applied across chunks D, E, F, H, I (the money/trust flows),
not a separate route list. **Persona:** keyboard-only / screen-reader
user, everyone under double-click and rapid resubmit. **Verify:** every
Tier A route completed with Tab/Enter/Space only, no mouse; skip-to-content
lands past the header; the six named money buttons (top-up, place order,
subscribe, payout request, admin pay, admin approve) survive a rapid
double-click without a double-submit — start here, since §7 already found
two of the six with **no** guard at all; the `Chip` component's ~28px tap
target (§7 finding #7) against the 44px floor, everywhere it's used as a
filter or status tab; run `cd e2e && npx playwright test a11y.spec.ts` for
the 7 covered public routes and treat every seller/admin route as
**manually-checked-only** (§7.4) since nothing automated reaches them.

---

## 5. UI/UX judgement criteria, grounded in this repo's actual tokens

Not generic advice — every line below cites the file that makes it
checkable.

**Color** (`client/styles/tokens.css` + `tokens.extend.css`): canvas
`#F4F3F0`, cards `#FFFFFF` + `1px #ECEAE4` border, never a beige/cream
fill. Gold (`--hk-gold` `#B98724`, 3.6:1 on white) is fills/borders/icons
only — any gold **text** must be `--hk-gold-text-sm` (`#886815`,
`tokens.extend.css:32`). Terracotta (`--hk-terracotta`) is prices and
"remove" only; on its own tint use `--hk-terracotta-text`
(`tokens.extend.css:69`). Muted body copy is `--hk-muted`/`--hk-muted-2`
— **already corrected** in `tokens.extend.css:86-87` to clear AA; if a
component still imports a raw hex instead of the token, that's the
defect, not the color itself.

**Type** (`handoff/design-system/design-system.md` §2): Fraunces =
display/prices, Plex Sans = body/controls, Plex Mono = eyebrows/meta,
always uppercase, `.12–.22em` tracking. House rhythm is **eyebrow → title
→ body** — `components/feedback/RouteSkeleton.tsx` draws this shape
literally; any screen whose visual weight runs the other way (body-sized
text above a title, no eyebrow where every sibling section has one) is a
P2 hierarchy inversion.

**Spacing/layout** (`design-system.md` §3): 4px scale (`--hk-s1..s8`),
sibling groups laid out with `flex`/`grid` + `gap`, never margin-spaced
inline children. Grid breaks at 430px (nav → menu button) and maxes at
1180px (`.container`). A component reaching for a bare pixel margin
between two siblings that live in the same flex row is worth a second
look — check whether `gap` was available and skipped.

**Radius/elevation** (`design-system.md` §4): cards 16px, promo
bands/panels 20px, inputs/thumbs 8–11px, tappable-round = pill (999px).
Two shadows only, `--hk-shadow-card` and `--hk-shadow-stage`. A third
shadow value or an off-scale radius is a token-discipline defect, not
taste.

**The five-second read** (`M26-QA-PLAN.md` §7.1): on every Tier A route,
name in order — the `<h1>` in the buyer's words, the one primary action
above the fold at 390px, the trust signal owed (price/rating/verified
badge/delivery expectation), then everything else. Failing to name 1–3
inside five seconds **is** the finding.

**Touch** (§7.1, explicitly unmeasured by automation): 44px minimum tap
target, phone-first. Check this by measuring, not eyeballing — `Chip`
(`components/ui/Chip.module.css`) is already known to fail it (§7).

**Images:** `ImageSlot`'s `alt` defaults to `label`, a filename — axe's
`image-alt` only checks presence, so a caller that knows the real name
and doesn't pass `alt` ships a filename to a screen reader and nothing
catches it automatically (§7 finding #8 has four live examples). Check
`sizes` on every avatar/thumbnail and `priority` on the one LCP image per
page, not more.

**Naming:** HomeKrafter in every user-facing string; `seller` only in
code/URLs. A visible "seller" in copy is a finding.

**Voice:** `app/not-found.tsx` is the reference — specific, blames nobody,
two ways out. Straight (`'`) vs curly (`'`) apostrophes are inconsistent
site-wide (confirmed: 192 straight-apostrophe contractions vs 11 curly
across `client/app` + `client/components`) — per the plan's own ruling,
pick one in the first chunk touched and log every other file as one P3,
not 180 individual findings.

---

## 6. State contract — check all five on every Tier A route

Per `M26-QA-PLAN.md` §7.2, restated as a checklist:

- [ ] **Loading** — a shape-matched skeleton in the slot that will fill,
  not a bare "Loading…" line. `RouteSkeleton` is the standard; the ledger
  already ruled `OrdersListClient`'s bare text a P2 deviation — §7 finding
  #4 lists nine more call sites of the same deviation still live.
- [ ] **Empty** — three parts: what's missing (a noun), why (new account /
  filter too narrow / genuinely none), the way out (one action). §7
  finding #5 has five call sites that fail all three, one of them the
  exact sentence (`"No orders in this status."`) the plan itself already
  cites as the reference failure.
- [ ] **Error** — inline, `role="alert"`, adjacent to what failed, in the
  user's words, retry without re-entering data.
- [ ] **Degraded** — a capability off because a key is missing says so
  (`cardPayments === false` branches on `/wallet` and `/checkout` are
  already well-written references for this).
- [ ] **In-flight** — every money button relabels within 100ms of the
  click. §7 findings #1 and #2 are two of the six named money buttons with
  **no** in-flight state at all — start Chunk D and Chunk I there.

---

## 7. Defect-suspect list — read this before free-form judging each chunk

Ten root causes, each with the exact call sites, verified by reading the
source (not by running the app). Ordered by expected severity. Numbers in
brackets are how many distinct file:line locations each root cause
touches — 34 locations total across 10 findings, comfortably inside the
"one root cause = N call sites, one ledger row" convention this project
already uses (`Dupe-of`).

**#1 — The wallet top-up button has no in-flight state at all. [1 site,
P1 candidate]**
`client/components/wallet/WalletClient.tsx:244-248`. `handleTopUp`
(`:101-124`) does a real `await topUp(effectiveAmount)` network call;
`disabled={!effectiveAmount || cardPayments === undefined}` never becomes
`true` during the await, and the label never changes from "Top up wallet
→". Compare with the correct pattern four lines away in
`CheckoutClient.tsx:664-666` (`disabled={placing || ...}`,
`{placing ? "Placing order…" : "Place order"}`) — the fix is a one-line
copy of an existing pattern in the same codebase. This is one of the six
buttons `M26-QA-PLAN.md` §7.2 names explicitly ("top-up, place order,
subscribe, payout request, admin pay, admin approve") and calls a
disable-only button "the direct cause of the double-submit Wave 5 is
hunting." Test in Chunk D with a rapid double-click.

**#2 — Admin's approve/reject on the seller queue has no busy state and
no disable. [2 sites, P1 candidate]**
`client/components/admin/ApplicationRow.tsx:51-56` — two `<Button>`s with
`onClick={() => onApprove(application.id)}` / `onReject`, no `disabled`
prop at all. `client/components/admin/SellersClient.tsx:112-122` — the
shared `run()` wrapper that both handlers go through has no busy flag
either (`setActionError` only, no `setBusy`). This is "admin approve", the
sixth named money-adjacent button in §7.2's list, and it is the only one
of the six with literally zero guard — not even a disable. Compare with
the correct pattern already in the same file area,
`components/admin/PayoutsClient.tsx:253-259`
(`disabled={busy || ...}`, `{busy ? "Saving…" : ...}`). Test in Chunk I.

**#3 — A rejected listing's reason is shown on the list row and
disappears exactly where a HomeKrafter can act on it. [3 sites]**
`client/components/seller/ListingRow.tsx:47-62` correctly surfaces
`product.moderationNote` ("Not approved: …" / "Taken down by Homekrafted:
…" / "Paused while we look into this: …"). Open the item to fix it —
`client/components/seller/SellerListingEditorClient.tsx` (171 lines) never
reads `moderationNote` or `moderationStatus` anywhere; `productToFormValues`
(`:25-52`) maps every other product field into the form and drops both.
Same gap in `client/components/seller/SellerMenuEditorClient.tsx` and
`client/components/seller/MealPlanEditorClient.tsx` (neither file contains
the string `moderationNote`). This is exactly the comprehension gap
`M26-QA-PLAN.md` §8.1 names for the brand-new-HomeKrafter arc: "does \[the
reason\] reach them on the listing, where they can act, or only in a
notification they may never open?" Right now it reaches the list, not the
edit form. Test in Chunk H.

**#4 — Seven "not found" states are dead ends with no way back, though
four sibling admin screens already solve this correctly. [7 broken + 4
reference sites]**
Broken (all reuse a generic loading/text div, zero navigation):
`SellerListingEditorClient.tsx:146` ("Listing not found."),
`SellerMenuEditorClient.tsx:102` ("Snack not found."),
`MealPlanEditorClient.tsx:136` ("Meal plan not found."),
`MakerOrderDetailClient.tsx:107` ("Order not found."),
`SnackOrderDetailClient.tsx:85` ("Order not found."),
`PartnerPickupDetailClient.tsx:137` ("Booking not found."),
`CorporateInquiryDetailClient.tsx:153` ("Enquiry not found.", **admin**,
not seller — the bug crosses the role boundary). The fix already exists,
copy-paste-ready, in four other admin components:
`UserDetailClient.tsx:54-61`, `CollectionEditorClient.tsx:135-142`,
`OrderDetailClient.tsx:113-121`, `AdminListingEditorClient.tsx:128-136` —
all four render a `<Link href="/admin/…" className={styles.back}>` with a
`ChevronLeft` + "Back to X" **before** the not-found `Card`. Test across
Chunks H and I.

**#5 — Bare "Loading…" text, in violation of the ledger's own ruling, at
nine more call sites. [9 sites, P2 each, one root cause]**
`M26-QA-PLAN.md` §7.2 already ruled (design decision #19): "the skeleton
is the standard; `OrdersListClient`'s bare text is the deviation, P2" —
that specific file is fixed. The same deviation is still live at:
`SellerListingEditorClient.tsx:142`, `MealPlanEditorClient.tsx:132`,
`SellerMenuEditorClient.tsx:98`, `CorporateInquiryDetailClient.tsx:152`
(admin), `CollectionEditorClient.tsx:130` (admin),
`MealPlanSubscribeClient.tsx:113` (**Tier A** —
`/meal-plans/[slug]`), `FollowingClient.tsx:63`,
`OrderDetailClient.tsx:78` (account, feeds the **Tier A**
`/account/orders/[id]`), `ProfileClient.tsx:48`. File one ledger row,
`Dupe-of` the nine sites, fix each with `RouteSkeleton` (or the smallest
skeleton shape matching that screen's layout) since that's the pattern
already established in `app/*/loading.tsx`.

**#6 — Bare one-liner empty states, including the exact sentence the plan
already cites as the reference failure. [5 sites]**
`M26-QA-PLAN.md` §7.2: `"No orders in this status."` fails all three
required parts (what/why/way out) and is used as the plan's own
illustrative failing example. It is still live, verbatim, at
`MakerOrdersClient.tsx:85` and `SnackOrdersClient.tsx:84` — both feed the
**Tier A** route `/seller/orders`. The sibling `PartnerPickupsClient.tsx:91`
has the same pattern ("No pickups in this status."). Also:
`SellerReviewsClient.tsx:65` ("No reviews yet.") and
`SellerPayoutsClient.tsx:125` ("No payouts yet.", feeds **Tier A**
`/seller/payouts`). None state why (is the filter too narrow, or is there
truly nothing?) or offer a way out (e.g. "Clear filter" when a status
filter is active and hiding real rows). Fix: reuse the three-part pattern
already correct on `app/search/page.tsx:96-104` (what/why/CTA) as the
template.

**#7 — The `Chip` component's tap target is roughly 28px, well under the
44px floor the plan names as unmeasured by any automated tier. [1
systemic site, used platform-wide]**
`client/components/ui/Chip.module.css:18-24`: `padding: 6px 13px` at
`font-size: 12.5px`, no `min-height` declared. The wrapping `.filterRow`
containers (checked: `MakerOrdersClient.module.css:1-6`) add no extra
padding to compensate. `Chip` is the filter and status-tab control on
Tier A `/shop`, the `role="tablist"` status filters on `/seller/orders`,
`/seller/menu`, `/seller/pickups`, plus every admin list filter and the
occasion/category chip rows across the public site. `M26-QA-PLAN.md` §7.1
states this criterion "appears nowhere in the automated tier" — this is
the single highest-leverage fix in the whole list because one CSS change
(`min-height: 44px` on the tappable element, or padding to match) fixes
every surface at once. Verify at 390px in Chunks B and L specifically.

**#8 — `ImageSlot` ships a filename as `alt` on consumer list surfaces
that already know the real name in the same JSX block. [4 sites]**
CLAUDE.md's own rule: "any caller that knows the product/vendor name
should pass \[`alt`\]." Confirmed not passed, with the real name rendered
two lines below the `<ImageSlot>` in the same component, at:
`WishlistPageClient.tsx:94-99` (`product.name` used at `:103` but not
passed as `alt`), `FollowingClient.tsx:81-88` (`vendor.name` at `:90`),
`MyReviewsClient.tsx:88-94` (`item.name` follows), `app/search/page.tsx:140-147`
(`vendor.name` follows). Axe's `image-alt` rule only checks presence, so
this is invisible to the automated suite and CI will stay green — this is
exactly the "alt quality is a human job" case CLAUDE.md calls out. Test in
Chunk C (storefront images) and Chunk E (wishlist/reviews/following).

**#9 — Straight vs curly apostrophes, confirmed at scale, already a known
P3.** [systemic, no fix required beyond the plan's own ruling]
Counted client-wide (`client/app` + `client/components`): 192
straight-apostrophe contractions vs 11 curly. `M26-QA-PLAN.md` already
rules "Wave 1 picks one, the other is P3" — this confirms the scale (the
plan's own number, "39 vs 5", was `components/` only). No new action
beyond following the existing ruling: pick curly (matches
`app/not-found.tsx`'s reference voice, which already uses curly), log one
ledger row, don't open 180 individual findings.

**#10 — The admin corporate-quote builder's line-item grid never fully
stacks at narrow widths, though its buyer-facing sibling already solved
the identical problem. [1 site, lower priority — admin desk tool]**
`client/components/admin/CorporateInquiryDetailClient.module.css:148-151`
(`.lineRow { grid-template-columns: 1.2fr 2fr 70px 90px 34px; }`) only
collapses to `grid-template-columns: 1fr 1fr` at 780px (`:233`) — a
5-column row squeezed into 2 columns, not stacked. Contrast with
`client/components/corporate/QuoteClient.module.css:307-341`, which has an
explicit comment: "A four-column table at 360px would scroll the page
sideways. Below the breakpoint each line becomes a small card instead,"
and does exactly that (`.lineHead` hidden, `.line` becomes
`grid-template-columns: 1fr auto` with `.lineDesc` spanning full width).
Tier B, admin-only — check in Chunk G but don't let it block the wave; the
buyer-facing side (which matters far more) is already correct.

---

## 8. Ordering by risk-weighted value

**Value = (money or trust exposure) × (how many personas/routes the root
cause touches) ÷ (fix cost). Risk = confidence the finding is real
(everything in §7 is source-verified, not guessed) × blast radius of the
fix (CSS-only < shared-component < schema).**

1. **Chunk D (cart/checkout/wallet) first, always.** It is the only chunk
   where a defect is P0-class by the plan's own ladder (money moves
   wrongly), and finding #1 lives here with a same-file one-line reference
   fix already sitting in `CheckoutClient.tsx`. Highest value, lowest
   fix-cost, lowest risk.
2. **Chunk L's hostility pass on Chunks D and I's money buttons**, run
   immediately after fixing #1 and #2 — confirm the double-submit guard
   actually holds under a rapid double-click before moving on, per the
   plan's own note that a disable-only button is "the direct cause of the
   double-submit Wave 5 is hunting."
3. **Chunk I (admin)** next — finding #2 is the same class of defect as
   #1 and equally cheap to fix, and admin is where a mistake (an
   unlabelled destructive action, per the plan's Wave 4 judgement
   question) has the widest blast radius per click.
4. **Chunk H (HomeKrafter portal)** — the single largest cluster of
   findings (#3, most of #4, most of #5, most of #6) and the arc the plan
   itself calls the second emotional make-or-break moment (§8.1). Fixing
   #7 (Chip touch target) here too, since `/seller/orders` and
   `/seller/menu`'s status tabs are Chip-based Tier A/B surfaces.
5. **Chunk B and C (browse, product, storefront)** — #7's platform-wide
   fix should already be visible here once landed in step 4; verify it
   didn't regress the desktop filter layout. #8 (alt quality) gets fixed
   here and in Chunk E together, since it's the same root cause in both.
6. **Chunk E (consumer account)** — money-adjacent (cancel/return/review/
   subscription arithmetic) but lower defect density found so far;
   standard four-question depth, no known suspects beyond #5's two sites.
7. **Chunk F, G** — channel-rule correctness (P0-class if violated, so
   don't skip the verification even though no defect is currently
   suspected) plus #10's lower-priority fix.
8. **Chunk A, J, K** — first-contact polish, auth, and the withdrawn-module
   honesty re-check. Lower defect density expected (LocationPrompt and
   LocationBar both read as already well-built from source; auth is
   heavily tested at the browser layer already per the M25/M26 fixes).
9. **#9 (apostrophes)** gets fixed opportunistically inside whichever
   chunk each file falls under — it is not its own pass.

**Stopping rule — inherited from `M26-QA-PLAN.md` §2, not redefined:** 6
working days of sweep, or 80 ledger rows, whichever comes first. Given
§0's lifted cap, expect the finding count to climb faster than in a
capped Q1/Q3 run — **re-check the 80-row count after Chunk H specifically**
(the densest chunk); if it's already past 50, finish Chunk H's four P1
candidates (#1–#4 wherever they appear inside it), close every chunk that
was mid-flight, and roll the rest into `docs/PRODUCTION-AUDIT.md` Phase 3
exactly as the plan's stopping rule requires. Zero P0 stays open. Zero P1
stays open that is fixable in code — #1 and #2 are both fixable in code
and both cheap, so neither should still be open at the stop point.

---

## 9. What "done" means for this execution pass

- Every chunk in §4 has a `## Wave N — closed <date>` heading in the
  ledger (or this document's own tracking, since chunks don't map 1:1 to
  the plan's six waves — note which wave each chunk's findings roll into)
  with a swept-route count and a P0/P1 count of zero.
- §7's ten findings are each either fixed-with-screenshots-and-a-ledger-row
  or explicitly deferred with a reason in `docs/PRODUCTION-AUDIT.md`
  Phase 3, per the plan's DoD.
- Every P0/P1 fix carries the red-against-parent-commit evidence in the
  ledger's Fix column, per `M26-QA-PLAN.md` §11.
- `docs/route-inventory.tsv`'s `swept_1280`/`swept_390` columns are filled
  for every route this pass touched — `grep -c '\t—\t' docs/route-inventory.tsv`
  before and after should show the delta.
- `CHANGELOG.md` gains one entry for this pass, and any `CLAUDE.md` rule
  this pass's fixes touch (none currently expected to — everything in §7
  is CSS/copy/state-handling, not a rule change) gets updated in the same
  commit per the docs-upkeep table.
