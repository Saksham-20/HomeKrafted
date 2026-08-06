# Homekrafted — CLAUDE.md

Quick context for any future session (human or agent) working in this repo.
Read this first, then the plan and docs it points to.

## What this is

Homekrafted is a home-craft platform: a **Gifting Marketplace**
(multi-vendor, hampers, occasions) and **Snacks + Food Delivery** (Snacks
browsable + WhatsApp order; full meals promo-only), unified by one
**Wallet** and one shared account layer. **Laundry, Cleaning & Ironing**
was a third module and is **withdrawn as of M19** — the route 404s, the
create endpoints return 410, and the models stay so existing bookings
still render. Don't build on it; see the channel table below. It ships as a **monorepo**: `client/` (the Next.js
web app — all web source lives here), `server/` (a standalone backend API
**shared by the web + the native apps**, arriving in M8), and `app/` (the
native mobile apps — React Native/Expo, future). The web is built
frontend-first with typed mock data before the backend lands; `client/lib/api`
now makes **real calls** against `server/` (`NEXT_PUBLIC_USE_MOCK=true`
reverts every module to the old in-memory mocks for offline frontend work).

**Live:** https://homekrafted.in (www redirects to apex; Let's Encrypt,
auto-renewing) — see `docs/DEPLOY.md` (runbook,
env, one-command redeploy) and `docs/TESTING.md` (tester handout, demo
accounts).

- **Approved plan (scope authority):** `~/.claude/plans/read-the-handoff-i-jolly-hennessy.md`
- **Design system (visual contract):** `handoff/design-system/` + the reference
  prototype `handoff/prototype/Homekrafted.dc.html`
- **Docs:** `docs/` (PRD, API, architecture, data model, design system, ADRs)
- **Launch readiness (keys, ops, legal):** `docs/LAUNCH-READINESS.md` —
  what stands between this build and real customers. Mostly *not* code:
  provider keys, database backups, monitoring, and the paperwork
  Razorpay needs. Read it before claiming anything is production-ready.
- **Production audit + launch roadmap:** `docs/PRODUCTION-AUDIT.md` —
  every gap between this build and a public launch, ranked, with a
  four-phase roadmap. **Phase 1 shipped (M15); phases 2–4 are the
  standing backlog** — check it before proposing new work, so a "great
  idea" isn't already a ranked item there.
- **Changelog:** `CHANGELOG.md`, one entry per milestone

## Standing blockers (true as of 2026-08-06) — none of them are code

The build is feature-complete against every approved plan and deployed.
These three are what still stand between it and real customers, and each
is the kind of thing a session will otherwise assume is already handled.

- **An approved HomeKrafter still cannot sign in.** Twilio is unset, so a
  real OTP reaches the server log and nowhere else, and phone OTP is the
  *only* first sign-in an approved kitchen has (approval never sets a
  password — see the M17 section). `OTP_TEST_CODE` is scoped to four demo
  numbers, so it does not help a real one. **This, not the software, is
  what caps supply growth** — don't plan around onboarding kitchens until
  it is fixed. One afternoon of config.
- **The platform collects nothing.** `commissionPct` (default 10) exists
  only as a modelled number on the admin analytics screen; nothing deducts
  it, and `Payout.amount` is gross. Deliberate — a take rate is a business
  decision, not a bug fix — so don't "fix" it in passing. Both the
  `/admin/payouts` queue and `docs/LAUNCH-READINESS.md` §3b say so out
  loud; keep it that way until someone decides.
- **The home page's "Backed by" strip is unverified.** CUNA, ISB Atal
  Incubation Centre and CGC — `backedBy` in `lib/data/site.ts`, rendered by
  `app/page.tsx`. Deliberately plain text rather than logos, because
  reproducing a mark is a separate permission from stating a relationship
  and we hold neither in writing. Confirm each before the site is promoted
  publicly: an unverified affiliation on a live site is legal exposure, not
  a copy nit.

## Execution model

**Opus plans + reviews, Sonnet builds.** Opus writes each milestone's brief,
dispatches a Sonnet subagent per milestone with the brief + this file +
Definition-of-Done, then reviews the diff (`/review`, `/design-review`,
`/security-review` for backend) before integrating. If you are a Sonnet
session picking up a milestone: read the brief, read this file, read the
design system, build exactly to spec, self-check the Definition-of-Done,
then report back — don't expand scope into later milestones.

Milestones (see the plan for full detail): **M0 Foundation** → M1 UI
primitives → M2 Marketplace browse → M3 Buy flow → M4 Laundry → M5 Snacks
+ Food promo → M6 Wallet → M7 Account & shared (done) → **M10 Seller
portal** (`/seller/*`) → **M11 Admin panel** (`/admin/*`) → M8 Secure
backend (role-based auth/RBAC, Postgres+Prisma, wallet ledger + payouts,
Razorpay) → M9 Integrations (WhatsApp Cloud API, notifications) → **M12
HomeKrafter + local** (single supply role, item availability, tricity
location filtering, pre-order) → M13 brand/domain → M14 image uploads →
**M15 Phase 1 production readiness** (search, review submission, buyer
cancel/return, admin payouts, admin disputes, follow, reorder, error/404
boundaries, SEO — see `docs/PRODUCTION-AUDIT.md` + CHANGELOG) → **M16
Phase 2** (rich HomeKrafter profiles + verification, occasion hub, seller
analytics, pre-order calendar, `next/image`, admin reports, a11y).

**Three role surfaces, one app, route groups in `client/`:** consumer `/`
(built), seller `/seller/*` (M10), admin `/admin/*` (M11) — each its own
login + shell, gated by `client/middleware.ts` on `User.role`
(`consumer|seller|admin`), all sharing `components/ui` + tokens + `lib`.
**One supply role — "HomeKrafter" (M12).** `Seller.type`
(maker/laundry/snack) is gone; it gated module access and is replaced by
`Seller.specialties: SellerSpecialty[]`, a **discovery/display tag that
must never decide access**. Every HomeKrafter has a `vendorId` (required)
and every portal module. All `/seller/*` controllers resolve through the
single `SellerService.resolveHomeKrafter` — no per-type 403s. Dashboards
stay scoped to the caller's own `vendorId`/`sellerId`; admin unscoped.

**Naming:** user-facing copy says **HomeKrafter(s)**. Code keeps `seller`
— `role: "seller"`, `/seller/*` routes, `Seller` type, DB columns —
because renaming those churns middleware, the `hk_role` cookie, JWT claims
and the Prisma enum for nothing a user sees.

## Stack

- **Next.js** (App Router, React, TypeScript), npm
- Styling: **CSS Modules** over `styles/tokens.css` (no Tailwind, no inline
  styles like the prototype)
- Fonts: `next/font/google` — Fraunces, IBM Plex Sans, IBM Plex Mono
- Icons: `lucide-react` (line icons) + inline SVG for brand marks
  (WhatsApp/App Store/Play) when needed
- `clsx` for conditional className composition
- **server/**: NestJS + Prisma + Postgres 16, JWT auth, Razorpay (test keys),
  WhatsApp/SMS/email providers all env-gated (placeholder → logged stub)
- **No Tailwind, no shadcn, no framer-motion, no cva.** Components sent in
  that style get *ported* to CSS Modules + `--hk-*` tokens, never pasted.

## Run commands

**All web commands run from `client/`** (the Next.js app root):

```
cd client                # <- do this first for any web work
npm run dev              # dev server, http://localhost:3000
npm run build            # production build (also type-checks)
npm run lint             # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit         # standalone type-check
```

`handoff/**` is excluded from lint scope (see `eslint.config.mjs`) — it's a
reference file, not app source; don't "fix" lint errors in it, and don't
remove the ignore.

## Directory map

Monorepo. **All the web paths named elsewhere in this file (`app/`, `lib/`,
`components/`, `styles/`) are relative to `client/`.**

```
<repo root>                MONOREPO
  client/                  Next.js web app — ALL web source lives here
    app/                     App Router routes
      layout.tsx              root layout — fonts, tokens.css/globals.css, shell
      page.tsx                Home (minimal in M0; full Home is M2)
      gallery/                dev-only primitives gallery (unlinked; M1 QA)
    components/
      layout/                 AnnouncementBar, Header (+HeaderClient), MobileDrawer, Footer
      placeholder/            ImageSlot — labelled placeholder, see below
      ui/                      ~26 primitives from handoff/design-system/components.md (M1)
      product/ laundry/ snacks/ wallet/ account/   (M2+)
    lib/
      types/                  THE SCHEMA CONTRACT — domain types → Prisma in M8
        shared.ts wallet.ts marketplace.ts laundry.ts food.ts index.ts
      data/                   mock data, typed against lib/types, seeded from the prototype
      tokens.ts               typed TS mirror of tokens.json (for JS-side use only)
      format/                 formatCurrency, formatDate helpers
      channel.ts              channel rules — what each module may do on web
      messaging.ts            Messaging interface + click-to-chat (wa.me) impl
      api/                    typed async fns — the ONLY way components read data
                              (real HTTP to server/; NEXT_PUBLIC_USE_MOCK=true reverts to mocks)
      geo.ts                  haversine + TRICITY_AREAS — mirror of server/src/common/geo.ts,
                              KEEP THE TWO IN STEP or buyer/kitchen resolve to different points
      schedule.ts             rolling delivery days + windows; suppresses today's expired slots
      location/               LocationContext (localStorage + `hk_loc` cookie mirror)
                              + server.ts#getBuyerCoords for Server Components
    styles/
      tokens.css              verbatim copy of handoff/design-system/tokens.css — LAW
      tokens.extend.css       app-level vars for the known token gaps (M1) — NOT part of handoff
      globals.css             reset, base body, font-variable bridge, .container utility
  server/                  standalone backend API — NestJS + Prisma + Postgres (live)
    src/common/geo.ts        haversine, TRICITY_AREAS (source of truth for kitchen coords)
  scripts/deploy.sh        pull main + build + migrate + pm2 restart on the box
  ecosystem.config.cjs     pm2 process definitions
  app/                     native mobile apps — React Native/Expo (future; placeholder now)
  handoff/                 DESIGN SYSTEM ONLY — read, never edit, never delete
  docs/                    PRD, API, architecture, data model, design system, ADRs
  CLAUDE.md  CHANGELOG.md
```

## Non-negotiable rules

- **`handoff/` is the design system, not code to copy, and it stays
  untouched.** `tokens.css`, `tokens.json`, `design-system.md`,
  `components.md` are the visual contract. `Homekrafted.dc.html` (the
  `x-dc`/`DCLogic` comp) is a proprietary reference for exact colors,
  layout and sample data — never lift its markup or its inline-style
  approach, and never edit or delete anything under `handoff/`.
- **`styles/tokens.css` is law.** It's a verbatim copy — don't edit it to
  "fix" something; if a value is missing (see "Known token gaps" below),
  hardcode it locally with a comment and flag it, don't invent a token
  name and drop it straight into `tokens.css`.
- **White-first, warmth is accent-only.** Canvas `#F4F3F0`, cards
  `#FFFFFF` + `1px #ECEAE4` border. Never reintroduce beige/cream fills.
- **Gold (`--hk-gold` `#B98724`) is decorative-only: ≥16px bold, or pure
  decoration (eyebrows, "view all").** Never body text or small UI copy at
  regular weight — its contrast on white is only 3.6:1. Terracotta
  (`--hk-terracotta`) is for prices/remove in the marketplace.
- **Real photos where supplied, placeholder otherwise — always via
  `<ImageSlot>`.** Brand photography lives under
  `client/public/images/{products,categories,snacks,vendors,site}`;
  HomeKrafter- and buyer-uploaded photos live at `/uploads/...` (M14, see
  below). Both are just a `src` — `<ImageSlot src={...}>` falls back to the
  labelled diagonal-hatch placeholder when it's absent. **Never generate or
  AI-fabricate product/food imagery** (Firefly/Canva/Higgsfield image-gen
  stay unused) — only real assets, real uploads, or the placeholder.
- **CSS Modules only**, consuming token vars (`var(--hk-...)`), not
  scattered hex. No inline `style={{...}}` styling (that was the
  prototype's technique, not ours) except for genuinely dynamic values
  (e.g. `<ImageSlot>`'s `aspect-ratio`).
- Mobile-first, fluid. No fixed 430/1180 "stage" (that was the
  prototype's reviewer chrome). Container maxes out at 1180px via the
  `.container` utility class (`styles/globals.css`), grace­fully down to
  360px. Header collapses to a hamburger + `<MobileDrawer>` below ~840px.

## Channel rules (see `lib/channel.ts` — read before building any module screen)

| Module | Browse web | Checkout web | Pre-order web | Live tracking |
|---|---|---|---|---|
| Marketplace | yes | full web checkout | yes | status only (no map/rider) |
| Snacks | yes (menu) | **no** — WhatsApp only (`wa.me`), no cart/checkout on site | yes | WhatsApp status text |
| Full meals | **no** — promo only, no menu/cart | app-only | yes (interest only) | app-only |
| ~~Laundry~~ | **withdrawn (M19)** — `enabled: false`, `/laundry` 404s, `POST /laundry/bookings` and `/subscriptions` return 410 | | | |

`hasPreOrderOnWeb` is deliberately separate from `hasCheckoutOnWeb`:
scheduling is information, not a transaction. Snacks/meals carry the
chosen slot into the **WhatsApp message**, never an order record on the
site — so pre-order never reopens the cart question.

`CHANNEL_RULES` in `lib/channel.ts` is the enforceable form of this table —
check `isChannelEnabled` first, then `hasMenuOnWeb` / `hasCartOnWeb` /
`hasCheckoutOnWeb` before rendering anything in a Snacks or full-meals
screen. If a component would need a flag that isn't there, add it to
`ChannelRule`, don't route around the module.

`enabled` (M19) is the odd one out: every other flag describes *how* a
live module behaves, this one says whether it is offered at all. A
withdrawn module keeps its rule so the types and the order history that
reference it still resolve — read it through `isChannelEnabled`, never by
reaching into `CHANNEL_RULES`, or the flag becomes decoration.

## Meal subscriptions (M19) — the recurring product, and its money rules

`MealPlan` (what a kitchen offers) → `MealSubscription` (one buyer's
prepaid run) → `MealDelivery` (one row per meal owed). Rules that are easy
to undo by accident:

- **A cycle is prepaid, in one wallet debit. Nothing charges in the
  background.** There is no saved card and no mandate; `creditTopupTx` is
  reachable only from the verified Razorpay webhook. Adding a daily
  auto-charge without a real UPI AutoPay/e-mandate would recreate the exact
  bug M19 opened by deleting. The prepaid model also avoids the worst
  failure on a daily-food product: "lunch didn't arrive because you were
  ₹20 short."
- **The money is posted last, inside the same transaction as the
  subscription and its deliveries.** An insufficient balance throws and
  takes all of it with it. There is no state where somebody holds a
  schedule they did not pay for — the e2e asserts exactly that.
- **`MealSubscription.pricePerMeal` is a snapshot, never re-read from the
  plan.** Reading the plan fresh would protect the kitchen and silently
  change what the buyer pays mid-cycle. A rise applies at renewal, where
  they can see it.
- **Every meal is a row.** Skip, pause and a kitchen blackout are recorded
  facts, not arithmetic on a counter — which is what makes "why do I have
  11 meals left when I paid for 14" answerable.
- **A skipped meal is owed, not lost.** The cycle grows a day at the far
  end. A buyer who paid for 24 meals gets 24 meals.
- **Cancel moves no money.** Same rule as M15 returns: auto-refund would
  make the most abusable path the most frictionless, and the loss lands on
  a home cook. An admin resolves it through `POST /wallet/adjust`.
- **A paused subscription keeps its seat** against `MealPlan.maxSubscribers`;
  a cancelled one gives it back. Somebody away for a week has not given up
  their tiffin. `maxSubscribers` is also the first place a home cook's
  stated ceiling is actually *enforced* — `VendorProfile.capacityPerDay`
  has existed since M16 and is checked nowhere.
- **`isActive` (the kitchen's switch) and `moderationStatus` (the admin's)
  stay separate**, same as `Product`. Both must pass. A hidden plan 404s
  rather than 403s, on read *and* on subscribe — hiding it in the list
  while leaving the write path open is the usual half-fix.
- **`meal-brackets.ts` never reads the clock.** Every function takes `now`
  or a start date, so a Server Component can compute a window once and ship
  it as text (the M12 React #418 lesson). `bracketStart` is a label
  (`"12:30"` = 12:30–13:00), not an instant.
- **Absence is not closure**, carried over from M16: no stated
  `workingDays` means open every day, and no `prepTimeMins` means the
  90-minute default, never zero.

## Location & availability (M12) — read before touching catalog or portal

- **Location is never a gate.** No coords → the API returns the *full*
  catalogue, and the UI says so. The browser prompt has a manual tricity
  area picker behind it and a first-class "skip". Most people decline a
  location prompt; a visitor who declines must still be able to shop.
- **Two copies of the area table** (`client/lib/geo.ts`,
  `server/src/common/geo.ts`) because client/ and server/ are separate
  packages. They MUST stay identical — a kitchen's coords come from the
  server's table at approval, a buyer's from the client's; drift silently
  mis-sorts distance.
- **Server Components can't read `localStorage`.** `/shop` and `/snacks`
  read the `hk_loc` cookie via `getBuyerCoords()`. Any new server-rendered
  listing page must do the same or it will silently ignore the filter.
- **Anything keyed on the current time must be client-only.** The schedule
  derives from `new Date()`; computing it during SSR caused React #418
  (server and browser disagree on "Today"). Build in an effect after mount
  behind a stable placeholder.
- **Two different "is this visible" switches, don't merge them:**
  `Product.isAvailable`/`Snack.available` is the HomeKrafter's "am I making
  this today"; `moderationStatus` is the admin's. Buyers need both to pass.

## Docs upkeep — do this as part of the work, not after

Features pile up and these rot fast. When a change lands, update in the
same commit:

| Changed | Update |
|---|---|
| Domain model / roles / channel rules | `CLAUDE.md` (this file) + `docs/DATA-MODEL.md` |
| Any endpoint added/changed/removed | `docs/API.md` |
| Anything a tester can see or click | `docs/TESTING.md` |
| Env vars, services, deploy steps, rate limits | `docs/DEPLOY.md` |
| A gap you fixed that the audit listed | mark it ✅ in `docs/PRODUCTION-AUDIT.md` |
| A milestone's worth of work | `CHANGELOG.md` (one entry per milestone) |

Rules of thumb: if a doc now says something **untrue**, that's a bug —
fix it in the same change, don't leave a contradiction next to the new
text. If you removed a concept (a role, a flag, an endpoint), grep for its
name across `docs/` and `CLAUDE.md` before you finish. Keep this file
compact: it is loaded into every session, so prefer replacing stale
paragraphs over appending new ones.

## How to add things

- **New domain field/entity:** edit the right file under `lib/types/`
  (`shared` / `wallet` / `marketplace` / `laundry` / `food`), export it
  from `lib/types/index.ts` (barrel already does `export *`), then add/
  update the corresponding mock data in `lib/data/` and a getter in
  `lib/api/`. This is the same shape that becomes the Prisma schema in M8
  — model it like a real column, not a UI convenience field.
- **New mock data:** add it in `lib/data/<area>.ts`, export from
  `lib/data/index.ts`, then expose it through an `async` function in
  `lib/api/<area>.ts` — components should only ever import from
  `@/lib/api`, never reach into `@/lib/data` directly (keeps the M8
  mock→real swap to one layer).
- **New component:** CSS Modules co-located with the `.tsx`
  (`Thing.tsx` + `Thing.module.css`), named export (not default), styles
  reference `var(--hk-...)` tokens. If it needs client interactivity
  (state, event handlers), split a server wrapper (data fetching via
  `lib/api`) from a `"use client"` component (interaction) the way
  `Header.tsx` → `HeaderClient.tsx` does — don't make an entire
  data-fetching tree client-side just because one button needs state.
- **New screen/route:** follow the route tree in the plan
  (`app/{shop,hamper,laundry,snacks,wallet,account/...}`). Reuse
  `ImageSlot` for every image, check `lib/channel.ts` before adding
  cart/checkout UI, use `formatCurrency`/`formatDate` from `lib/format`
  rather than ad hoc formatting.
- **New milestone:** read the plan's milestone table + this file, build
  exactly to the brief's scope (resist finishing later milestones early),
  self-check the Definition-of-Done, update `CHANGELOG.md` and any
  affected `docs/*.md`, then report back with what changed and any
  decisions that need Opus's confirmation.

## Known token gaps — centralized in `styles/tokens.extend.css` (M1)

The prototype uses a few recurring colors for text/dividers sitting on
solid or tinted brand backgrounds that aren't in `tokens.css` today.
Flagged locally-hardcoded-with-comments during M0; as of M1 they're
centralized as real CSS custom properties in `client/styles/tokens.extend.css`
(imported once, right after `globals.css`, in `app/layout.tsx`) so every
`components/ui/*.module.css` file can reference `var(--hk-...)` instead of
repeating the raw hex. `tokens.css` itself stays untouched and remains law —
`tokens.extend.css` is purely additive and NOT part of the `handoff/`
design system.

- `--hk-on-pine: #eadfc9` — copy on solid `--hk-pine` (announcement bar,
  tag chips, badges on dark cards, PromoBand's dark variant,
  WalletBalanceCard).
- `--hk-gold-text-sm: #8a6a16` — gold-family text/icons at small sizes on
  white/gold-tint, where base `--hk-gold` (3.6:1 on white) isn't AA-safe
  below ~16px/bold (wallet chip, cashback lines, StickySummary's cashback
  line, Button's `ghost-gold` label).
- A light-on-`--hk-pine-deep` ramp, used on the footer and any other solid
  dark-pine surface: `--hk-footer-ink: #c7d3c5` (body), `--hk-footer-ink-2:
  #a9bcae` (link list), `--hk-footer-muted: #9fb3a5` (brand blurb),
  `--hk-footer-mono: #7e9488` (mono legal row), `--hk-footer-border:
  #2c473a` (divider above the legal row).
- `--hk-scrollbar: #d9cdb4` — the `.hk-scroll` scrollbar-thumb tint
  (decorative, low stakes; see `styles/globals.css`).

A few narrower one-off gaps (each used in exactly one component) stayed as
local hardcoded-plus-comment values rather than joining `tokens.extend.css`,
since centralizing a single-use color doesn't pay for itself: ProductCard's
`.added` border (`#b7d0bd`), SnackCard's `.added` border (`#b7e0c4`),
TransactionRow's debit icon tint (`#f6e7e0`), StoreBadges' on-dark border
(`#56493a`). See each component's `.module.css` for the inline rationale.

## Image uploads (M14) — read before adding another photo field

Never add a text input for an image path; that was the pre-M14 pattern and
it asked a home cook to type a server path. Use `<ImageUpload>` for a
single image or `<PhotoUpload>` for a list — both drag/click/paste, upload
to `POST /uploads?purpose=…`, and hand back a URL to store.

- **Store the `url`, not the `key`.** It's relative today (`/uploads/...`)
  and absolute behind a CDN driver; storing the URL is what makes swapping
  `StorageDriver` a config change rather than a data migration.
- **`purpose` is a closed set** (`listing|menu|storefront|application|
  laundry`) shared between `lib/api/uploads.ts` and
  `server/src/uploads/uploads.service.ts`. Adding a field means adding a
  purpose in both — it decides the folder, so it can never be free-form.
- **The server decides the file type from the bytes**, not the filename or
  `Content-Type`. Don't add a type to the allowlist without checking it's
  inert when served from our own origin (this is why SVG is excluded).
- **Nothing deletes old files yet.** Replacing a photo orphans the previous
  one. See `docs/DEPLOY.md`.

## Hampers, auth and notifications (M18) — three rules that bite

- **A hamper is a `Product`, marked `isHamper`. There is no builder.**
  The buyer-assembled wizard (box tier → fill from the catalogue) is gone;
  a HomeKrafter lists a hamper they assemble and price themselves, and
  `/hamper` is the catalogue filtered on the flag. The flag must stay
  *only* a filter — the moment it decides visibility, pricing or
  eligibility, "a hamper is an ordinary listing" stops being true and the
  duplication comes back. A hamper still appears in `/shop`, search and its
  category; hiding it there would cost the kitchen sales for ticking a box.
  The `Hamper`/`HamperItem`/`HamperBox` tables and `POST /cart/hamper-items`
  survive **only** so pre-M18 orders still render — don't build on them.
- **`OTP_TEST_CODE` is scoped to `OTP_TEST_PHONES` and never applies to an
  admin.** `otp/verify` creates an account for a number it doesn't
  recognise, so a fixed code that worked for any number would be a
  complete authentication bypass — sign in as anyone, including a
  HomeKrafter whose payout details you could then change. Both env vars
  must be set or the bypass doesn't exist. Delete `OTP_TEST_CODE` the day
  real SMS works.
- **Every path that writes `Order.status` owes the buyer a message.**
  Three modules do (`OrdersService`, `SellerOrdersService`,
  `AdminOrdersService`) and all three go through
  `OrderNotificationsService`, never a bare `notify()`. Use `void` — a
  paid order must not roll back because a message failed. Transactional
  notification categories default to **WhatsApp on**; `promo` never does,
  because a WhatsApp block is per-sender and one promo would cost every
  future order update to that person.

## Trust & money loops (M15) — don't quietly reopen these

Phase 1 of `docs/PRODUCTION-AUDIT.md` closed five loops that had been
built from one end only. Each carries a rule that is easy to undo by
accident:

- **A review needs a delivered order.** `POST /reviews` refuses anything
  else. Don't relax it to "any signed-in user" for testing convenience —
  an open review endpoint on a platform built on trusting a stranger's
  kitchen is a review-bombing surface. Seed a delivered order instead.
- **Denormalised aggregates are recomputed from rows, never
  incremented** — `Vendor`/`Product`/`Seller` `rating`+`reviewCount`
  (`ReviewAggregatesService`) and `Vendor.followerCount`. Any new path
  that hides, un-hides or deletes a review **must** call the recompute,
  or a moderator's action silently doesn't apply.
- **Cancellation closes at `packed`; returns close 7 days after
  `deliveredAt`.** Both are enforced server-side; the UI only decides
  what to *offer*. `deliveredAt` is stamped wherever an order reaches
  `delivered` (seller advance, admin override) — a new transition path
  has to stamp it too or the return window silently falls back to
  `placedAt`.
- **A return request moves no money.** An admin resolves it. Auto-refund
  would make the most abusable path the most frictionless, and the loss
  lands on a home cook.
- **`POST /admin/payouts/:id/pay` records a settlement, it does not
  perform one.** There is no payout provider. The `reference` is the only
  link to a real transfer. Both payout decisions are one-way.
- **A customer replying to a `resolved` ticket reopens it** — the admin
  queue's "waiting on us" count depends on that being true.

## HomeKrafter profiles & verification (M16) — the badge is the product

`VendorProfile` (1:1 with `Vendor`) and `VendorPhoto` hold everything a
buyer reads before trusting a stranger's kitchen. Rules that are easy to
undo by accident:

- **A seller can never set their own verification.** `fssaiVerified` /
  `identityVerified` / `addressVerified` are absent from
  `UpdateSellerProfileDto`; `forbidNonWhitelisted` turns an attempt into
  a 400. The only write path is
  `PATCH /admin/sellers/:id/verification`, which audits before/after.
  Adding these to the seller DTO "for convenience" destroys the only
  thing making the badge worth anything.
- **Submitting a changed `fssaiNumber` clears the verification.**
  Otherwise editing the thing being verified preserves the badge that
  verified it.
- **`fssaiNumber` never enters the public payload.** The buyer needs the
  verified fact, not the licence identifier.
- **Trust score, achievements and completion are computed on read**
  (`VendorProfileService`), never stored — same rule as M15's rating
  aggregates. `cancellationRate` is `null`, not `0`, before anything has
  closed.
- **Never render the trust score as a bare number to a buyer.** The
  storefront shows the tier plus every signal, met and unmet. A score
  with no working shown is a platform-invented metric nobody can act on.
- **Keep `/seller/storefront` and `/seller/profile` separate.** The
  first is the four catalogue fields that ride on every product card;
  the second is the story/hours/policies nothing else reads. Merging
  them puts a return policy on every listing query.
- **An empty profile renders as a shorter page, not an empty one.**
  Every section is conditional. A kitchen approved this morning is the
  normal case, and the completion meter — in the portal, aimed at the
  person who can fix it — is where gaps get named.

## Occasions & guides (M16) — dates are set by a person

- **`Occasion.celebratedOn` is an absolute date, not a recurrence rule.**
  Diwali, Raksha Bandhan and Karwa Chauth are lunisolar and land on a
  different Gregorian date every year. Never add a "repeats yearly" flag
  or an `MM-DD` column — it would be wrong for exactly the occasions the
  hub exists for. An admin rolls them forward on
  `/admin/collections/occasions`.
- **`null` is evergreen, not missing.** Birthdays and thank-yous have no
  season; `/collections` lists them separately rather than giving them a
  countdown.
- **`lib/occasions.ts` never reads the clock** — every function takes
  `now`. That is what lets a Server Component compute a countdown once
  and ship it as text without re-deriving "today" during hydration
  (the M12 React #418 lesson). Any page rendering a countdown needs
  `revalidate` too, or a static prerender freezes it at build time.
- **A `Collection` is a gift guide with its own page** (`/guides/[slug]`),
  not only the curated ordering behind an occasion. `occasionId` stays
  optional — a standalone guide is normal. Don't merge the two routes:
  that would cap an occasion at one guide forever.

## Pre-order availability (M16) — absence is never a closure

Three switches, kept apart on purpose: `VendorProfile.workingDays` (the
weekly pattern), `VendorBlackoutDate` (specific exceptions),
`VendorProfile.prepTimeMins` (how much notice). Merging any two makes one
silently override another — the same reason `Product.isAvailable` and
`moderationStatus` stay separate.

- **No working days stated = open every day.** No prep time stated = the
  platform's 90-minute default, never zero. A HomeKrafter who has filled
  in nothing must not silently stop taking orders.
- **`getScheduleDays` was extended, not replaced.** Passing no
  `availability` reproduces the pre-M16 behaviour exactly. Keep it that
  way — every caller that doesn't know a vendor still needs a working
  scheduler.
- **Closed days render struck through, not dropped**, with the reason in
  the button's accessible name. A date that just isn't there reads as a
  bug.
- **Blackouts are specific dates, never a recurrence rule.** The weekly
  pattern already exists; this is the exception to it.

## Accessibility floor (M16) — what every new surface owes

- **`.hk-sr-only`** (`styles/globals.css`) is the screen-reader-only
  class. Don't copy a local one into a module — three had already been
  duplicated, and a recipe that gets one property wrong (`display: none`
  hides it from assistive tech too) fails invisibly.
- **A dialog owes three things**, not one: move focus in on open, trap
  Tab at both ends, restore focus to whatever opened it. `aria-modal`
  without them is a claim the page doesn't honour. `MobileDrawer` and
  `LocationPrompt` are the reference implementations.
- **Anything hidden off-screen must leave the tab order.** A
  `transform: translateX(100%)` panel is still focusable; use
  `visibility: hidden` (delay the transition so the animation survives).
  `aria-hidden` over focusable elements is itself a violation.
- **Icon-only buttons need `aria-label`.** `<Button variant="icon">`
  exists precisely so this is not forgotten.
- **`ImageSlot` needs a real `alt`** — see its section above.

## Auth & identity (M17) — three ways this broke at once

All three shipped, were reviewed, and were manually tested. None of them
had a test, and none was visible from reading the happy path.

- **An approved HomeKrafter has no password.** Approval mints the account
  (`authProviders: ['phone']`) and an admin never sets a credential, so
  **phone OTP is the only first sign-in.** Any surface offering to sign a
  HomeKrafter in must offer it. Removing the Phone tab from
  `/login?role=seller` locks out every kitchen onboarded for real, and
  the error they get says "Incorrect email or password" for a password
  that never existed.
- **Never resolve the signed-in seller from `lib/data`.** Use
  `GET /seller/me` (`getMySeller()`). The mock list contains only seeded
  kitchens, so a lookup for a real one misses — and falling back to a
  demo record shows one HomeKrafter another's name and `vendorId`.
  Anything derived from a session must fail empty, never fall back to a
  fixture.
- **A login form must use what was typed.** `/admin/login` called a
  hardcoded-credential helper and threw its inputs away — full admin to
  anyone who opened a publicly routable page. Check the role the *server*
  returns; don't trust which form was used.
- **No credential belongs in a client module.** `AuthContext` is
  `"use client"`, so its constants ship in the public bundle: the seeded
  admin's email and password were readable with view-source. Demo
  accounts are documented in `docs/TESTING.md` and typed into the normal
  form — there are no "continue as demo ___" buttons, and adding one back
  reintroduces this.
- **`@BooleanField()` is the only correct way to declare a boolean
  request field.** The global pipe's `enableImplicitConversion` turns
  every non-empty string into `true`, so a bare `@IsBoolean()` read
  `"false"` as `true` — on the verification badge, wallet auto-top-up and
  more. See `server/src/common/decorators/boolean-field.decorator.ts`.

## Tests (M17) — `docs/TESTS.md`

`cd client && npm test` · `cd server && npm test` · `cd server && npm run
test:e2e` (needs `TEST_DATABASE_URL` — see `docs/TESTS.md`). CI runs all
of it plus typecheck, lint and both builds.

Three layers: pure functions in `client/lib/**/*.spec.ts`, services with a
stub Prisma in `server/test/unit/`, and **a real Nest app against a real
Postgres** in `server/test/e2e/`. Prisma is never mocked in the e2e layer
— every rule worth guarding here is enforced by a query, and a mocked one
would test the mock. Compute expected values by hand; a number recorded
from a run locks in the bug.

## SEO — every new public route owes three things (M15)

`lib/seo.ts` is the seam: `pageMetadata()` for title/description/
canonical/OG in one call, `jsonLdProps()` for structured data,
`SITE_URL` from `NEXT_PUBLIC_SITE_URL`.

1. **Metadata** — `export const metadata = pageMetadata({...})`, or
   `generateMetadata` for a dynamic route. Never hand-roll a `Metadata`
   object; that's how a page ships a title and no canonical.
2. **`app/sitemap.ts`** — add it if it's public and indexable.
3. **`app/robots.ts`** — add it to `disallow` if it's behind a login,
   per-visitor, or a dev surface.

A `"use client"` route file **cannot export `metadata`** — split a server
wrapper the way `app/cart/page.tsx` → `components/cart/CartPageClient.tsx`
does. Only claim `aggregateRating` in JSON-LD where reviews actually
exist.

**Never put a `loading.tsx` over a route that can `notFound()`.** A
`loading.tsx` is a Suspense boundary; a dynamic route behind one starts
streaming — status line included — before the page body runs, so a later
`notFound()` can't set 404 and the visitor gets a **soft 404** (right
page, 200 status). Measured during M15: a root `app/loading.tsx` made
`/product/nope` and `/storefront/nope` return 200; deleting it restored
404. Boundaries therefore live only on `/shop`, `/search`, `/snacks` and
the two dashboard groups — never app-wide.

## `ImageSlot` — how every image renders, uploaded or not

`components/placeholder/ImageSlot.tsx`:

```tsx
<ImageSlot
  ratio="1/1"              // any CSS aspect-ratio value: "1/1", "1.5/1", "16/5", "4/5"...
  label="mango_pickle_hero.jpg — front"
  size="1200×1200"          // optional export-size caption
  shape="rect"              // "rect" | "square" | "circle" (avatars/category tiles)
  compact                   // optional — smaller label chip, for dense thumbnail grids
/>
```

With a `src` it renders that image through **`next/image`** (M16, `fill`
over the wrapper's aspect ratio); without one it renders the
diagonal-hatch placeholder from the prototype. The `src` may be a bundled
asset (`/images/...`) or an upload (`/uploads/...`) — `ImageSlot` doesn't
care, which is why upload wiring needed no changes here.

Three props matter and are easy to forget:

- **`alt`** — the real description. Defaults to `label`, which is a
  *filename*, so any caller that knows the product/vendor name should
  pass it. `alt=""` is correct only when the name is already the next
  thing in the DOM (storefront banner, category tile, guide cover).
- **`sizes`** — defaults to a grid card. A 88px avatar or a 64px
  thumbnail must say so, or the browser downloads a viewport-wide image
  to fill it.
- **`priority`** — one or two per page, on the actual LCP element only.
  Marking everything priority is the same as marking nothing.

`images.remotePatterns` in `next.config.ts` is **empty on purpose**:
uploads are same-origin (nginx serves `/uploads/` — see `docs/DEPLOY.md`),
so nothing needs allowlisting. Don't widen it to `**` to make a CDN work.

## Fonts & tokens wiring (established in M0 — don't re-derive this)

`app/layout.tsx` loads all three families via `next/font/google` and
exposes them as CSS variables on `<html>`: `--font-fraunces`,
`--font-plex-sans`, `--font-plex-mono` (Fraunces: 400–700 + italic; Plex
Sans: 400/500/600; Plex Mono: 400/500). `styles/tokens.css` is imported
first (verbatim copy, ships literal `'Fraunces', Georgia, serif` etc. font
stacks) and `styles/globals.css` imports second, re-declaring
`--hk-font-display` / `--hk-font-body` / `--hk-font-mono` to point at the
loaded font vars with the same fallbacks — later import wins the cascade,
so tokens.css never needs editing. Components should keep using
`var(--hk-font-display)` etc.; they'll resolve to the real loaded fonts
automatically.

## Naming conventions established in M0

- Named exports for components (`export function Thing()`), not default
  exports — except page/layout files, which Next.js requires as default.
- `Thing.tsx` + `Thing.module.css`, same directory, same base name.
- Server components fetch via `lib/api` and stay `async function`; client
  components get a `"use client"` file suffix-free but directive-marked,
  usually named `ThingClient.tsx` when a server/client split is needed.
- Mock data ids are short area-prefixed strings (`pr1`../`vd1`../`ct1`..,
  see `lib/data/*.ts`), not slugs — `slug` is a separate field, faithful
  to how these will exist as real DB rows + URL-friendly slugs later.

## Standing decisions (carried from M0)

- ~~**`About` nav** points at `/`~~ — superseded: `/about` is a real route
  and the nav points at it.
- **Wishlist is in `<MobileDrawer>`** — otherwise unreachable below 840px.
- **`LoyaltyTier`** = `bronze|silver|gold|platinum` (naming pending brand input).
- **Laundry `pricingModel`** uses all three union values: Wash & Fold
  `per-kg`, Dry Clean + Steam Ironing `per-item`, Home Cleaning `per-hour`
  (prototype says "per room", which doesn't map to the union).
- **Every vendor is seeded** (one per seed product incl. "Homekrafted"
  itself) so no `Product.vendorId` dangles.

Superseded: the hardcoded laundry day-picker dates (server now generates
rolling days from today — see `lib/schedule.ts`).
