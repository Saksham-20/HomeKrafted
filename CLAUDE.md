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

## Standing blockers (true as of 2026-08-15)

**Social sign-in is verified since M27; the remaining gap is config.**
`POST /auth/social/:provider` requires a real Google/Apple **id-token**,
checked by `server/src/auth/social-token-verifier.ts` (jose + JWKS,
issuer + audience allowlist, nonce, bounded age) — the pre-M27 "trusts a
posted email" takeover is closed and pinned by tests. What's left is
that **no Google OAuth client ID or Apple service ID is configured**:
with the env unset the verifier registers no provider and the endpoint
refuses every token, so the buttons can't work until someone creates
those IDs (`docs/LAUNCH-READINESS.md` §0.4). Don't "fix" a failing
social login by weakening the verifier — set the IDs.

**Razorpay is on real test keys since 2026-09-01, and going live is
config only.** Nothing branches on `rzp_test_` vs `rzp_live_`: the one
key-sensitive gate is `PaymentsService.isMockMode`, comparing against the
`.env.example` placeholders. The browser takes the key from the API
response (`rzpOrder.keyId || NEXT_PUBLIC_RAZORPAY_KEY_ID`), so the
server's key wins and a live switch needs **no client rebuild** — set the
two server vars plus `RAZORPAY_WEBHOOK_SECRET`, subscribe
`payment.captured` in the dashboard, restart. See `docs/DEPLOY.md`.

**These are not code.** The build is feature-complete against
every approved plan and deployed; these are what still stand between it
and real customers, and each is the kind of thing a session will otherwise
assume is already handled.

- **An approved HomeKrafter can now be onboarded by hand (M32; show-once
  since M37), and the provider keys are still the real fix.** Approval
  issues a username and a short temporary password, returned **once** in
  the approve/issue response so an operator can read them down a phone —
  **nothing stores the plaintext** (M37 dropped `User.tempPassword`; only
  the argon2 hash exists). A lost password is re-issued from the row
  ("Issued ‹date›, not yet used → Re-issue"), which rotates the hash and
  revokes sessions — never re-read. It is force-rotated at first sign-in
  (`User.mustChangePassword`, enforced in `JwtAuthGuard`) and never
  written to an audit row. **This reverses the M21 rule that an admin
  must never set a HomeKrafter's password** — that rule assumed the
  invite arrives, and it does not. Retire the whole mechanism once
  SendGrid/Twilio are set. The M21 machinery below still exists and still
  runs alongside it.
- **The invite link half (M21).** Approval now mints a single-use,
  7-day set-password link and sends it by **email and SMS**
  (`SellerInviteService`), so phone OTP is no longer the only door. What
  remains is purely config: with SendGrid and Twilio unset both channels
  degrade to a logged stub, and **the admin screen says so** — "Approved,
  but we could not reach them", with the link shown so it can be handed
  over by hand. `POST /admin/sellers/:id/resend-invite` re-sends and burns
  the previous link. Until the keys are set, **this still caps supply
  growth**; it is now one afternoon of config and nothing else.
- **The commission engine exists; the switch is off (M37).**
  `commissionEnabled` (PlatformSettings, default **false**, strict
  `'true'` parse) decides whether a payout request deducts
  `commissionPct`. The split is computed once at request time
  (`server/src/seller/payout-split.ts`) and **stored on the row** —
  `amount` stays the payable figure; `grossAmount`/`commissionAmount`/
  `commissionPct` are its arithmetic, absent on pre-M37 rows where
  `amount` was always gross. Pending balances subtract
  `COALESCE(grossAmount, amount)` so flipping the flag never
  double-counts. The rate rides on `GET /seller/me` (`commission:
  { pct, enabled }`) — the listing form and payout screen compute from
  it, **never a hardcoded percentage** — and every surface says
  "estimate" while the flag is off. Flipping it is a business decision
  (audited, on `/admin/settings`), not a bug fix — don't turn it on in
  passing, and don't recalculate a payout already requested.
- **The "Backed by" strip is unverified, and now carries the
  logos.** CUNA, ISB AIC and CGC-J VentureNest — `backedBy` in
  `lib/data/site.ts`, rendered by `components/about/AboutClient.tsx`
  (**on `/about` since M28**, moved off the home page where it closed the
  page under the makers), marks under
  `public/images/backers/`. Until M24 this was plain text on the reasoning
  that reproducing a mark is a separate permission from stating a
  relationship; the owner supplied the three files and chose to ship them
  (2026-08-08), which settles the second permission and **not the first**.
  The exposure is therefore *larger* than it was — an affiliation asserted
  with the other party's mark attached is a bigger claim to withdraw than
  one in small grey text. Confirm each relationship in writing before the
  site is promoted publicly. Two rules when editing: **never alter a mark**
  (no recolour, no grayscale, no crop — optical differences are handled by
  per-logo display height in `AboutClient.module.css`), and **keep the `detail`
  sentence under each mark** — the logo identifies the organisation, the
  sentence states the relationship, and dropping it turns a stated
  affiliation into an implied endorsement. M24 also corrected "Supported by
  CGC" to name the entity on the mark; the verb was deliberately left alone
  so a name fix did not quietly upgrade the claim.

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

**The taxonomy is not food-first any more (M22).** `SellerSpecialty` had
five food values and one `crafts` bucket for the entire non-food half;
`SellerApplicationCategory` said "the platform is food-first" in its own
schema comment and sent a candle maker to `other`. Now: one question on
`/sell` — *what do you make* — over a set that covers both halves evenly,
and `category` + `Vendor.type` are **derived** from it
(`server/src/seller-applications/specialty-taxonomy.ts`). The `/sell`
form no longer sends `category`; the DTO still accepts it, because
narrowing a request value breaks native clients.

- **Existing `crafts` rows stay `crafts`** (relabelled "Other handmade").
  Nothing records whether one pours candles or throws pots, and a guess
  mislabels a real storefront.
- **`Vendor.type` is rendered on no screen.** Don't add a question to
  collect it. If a surface ever needs to tell a baker from a potter,
  read `specialties` — that's the field with resolution.
- **A specialty may decide what a form *asks*, never what a HomeKrafter
  can *reach*.** `makesFood()` gates the FSSAI question, because asking a
  candle maker for a food licence reads as a requirement they can't meet.
  That is the only legitimate branch — and since M32 it gates storage
  too: a licence typed by a non-food applicant is not recorded.
- **A HomeKrafter edits their own tags, and it is not a second
  registration (M33).** `PATCH /seller/specialties` is the only route that
  changes `Seller.specialties` after approval — one account takes on
  gifting, or drops sweets, from **/seller/profile → "What you make"**.
  It is a **full replacement**, because a bag that only grows is a filter
  that stops meaning anything. It grants nothing (access has never read
  this field) and re-queues nothing (a tag is not a listing; every listing
  still enters the M22 queue on its own). Don't answer "let them sell
  gifts too" with a second application — that mints a **second `Vendor`**
  and splits one kitchen's reviews, followers and payouts in two. A
  withdrawn tag (`laundry`/`cleaning`) may be **kept but never newly
  added**; refusing the whole payload for carrying one would lock legacy
  partners out of the screen. `Vendor.type` is re-derived in the same
  transaction, or the column disagrees with its own input.
- **`businessName` is the storefront name, and it is validated (M32).**
  It becomes `Vendor.name` and `Seller.displayName`, so it is on every
  product card and every order; as a bare `MinLength(1)` string it let
  two production storefronts be named after somebody's email address.
  Rules live in `server/src/seller-applications/application-fields.ts`
  (authority) mirrored **looser** in `client/lib/sell/application-fields.ts`
  — same direction as the two identifier parsers, and for the same
  reason. They check *shape*, never taste: "Abc" is a poor name and a
  valid one. The `/sell` form asks no city — it is derived from the area,
  which is the field that decides anything — and its optional
  Instagram/website/FSSAI/capacity answers are carried onto
  `VendorProfile` at approval, the licence **unverified**.

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
      product/ laundry/ snacks/ wallet/ account/ vendor/   (M2+)
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
- **Gold (`--hk-gold` `#B98724`) is for fills, borders and rules — never
  for text.** Its contrast is 3.2:1 on white and 2.9:1 on the canvas.
  This rule used to carve out "pure decoration (eyebrows, 'view all')";
  the 2026-08-08 contrast audit deleted that carve-out, because an
  eyebrow labels a section and "View all" is a link — both are words
  somebody reads, and axe fails them. Small gold text takes
  **`--hk-gold-text-sm`**, which exists for exactly this. Terracotta
  (`--hk-terracotta`) is for prices/remove in the marketplace.
- **Every new surface owes a contrast pass, and two things measure it.**
  `e2e/tests/a11y.spec.ts` runs axe's `color-contrast` plus the structural
  WCAG rules over `e2e/tests/public-routes.ts` — **eight routes**, a fast
  CI gate, not "every public route" (the claim this file carried until
  M26, and why 114 contrast failures accumulated on the other eighty).
  That list is shared with `presentation.spec.ts` since M27; the two used
  to disagree. Add a route there when you add one, and run `node e2e/sweep.mjs` (all 87
  routes × 4 roles × 2 viewports, screenshots included) before calling a
  visual change done. `--only=/some/route` while iterating.
- **Real photos where supplied, placeholder otherwise — always via
  `<ImageSlot>`.** Brand photography lives under
  `client/public/images/{products,categories,snacks,vendors,site}`;
  HomeKrafter- and buyer-uploaded photos live at `/uploads/...` (M14, see
  below). Both are just a `src` — `<ImageSlot src={...}>` falls back to the
  labelled diagonal-hatch placeholder when it's absent. **Never generate or
  AI-fabricate product/food imagery** (Firefly/Canva/Higgsfield image-gen
  stay unused) — only real assets, real uploads, or the placeholder.
  **Licensed stock photography counts as a real asset with two
  conditions (M56):** every committed stock file is recorded in
  `docs/IMAGE-LICENSES.md` (source URL, photographer, licence — Pexels
  only so far, and never a platform-labelled AI image), and it is a
  stand-in for the *demo* catalogue, replaced listing-by-listing as real
  makers upload their own work. New batches go through
  `client/scripts/process-stock-images.mjs` (1000×1000 JPEG q80, EXIF
  stripped — the M25 rule applied to our own assets).
- **CSS Modules only**, consuming token vars (`var(--hk-...)`), not
  scattered hex. No inline `style={{...}}` styling (that was the
  prototype's technique, not ours) except for genuinely dynamic values
  (e.g. `<ImageSlot>`'s `aspect-ratio`).
- Mobile-first, fluid. No fixed 430/1180 "stage" (that was the
  prototype's reviewer chrome). Container maxes out at 1180px via the
  `.container` utility class (`styles/globals.css`), grace­fully down to
  360px. Header collapses to a hamburger + `<MobileDrawer>` below ~1190px.
  **1190 is not a fit width, and there isn't one** — corrected 2026-08-11.
  M21 recorded the row as needing "1170px plus 20px of container padding";
  the padding is `--hk-s8`, **44px a side**, so the row has **1092px**, not
  1160px. It was over capacity from that day, and `.searchPill`'s
  unlimited shrink meant the shortfall came silently out of the **search
  box, which rendered a 0px-wide input for every role from 1190 to 1920**
  — it looked like a search box and could not be typed in. Raising the
  breakpoint fixes nothing: `.container` caps the row at 1180px at *any*
  screen width, so capacity above 1190 is a constant.

  **M34 paid for the field by cutting the nav, and deleted the expansion
  that had been hiding the problem.** M21's fix kept all six labels and
  made the form go `position: absolute` over the nav on focus; it worked,
  and it still shipped a 38px circle claiming to be a search box (the
  2026-08-13 design audit measured it rendering as "Sear…" on
  production). `primaryNav` now carries **three catalogue items**
  (Homemade Food · Handcrafted Gifts · **Occasions** — M35 traded this
  slot: it was Gift Hampers, but /hamper listed one product and a top-3
  slot has to carry a catalogue; hampers return when ~6+ are live); Gift
  Hampers, Meal plans and Corporate & bulk live in **`secondaryNav`**,
  which renders as the home page's quick-entry strip under the hero
  (`QuickEntryRow`) and as the drawer's second group — joined there by
  Snacks on WhatsApp, which had never been in the nav at all. That is a
  promotion: a tile in the first screenful saying who a thing is for
  beats a 90px link that only names it. The freed ~287px goes to the
  slot (~325–370px by role, 210px floor), so the field is typable at
  rest.

  Three rules. **The drawer keeps both groups** — dropping the secondary
  one there would leave the footer as the only route to `/corporate` on a
  phone. **A new nav item must be a catalogue you browse**; a flow, a hub
  or an enquiry goes in `secondaryNav`. And **re-measure against 1092px,
  not 1180px**: a fourth item costs ~100px of a ~170px surplus, a fifth
  puts the row back under the typable floor. Pinned by
  `e2e/tests/header-capacity.spec.ts`, which now asserts the field works
  with **no interaction** and does not resize on focus.
- **Five breakpoint rails, by convention (M29): 420 · 560 · 640 · 780 ·
  900.** Roughly: 420 small phone, 560 phone, 640 large phone (and where
  fixed CTA bars engage), 780 shell/sidebar collapse, 900 two-pane goes
  single-column. New code uses these. They live here and nowhere else,
  because a CSS custom property is not valid inside an `@media` condition
  and the things that fix that (`postcss-custom-media`, a preprocessor)
  are new dependencies. **1190 is not a rail** — it is the *measured*
  header collapse width, above. There are 27 distinct `max-width` values
  in the tree; that tail is untidy rather than wrong (each was picked
  where a component actually broke), so it is folded to the nearest rail
  **only when a file is already being touched for a real defect**. A
  standalone 193-file normalisation diff is unreviewable and buys nobody
  anything.
- **A text control is never under 16px on a phone, and one global rule
  enforces it.** iOS Safari zooms the page when a focused
  `input`/`select`/`textarea` is smaller than that, and it does not zoom
  back out. All 36 text controls in the tree were 12.5–14.5px until M29,
  so every form on an iPhone — login, checkout address, wallet top-up,
  the whole seller portal — shifted the layout under the visitor's thumb.
  The rule is in `styles/globals.css` and is `!important` because module
  *class* selectors beat any element selector that file can write; it
  raises values and never lowers them (verified: nothing sets a control
  above 16px). Two things not to do: don't "fix" this instead with
  `maximum-scale=1` on the viewport meta (that kills pinch-zoom for
  everybody), and don't add a module rule that re-shrinks a control on
  mobile. `e2e/sweep.mjs`'s **`inputzoom`** flag and a
  `presentation.spec.ts` case are the guards.

## Channel rules (see `lib/channel.ts` — read before building any module screen)

| Module | Browse web | Checkout web | Pre-order web | Live tracking |
|---|---|---|---|---|
| Marketplace | yes | full web checkout | yes | status only (no map/rider) |
| Snacks | yes (menu) | **no** — WhatsApp only (`wa.me`), no cart/checkout on site | yes | WhatsApp status text |
| Full meals | **no** — promo only, no menu/cart | app-only | yes (interest only) | app-only |
| ~~Laundry~~ | **withdrawn (M19; browse gone M37)** — `enabled: false`, `/laundry` 404s, the create routes return 410, and the four public browse reads are deleted. Owner reads + subscription change/cancel stay; booking payloads carry their own `serviceName`/slot labels so no screen needs the withdrawn catalogue | | | |

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
- **Dated menus (M37): `MealPlanDayMenu` is the promise, `weeklyMenu` the
  rotation.** A date's menu — and the buyer's skip of it — locks at
  `PlatformSettings.menuLockTime` IST **the evening before**
  (`meals/menu-lock.ts`, pure, takes `now`; lock state is computed on
  read, never stored, no scheduler). Past the lock only the audited admin
  override (`PUT /admin/catalog/meal-plans/:id/menus/:date`) may change
  it, and it still notifies — the lock stops *silent* changes, not being
  told. A *change* to a set date messages the subscribers scheduled for
  it (`meals` category); a first-time set messages nobody. A 7-line
  `weeklyMenu` reads Monday→Sunday as the per-date fallback; any other
  count opts out — never invent weekday anchoring the data doesn't have.
  A pause leaves locked rows `scheduled` (the kitchen already planned
  them; they arrive). A blackout added after subscribe now cascades:
  affected deliveries go `unavailable` with the reason, the meal moves to
  the end of the cycle (owed, not lost), and the subscriber is told.
- **Absence is not closure**, carried over from M16: no stated
  `workingDays` means open every day, and no `prepTimeMins` means the
  90-minute default, never zero.

## Courier despatch (M57) — a rider, and what a webhook may not do

`Consignment` (one kitchen's lines of one order, to one address) +
`ConsignmentEvent`. Shadowfax's **marketplace seller-pickup** model: a
rider collects from the HomeKrafter's own kitchen. Booked when the
kitchen marks an order **packed** — that is when a parcel exists.

- **`SHADOWFAX_ENABLED` is off by default and the module is dormant
  without it.** Booking a rider costs money, and every kitchen that hands
  its own parcels over must keep working untouched.
- **A carrier callback may move a parcel forward and nothing else.**
  Shadowfax does **not** sign callback bodies — there is no HMAC, unlike
  Razorpay, only an `Authorization` value we chose and gave them
  (constant-time compared; an unset secret refuses everything rather than
  accepting everything). So it is the weakest input the server takes, and
  it may drive only `shipped` and `delivered`. Cancelled, returned and
  lost are recorded on the consignment and left for an admin, because
  each of those moves money and the loss lands on a home cook (M15).
- **Two channels, one path.** The push callback and the `bulk_track` poll
  both feed `ShippingService.ingest`; whichever sees an event first
  records it and the other loses the unique insert. Push only fires once
  its URL is registered in **Shadowfax's client portal**, which no code
  here can do — so `SHADOWFAX_POLL_SECONDS` is the whole auto-update
  until somebody does that, and the safety net afterwards.
- **The weakest parcel decides the order.** `shipped` when every parcel
  has left, `delivered` when every parcel has arrived — never the first.
  `delivered` stamps `deliveredAt`, which starts the return window and is
  every kitchen's payout basis (M15/M37).
- **Booking never blocks the order.** A carrier that is down, a missing
  pickup address or an unserviceable pincode records a `failed`
  consignment with the reason and the kitchen's "packed" still succeeds.
  The despatch queue (`/admin/shipping`) is where a person fixes it.
- **Never trust the callback body's `order_id`** — resolve on
  `awb_number` against our own row (the Razorpay lesson). And never
  `String()` a callback field: an object becomes `"[object Object]"`, a
  real-looking string an operator then reads as the carrier's own words.
- **A terminal parcel is frozen.** A carrier event stamped *after* a
  delivery is legitimately "newest" and rewrote the row to
  `status=delivered, courierStatus=ofd` until `ingest` started refusing
  it. Measured, not hypothetical.
- **Carrier timestamps are IST and zoneless on the callback, ISO-`Z` on
  the tracking API.** `new Date("…T16:20:00")` parses in the *server's*
  zone — this dev box is Asia/Kolkata, the VPS is Etc/UTC, a 5h30m skew
  on every `deliveredAt`. `parseCarrierTimestamp` pins +05:30 and honours
  an explicit zone.
- **Serviceability is advisory, never a booking gate.** Measured on
  staging: `customer_delivery` calls `999999` serviceable, and
  `seller_pickup` omits Chandigarh `160022` — reading absence as refusal
  (the documented contract) refuses every real booking we have. The
  carrier's own **booking** call is the authority, and it refuses with
  **HTTP 200** + `{"message":"Failure","errors":"…"}`, so the presence of
  an AWB is the check, not `res.ok`.
- **The pickup address never lands on `Consignment` and never leaves in a
  response.** It is read from `VendorProfile.pickup*` at booking time and
  put in the carrier request only — a home cook's home address (M36b).

## Location & availability (M12) — read before touching catalog or portal

- **Location is never a gate.** No coords → the API returns the *full*
  catalogue, and the UI says so. The browser prompt has a manual tricity
  area picker behind it and a first-class "skip". Most people decline a
  location prompt; a visitor who declines must still be able to shop.
- **Two copies of the area table** (`client/lib/geo.ts`,
  `server/src/common/geo.ts`) because client/ and server/ are separate
  packages. They MUST stay identical — a kitchen's coords come from the
  server's table at approval, a buyer's from the client's; drift silently
  mis-sorts distance. **Do not delete these in favour of pincodes (M36):**
  the 21 curated coordinates are hand-checked and beat the pincode table
  by 1–5 km inside the launch city, where almost every live kitchen is.

## Supply is national, delivery is not (M36) — read before touching location

`SellerApplication.area` was a closed list of 21 tricity areas plus the
literal `'other'`, and **`'other'` could not be approved**. A home cook in
Faridabad was accepted by the public form, filed as a waitlist entry, and
no screen in the product could move them off it — the endpoint to do it
(`PATCH /admin/sellers/applications/:id/area`, M19) existed and nothing in
the browser ever called it. The form now asks one question, a **pincode**,
and every valid Indian pincode is approvable.

- **A pincode is an identity, not a coordinate.** `server/src/common/
  pincodes.json` (19,238 rows, GeoNames) is authoritative for **district
  and state**. Its **centroid is trustworthy for only 44% of pincodes** —
  the median pincode's post offices are 12.4 km apart, 134109 lands ~11 km
  from Panchkula Sector 8, and 160055 spans Mohali *and* Rupnagar. Never
  write it straight onto `Vendor.lat`/`lng`: that column decides which
  buyers can see a kitchen at all, so a 12 km error hides a real storefront
  from its own neighbourhood. Approval seeds it and flags
  `placement` when it is approximate; an admin corrects it via
  `PATCH /admin/sellers/:id/coords`, **and since 2026-08-18 the kitchen
  can pin itself** — `PATCH /seller/profile/coords` takes a GPS fix from
  the person standing in the kitchen (a "Use my current location" button
  on `/seller/profile`). That reverses M36's "no seller-facing coords
  write" on the owner's decision; what it protected stays closed by
  three guardrails: the pin must land inside the kitchen's own pincode
  (centroid + `spreadKm` + 10 km; pre-M36 rows: 25 km of the curated
  area, anchored to the *stated* place so moves can't accumulate), it
  clears `addressVerified` (the M36c rule — admin re-verifies), and it
  is audited (`vendor.set_coords_self`). `Vendor.pinConfirmedAt` records
  that a person (kitchen or admin) vouched for the pin; NULL means
  "still the approval seed", and the profile completion meter names that
  as a gap. Buyers are untouched either way — `mapVendor` rounds every
  public payload to ~1.1 km whoever set the pin. `spreadKm` is the
  honesty field — ask it rather than assuming.
- **`servicedPincodePrefixes` gates buyers, never supply.** It selects
  **copy, not visibility** (the "location is never a gate" rule above still
  holds — an empty page can't be told apart from a broken site, by the
  visitor or by us). It must never gate an application, an approval, or a
  HomeKrafter's portal; the moment it does, the waitlist is back under a
  new name. It **fails open**: an empty or missing value means no gate.
- **The pincode table is server-only.** 1.8 MB, never shipped to the
  browser — that is also what stops it becoming a third mirrored copy of
  the `geo.ts` hazard. `client/lib/pincode.ts` checks **shape only** and is
  deliberately **looser** than the server, same direction and same reason
  as the two identifier parsers (M17).
- **GeoNames is CC-BY 4.0.** The footer credit linking to geonames.org is
  a **licence condition**, not a courtesy. Remove the table and remove the
  credit together; keep the table and the credit is not optional.
- **A HomeKrafter edits their own profile, tags and address (M36c).**
  Three separate write paths, and they must stay separate: `PATCH
  /seller/profile` (story, hours, policies, **and the pickup address**),
  `PATCH /seller/specialties` (the M33 tag replacement), and nothing at
  all for verification — that is still admin-only. **Changing any pickup
  line clears `addressVerified`**, exactly as changing `fssaiNumber`
  clears `fssaiVerified`: a badge that survives an edit to the thing it
  verifies is a badge the seller set themselves. It clears *only* that
  flag, not the shared `verifiedAt`/`verificationNote`, which belong to
  the identity and licence checks too. Pinned by
  `server/test/unit/seller-profile-address.spec.ts`.
- **The pickup address is private, and that promise is enforced (M36b).**
  `/sell` asks for the address a rider collects from — a home cook's
  **home address** — and says on the form that buyers never see it.
  `VendorProfile.pickup*` is readable on exactly **two** surfaces: the
  admin verification panel (which owns `addressVerified`, so it has to
  show the address it is verifying) and the HomeKrafter's own
  `/seller/profile`. The buyer gets `Vendor.location`, a coarse area
  label, and nothing more. `server/test/unit/vendor-privacy.spec.ts`
  fails the build if `src/catalog`'s public region reads those columns —
  it scans `vendor-profile.service.ts` **by region**, because that file
  holds both `publicProfile` and the seller-only `ownProfile`. Never
  merge the address into `Vendor.location`, and never add it to
  `PublicVendorProfile`. This is the same exposure M25's EXIF strip
  exists to prevent, except typed in directly rather than hidden in a
  photo.
- **An address is also a pair of coordinates, so `mapVendor` rounds them
  (M36).** Withholding the address columns is only half the promise: the
  public vendor payload carries `lat`/`lng`, and at four decimals that is
  the front door to ~11 m. It was harmless while every vendor sat on one
  of 21 curated *area* centroids; M36 seeds the column from a pincode and
  adds `PATCH /admin/sellers/:id/coords`, whose approval banner tells the
  operator to "set the exact spot" — so the leak arrives the first time an
  admin does what the product asks. `mapVendor` now rounds to
  `PUBLIC_COORD_DP` (2dp, ~1.1 km — the granularity of "Sector 35,
  Chandigarh") **by default**, and the exact pin needs an explicit
  `{ preciseLocation: true }`. Two callers pass it: the admin approve
  response (which has to correct the pin) and `/seller/storefront` (a
  HomeKrafter reading their own record). **The default is the safe one on
  purpose** — a new call site added by somebody who never read this gets
  the rounded value. The column keeps full precision; distance filtering
  runs server-side against it, and nothing on the client computes a
  distance from the response.
- **Nothing is backfilled.** Pre-M36 rows keep their `area` and approve
  exactly as before; their `pincode` is NULL, which correctly reads as
  "they signed up before we asked". Guessing a pincode from a curated area
  would write a wrong one onto a real storefront and look authoritative.
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

## Catalogue review gate (M22) — a listing is checked before it is public

`ProductModerationStatus` is `pending | active | rejected | hidden |
flagged`, and **`pending` is the default** on `Product`, `MealPlan` and
`Snack`. Pre-M22 rows stay `active`: an approval gate applied retroactively
would delist a live catalogue and take every kitchen's income with it.

- **An admin can list a product, and it does not go in the queue (M44).**
  `POST /admin/catalog/products` defaults to the platform's own
  **Homekrafted** vendor (`vd8`, resolved by slug) and takes a
  HomeKrafter's `vendorId` to list *on their behalf* — their storefront,
  their reviews, their payout. That second case is the point: Swiggy does
  not make restaurants type their menus, and a home cook who cannot face
  the form is the normal case here. Two rules ride on
  `ListingWriteOptions` in `SellerListingsService`, which stays the one
  owner of every product write: an admin-created listing goes straight to
  `active` with that admin in `moderatedById` (queueing it would queue a
  listing for its own author), and an **admin edit never re-queues** (an
  operator fixing a typo must not take a live listing off sale). Neither
  applies to `actor: 'seller'`, which is the default and must stay it.
- **Filter on `PUBLICLY_LISTED` (`server/src/catalog/moderation.ts`), never
  on `{ not: 'hidden' }`.** Every public query was a denylist before M22,
  which was equivalent only while `hidden` was the one bad state. A
  denylist now *publishes unreviewed listings* — and looks like it works
  while doing it. Same rule client-side: `=== "active"`, not `!== "hidden"`.
- **Three different questions, three helpers.** `isPubliclyListed` (browse),
  `isDirectlyResolvable` (a direct link — `hidden`/`flagged` still resolve
  because carts and orders already reference them; `pending`/`rejected`
  404, or knowing a slug is a preview), `isPurchasable` (strictest —
  an existing order renders, nothing new may be bought).
- **A refusal requires a reason.** `reject`/`hide`/`takedown`/`flag` 400
  without one, it is stored on `moderationNote`, and it reaches the
  HomeKrafter **verbatim** on every channel their `account` preferences
  allow. Never paraphrase it in the notification layer — that sentence is
  the only thing telling them what to change. Category is `account`, not
  `promo` (see M18: a promo block is per-sender and costs every future
  order update).
- **An edit re-queues only on a material change** — name, description,
  category, photo (and `weeklyMenu` on a plan). Not price, stock or tags.
  Re-queueing everything makes editing something a kitchen avoids;
  re-queueing nothing makes approval a one-time formality you list
  something innocuous to pass. A `rejected` listing re-queues on **any**
  edit — that is the route back. A `pending` one keeps its `submittedAt`,
  so saving repeatedly is not a way to jump the queue.
- **`feature`/`unfeature` are merchandising, not moderation** — they must
  not touch `moderationNote`/`moderatedAt`, or the reason a listing was
  flagged is erased by putting it on the home page.
- **Seeds must set `moderationStatus: 'active'` explicitly.** They relied
  on the old default; without it the whole demo catalogue seeds invisible
  and every browse page, screenshot and fixture comes up empty with nothing
  obviously broken.

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
- **Anything that can fail:** read `docs/ERROR-HANDLING.md` — it is the
  project standard and it exists because a misconfigured nginx vhost
  locked real users out of their accounts while every dashboard stayed
  green. Four rules in short: the app is served from **one origin**
  (`www` 301s to the apex, guarded by `scripts/healthcheck.sh`); a
  rejected `fetch` is **classified, not guessed** at
  (`lib/api/unreachable.ts` asks whether our own origin still answers, so
  "you are offline" and "we are broken" stop being the same message);
  error copy **names the right party** — never tell somebody to check a
  connection that is working; and a browser-side failure is **beaconed to
  `/client-errors`**, a Next route on the page's own origin, because a
  report posted to the API would be blocked by the very fault it reports.
  Every 5xx also carries an 8-hex `reference`, in the body, the
  `X-Request-Id` header and the log line.
- **A `lib/api` mutation must never swallow its own refusal (M36).**
  Sixteen wrappers ended `catch { return undefined }`, which turns a
  rejected promise into a resolved one and makes every `catch` built on
  top of it unreachable. `approveSellerApplication` was one: the server
  refuses an approval on purpose in three cases, each carrying the
  sentence saying what to do next, and the admin screen's error banner,
  `aria-live` region and correct `catch` **never fired once** — Approve
  looked like a dead button for months. Two of the sixteen were
  `issueRefund` and `adjustWallet`. Reads may answer `undefined` for "no
  such thing"; a **write** that reports nothing has discarded the only
  explanation anybody was going to get. A wrapper that must absorb one
  specific outcome narrows the catch and rethrows the rest — see
  `adjustWallet`, which keeps its documented "insufficient balance is not
  an exception" contract by testing for a 402. Pinned by
  `client/lib/silent-failure.spec.ts`, which now covers `lib/api` itself.
- **New loading state or buyer-facing status label:** take the words from
  `lib/kitchen-copy.ts` (M28), don't write "Loading…". Three rules live
  there and each is a trap: **never pick a line randomly** (server and
  browser then disagree — React #418, the M12 lesson; `kitchenLoading()`
  hashes a stable surface key instead), **every order-stage label must be
  true of a candle as well as a curry** (one pipeline carries food and
  craft since M20, so "on the stove now" is wrong for half the
  catalogue), and **the admin panel stays plain** — an operator is there
  because something needs deciding, and whimsy over a queue holding
  somebody's income reads as not taking the job seriously. Both the
  determinism and the craft-safety are pinned in `kitchen-copy.spec.ts`.
- **New screen/route:** follow the route tree in the plan
  (`app/{shop,hamper,laundry,snacks,wallet,account/...}`). Reuse
  `ImageSlot` for every image, check `lib/channel.ts` before adding
  cart/checkout UI, use `formatCurrency`/`formatDate` from `lib/format`
  rather than ad hoc formatting.
- **A listing page's filters, sort and page number belong in the URL**
  (`lib/browse-params.ts`, used by `/shop` and `/gifts`). State that is
  only in React is lost the moment somebody opens a listing and presses
  Back, and a narrowed view that cannot be sent to anybody is half a
  browse page. Write it with **`router.replace`, debounced** — `push`
  makes every checkbox a history entry, and
  `window.history.replaceState` does not survive Back (the App Router
  restores its own `renderedSearch` and the query is gone before
  `popstate` fires). Parse defensively: it is a URL, so it comes from
  anybody.
- **Browse machinery is shared (M56): `components/browse/`** —
  `FilterGroup` (checkboxes with counts; a zero-count facet is dimmed,
  never hidden), `ActiveFilterBar` (removable chips + Clear all at ≥2),
  `SortSelect`, `BrowsePagination` (prev/next + windowed ellipsis),
  `MobileFilterSheet` (bottom sheet below 900px — real dialog: shared
  focus trap, Esc, scroll lock, live "Show N results"), and the
  `useBrowseFilters` hook holding the URL machinery. Both listing pages
  compose these; a new listing page should too, not re-derive them. The
  facet predicates are pure in `lib/browse-facets.ts` (`isOnSale` is
  presence of the server-computed discount, never arithmetic — M46).
  Filtering stays a client-side `useMemo` over the pageSize-100 fetch
  (M49: instant, no spinners); revisit only when the catalogue outgrows
  one page.
- **`shippingScope` is the fresh-vs-shippable split, and it is a
  filter now (M56).** The owner's framing: some food *is* a craft in
  shipping terms — a jar of pickle or a tin of cookies posts anywhere
  (`national`), a thali or warm brownies are eaten fresh nearby
  (`local`). The "Delivery" facet on both listing pages reads it
  (labels in `lib/browse-facets.ts#SHIPPING_LABELS`); absent means
  `local` (pre-M20 rows). Demo food rows were backfilled by
  `seed-catalogue.ts`; a real kitchen's own choice is never touched.
- **The three nav tabs carry dropdown panels (M56)**, built server-side
  in `components/layout/Header.tsx` from the live category/occasion
  tables (never a second hand-kept list) and revealed by CSS
  `:hover`/`:focus-within` in `HeaderClient` — absolutely positioned, so
  the 1092px row-capacity arithmetic is untouched; `visibility: hidden`
  keeps closed panels out of the tab order; hover reveal is wrapped in
  `(hover: hover)` so a touch tap just follows the tab's own link.
- **New milestone:** read the plan's milestone table + this file, build
  exactly to the brief's scope (resist finishing later milestones early),
  self-check the Definition-of-Done, update `CHANGELOG.md` and any
  affected `docs/*.md`, then report back with what changed and any
  decisions that need Opus's confirmation.

## Loading feedback (M49) — and why the slow notice is CSS

`RouteSkeleton` carries a line that appears after **four seconds**:
"Still going — this one is taking longer than usual."

- **It is a delayed CSS animation, never a `setTimeout`.** The first
  version was a client component with a timer, and throttled to 8 kb/s —
  the case it exists for — it never appeared, because its own JS chunk
  was queued behind everything else on the same slow connection. A
  slow-connection notice that needs JavaScript to arrive cannot fire when
  the connection is what is slow.
- **`aria-hidden`**: the skeleton already has one polite live region
  announcing the wait, and a second announcement of the same fact is
  noise.
- **Never blame the visitor's connection.** We cannot tell from here
  whether it is their network, our box or a slow query — same rule as
  `docs/ERROR-HANDLING.md`'s "name the right party".
- **It reserves its space either way**, so nothing shifts when it lands.
- **Don't add spinners to `/shop`'s filters.** They are a client-side
  `useMemo` over an already-loaded list — instant, so feedback there
  would be theatre.

## Sub-admins (M47) — sections, not permissions

`User.adminScopes: AdminScope[]` — `catalog · sellers · orders · support ·
finance · users · settings · analytics`, enforced by `AdminScopeGuard`
(global, after `RolesGuard`) and declared with `@RequireAdminScope(...)`
on every admin controller.

- **A scope is a section of the panel**, because a section is what an
  operator is actually handed. Per-endpoint permissions read as more
  rigorous and end with everybody holding every checkbox. If a route
  belongs to two sections it belongs to neither and needs its own.
- **Empty means nothing, not everything.** The M47 migration backfilled
  every existing admin with the full set so that could be the safe
  direction — "empty is everything" hands the panel to any sub-admin whose
  scopes somebody forgot to tick. The cost is that **anything minting a
  full admin outside the sub-admin screen must say so**, reading
  `ALL_ADMIN_SCOPES` (`src/common/admin-scopes.ts`, derived from the
  Prisma enum). The seed and the e2e harness did not, and a bare
  `role: 'admin'` promotion produces an account that signs in, renders an
  empty panel and 403s everywhere — which reads as a broken deploy.
  Pinned by `test/unit/admin-scopes.spec.ts`.
- **Read from the database, never the token.** Revocation has to bite
  immediately; a JWT claim would leave a pulled `finance` scope working
  for the rest of an access token's life.
- **Fail-closed on `/api/v1/admin`, same as `@Roles`** — a route with no
  scope is refused, and `rbac-structure.spec.ts` fails the build on one.
  The guard *also* fires on a handler-level `@Roles('admin')`, which is
  what covers the three privileged routes hanging off consumer
  controllers (two of them move money).
- **Hiding a nav item is a courtesy, not the gate.** A drift between
  `AdminShell`'s map and the server costs a visible link that 403s with a
  sentence, never access.
- **Granting has four guardrails** (`AdminUsersService.setAdminAccess`):
  no self-change, the last `users` holder cannot lose it, an admin with no
  sections is refused, and removing access clears the scopes. Each is a
  400 with the sentence saying what to do instead.
- **`users` is the scope that grants scopes** — hand it out last, and the
  admin screen says so.

## A HomeKrafter's own sale (M46) — whose money it is

`Vendor.discountPct` + `Vendor.discountEndsAt`, set through
`PUT /seller/discount` (its own route — `PATCH /seller/storefront` is bio,
location and artwork; this changes the price of every listing at once).

- **The kitchen funds it.** The percentage comes off what a buyer pays and
  commission is computed on what was charged, so the HomeKrafter absorbs
  all of it. The seller screen states that in rupees before the input. A
  platform-funded discount is a different feature with a budget attached —
  don't quietly turn this into one.
- **`catalog/vendor-discount.ts` never reads the clock.** Every function
  takes `now` (the M12 React #418 rule), nothing expires a row, and there
  is no scheduler: a lapsed sale stops the instant the date passes.
- **`discountEndsAt` is exclusive**, the seller field says "last day", and
  the client converts both ways. Don't "simplify" that by relabelling the
  field.
- **50% ceiling, refused not clamped.** It reaches every listing at once
  and it is somebody's income.
- **Three prices, two shown.** `salePrice` (paid) struck against `price`;
  `mrp` is dropped while a storefront sale runs. Two crossed-out numbers
  beside one real one reads as a trick.
- **No client computes a discounted price.** `resolveCartLine` for the
  cart, `mapProduct` for the card — one sum, server-side, so a card and a
  checkout cannot disagree.
- **`Product.cashbackPct` is not money.** It was quoted on the product page
  as wallet cashback while checkout credited a flat platform rate on the
  subtotal, so a 20% listing advertised four times what was paid. The
  page reads the platform rate now and the input is gone from the form;
  the column stays so existing values round-trip. Don't re-add the field
  without wiring it to the actual credit.

## Listing a product (M45) — two forms, one set of values

`/seller/listings/new` opens the **guided flow**
(`components/seller/GuidedListingForm.tsx`): four questions, one screen
each, photo first. `ListingForm` — the twenty-field long form — is one
link away from every step, and an **edit** opens it by default.

- **Both write the same `ListingFormValues`.** Switching either way loses
  nothing, and that is what makes the guided flow safe: it hides
  questions, never capability. Don't fork the state shape.
- **Photo first is a finding, not a preference.** Swiggy and Zomato do
  not make partners type menus — the restaurant sends photographs and
  somebody transcribes them (M44's admin listing screen is our backstop
  for that). The transferable part is the ordering: a photo is the one
  thing somebody in their kitchen can produce immediately.
- **The photo step must not block.** Refusing to continue without one
  strands somebody whose camera is in the other room, and the honest cost
  is a listing never written.
- **Nothing the guided flow skips may reach the server as a zero.**
  `mrp` = price unless "on offer" is ticked (0 renders a strikethrough
  against nothing; inflating it invents a discount), stock defaults from
  a plain-words question, the size label falls back to `"One"`.
- **Submit is handed the finished values**, not read from the parent's
  state — the last step fills those defaults in and React has not
  committed the `onChange` when submit runs.

## Known token gaps — centralized in `styles/tokens.extend.css` (M1)

The prototype uses a few recurring colors for text/dividers sitting on
solid or tinted brand backgrounds that aren't in `tokens.css` today.
Flagged locally-hardcoded-with-comments during M0; as of M1 they're
centralized as real CSS custom properties in `client/styles/tokens.extend.css`
(imported once, right after `globals.css`, in `app/layout.tsx`) so every
`components/ui/*.module.css` file can reference `var(--hk-...)` instead of
repeating the raw hex. `tokens.css` itself stays untouched and remains law —
`tokens.extend.css` is **almost** purely additive and NOT part of the
`handoff/` design system. It overrides `tokens.css` in exactly **two**
places, both at the end of the list and both documented in the file: the
corrected `--hk-muted`/`--hk-muted-2` (contrast), and `--hk-dur`
(M28 — motion slowed from `.28s` to `.36s`; `--hk-ease` was left alone,
it is already a decelerating curve). Everything else adds.

- `--hk-on-pine: #eadfc9` — copy on solid `--hk-pine` (announcement bar,
  tag chips, badges on dark cards, PromoBand's dark variant,
  WalletBalanceCard).
- `--hk-gold-text-sm: #886815` — **all** gold-family text, not only small
  text: `--hk-gold` fails AA everywhere it carries words (wallet chip,
  cashback lines, `ghost-gold` label, and since the 2026-08-08 audit the
  section eyebrows, "view all" links, shop filter headings and every
  product card's maker line). Darkened from the prototype's `#8a6a16`,
  which measured 4.49:1 on the gold tint — one hundredth short.
- A light-on-`--hk-pine-deep` ramp, used on the footer and any other solid
  dark-pine surface: `--hk-footer-ink: #c7d3c5` (body), `--hk-footer-ink-2:
  #a9bcae` (link list), `--hk-footer-muted: #9fb3a5` (brand blurb),
  `--hk-footer-mono: #869c90` (mono legal row — darker `#7e9488` was
  4.18:1, and that row is the legal notice), `--hk-footer-border:
  #2c473a` (divider above the legal row).
- `--hk-scrollbar: #d9cdb4` — the `.hk-scroll` scrollbar-thumb tint
  (decorative, low stakes; see `styles/globals.css`).
- `--hk-terracotta-text: #a04d2e` — terracotta *on the terracotta tint*
  (#f6e7e0), where `--hk-terracotta` is 3.77:1: the "Cancelled" and
  "Returned" pills in both order queues. On white it is 4.55:1, so a
  price stays on the base token.
- `--hk-whatsapp-text: #10803a` — WhatsApp green *as text*, and as a fill
  under white text. `--hk-whatsapp` (#1FA855) and `--hk-whatsapp-deep`
  (#128C3E) are brand fills and both fail as copy (3.1–4.0:1). Same shape
  as `--hk-gold-text-sm`: the brand colour is left alone.
- **`--hk-muted: #766c5d` and `--hk-muted-2: #6f6a5e` are the one
  override.** `tokens.css` documents `--hk-muted` as "meta, captions" —
  body text — and ships it at `#8A8070`, which is 3.50:1 on the canvas
  and 3.88:1 on a card. It is used 306 times across 135 files: every
  product card's maker line, every filter heading, the shop's breadcrumb
  and subtitle. Correcting the value beats re-pointing 306 call sites at
  a new name, which would leave the failing token in place for the 307th.
  Same hue, minimum darkening that clears AA on the hardest background.
  `tokens.css` is still untouched and still law; reverting is deleting
  two lines from `tokens.extend.css`.

A few narrower one-off gaps (each used in exactly one component) stayed as
local hardcoded-plus-comment values rather than joining `tokens.extend.css`,
since centralizing a single-use color doesn't pay for itself: ProductCard's
`.added` border (`#b7d0bd`), SnackCard's `.added` border (`#b7e0c4`),
TransactionRow's debit icon tint (`#f6e7e0`), StoreBadges' on-dark border
(`#56493a`). See each component's `.module.css` for the inline rationale.

## Reels, gifting and the taxonomy queue (M50)

**Reels are real footage now (M52), served from `public/videos/reels/`.**
Four owner-supplied clips replaced the one Instagram embed (it was the
same creator's clip); `Reel.instagramUrl` + `lib/instagram.ts` stay as the
route for a reel we cannot host, with the M50 rules still holding —
**never mirror an Instagram poster frame** (signed, expiring URLs, and a
separate permission from embedding), **never print a zero count** beside
a real clip (`viewCount: 0` means "not published to us"), and **credit
the creator** (`Reel.authorLabel`, so somebody else's clip about us is
not rendered under our name). For a hosted reel:

- **Two renditions and a still, all real.** `videoSrc` (H.264, ≤720px,
  `+faststart`) is the viewer's; `previewSrc` (an 8-second silent 360px
  cut, ~300 KB) is the rail card's; `posterSrc` under `public/images/reels/`
  is a frame of the clip. Encode recipe in `docs/DEPLOY.md` § Reel
  footage. **A source that is already H.264 is remuxed, never
  re-encoded** — CRF on a 0.9 Mbps phone clip *inflated* it (7.7 → 12.9 MB).
- **Strip every byte of metadata** (`-map_metadata -1`). A phone clip
  carries the GPS of the kitchen it was shot in — the M25 photo rule, one
  directory over.
- **The card is the poster; the video is a courtesy on top of it.** The
  still is `next/image` sized for a 208px card; the `<video>` is
  `preload="none"`, has no poster of its own, and fetches nothing until
  `play()`. It never plays under `prefers-reduced-motion` or Save-Data
  (`lib/network.ts`), and it stays in the DOM either way: deciding after
  mount whether to render it is a hydration mismatch.

  **It autoplays in view on every device** (owner, 2026-08-29) — a
  0.75-in-view observer, with hover and focus as a second immediate
  trigger where a pointer exists and **no matching leave handler**: the
  observer owns stopping a preview, and pausing on pointer-leave blanks
  the rail the moment the mouse moves. This reverses M52's "two triggers,
  never both", and what that rule was protecting survives it.
  `previewBudget()` in `ReelCard.tsx` is the ceiling — four (what a wide
  rail actually shows) on a pointer device 900px and up, **one** on a
  phone, where decoders are dearer and the connection likelier metered.
  Two rules ride on it: **a card outside the budget is never handed a
  `src`** (setting one starts the fetch, and pausing afterwards saves
  nothing — the real M50 defect was unbudgeted fetching, not the
  observer), and the budget evicts **by live distance from the viewport
  centre**, never by arrival order, because the whole rail crosses the
  threshold in the same frame.
- `/videos/` gets a week of `Cache-Control` from `next.config.ts` and
  answers Range requests through Next. The filenames are not
  content-hashed, so a re-shot clip keeps its name and is stale for at
  most a week — don't make it `immutable`.
- **The five M2-era seed reels are gone.** They were poster-only with
  invented counts, and beside a real clip that prints no count the
  invented "1.2k · 18.4k views" became the louder number. The viewer's
  "Clip coming soon" branch stays for a reel filed ahead of its footage.
- **The rail is the second screenful, framed as proof** ("From real
  orders · See what arrives"), not the seventh section: the audit
  measured it 2.2–3.7 screens down, past every decision it could have
  supported, and no incumbent food or gifting site carries landing-page
  video at all. Don't push it back under the catalogue sections.

**The "Make it a gift" block is three real controls now, and gift wrap had
no control anywhere.** `CartItem.giftWrap`/`OrderItem.giftWrap` are real
columns, both order screens have always printed "· gift wrapped", and
**nothing ever set them** — the product page advertised wrap "at checkout"
and checkout never asked. The block writes `lib/gift/gift-intent.ts`
(sessionStorage, per-tab, cleared once checkout consumes it) and checkout
pre-arms from it. `OrdersService` now separates **`shipsToRecipient`**
(where the parcel goes) from **`isGift`** (that gifting was asked for at
all): collapsing them meant a message card could only ride on a parcel
posted to somebody else, which is not the commonest gift. The maker sees
the message on their order detail — before this it was stored and
displayed nowhere, so nobody could write the card.

**A HomeKrafter can ask for a shelf or an occasion that isn't there.**
`TaxonomySuggestion` (`kind: category|occasion`), asked at
`POST /seller/taxonomy-suggestions`, decided at `/admin/catalog/suggestions`.
The design is the point and it is easy to "simplify" away:

- **The ask is not the write.** Approving is what mints the
  `Category`/`Occasion`, and that code lives in `src/admin/` so
  `occasion-admin-only.spec.ts`'s directory scan still covers it. Letting
  a seller create one outright ends the shared vocabulary — "Pickles",
  "Pickle" and "Achaar" as three half-empty shelves nothing can merge.
- **An admin renames on the way in.** That is what a human step buys: the
  person who can see the whole list turns "achaar" into "Pickles &
  Preserves" instead of refusing somebody who used their own words.
- **A duplicate is a 409 naming the existing row**, checked again at
  approval against the *final* name — never a silent de-duplication (the
  M43 rule).
- **A decline needs a reason and it is sent verbatim** (M22), category
  `account`, not `promo`.
- **`<Combobox>` closes its list on a refusal.** The listbox is absolutely
  positioned over everything under the input and the message renders below
  the field, so a refusal used to draw the explanation *behind* the open
  list — pressing the row looked like it did nothing. Found in the
  browser, not in review.

**A listing's category picker is a `<Combobox>`, not a `<select>`** —
because a `<select>` has no way to say "none of these is what I make".
`lib/taxonomy-actions.ts` is the one place deciding who may create and who
may only ask; it is exempt from `silent-failure.spec.ts` by a registry
entry, because its whole job is to hand the refusal up to the combobox
that displays it.

**The admin catalogue row previews the buyer-facing card.** A 48px
thumbnail is enough to *find* a listing and not to *judge* one, and the
question being answered is "would this look right in the grid". It
renders `<ProductCard>` itself — a mock-up would drift and start approving
listings against a rendering buyers never see — inside an `inert`
wrapper, since the card draws a wishlist heart and an add button that
nothing here should honour.

## Browsing food is browsing cooks (M51)

**`/shop` opens on kitchens, `/gifts` stays a product grid, and that
asymmetry is the point.** Ordering cooked food is a decision about *who
made it* — five identical jars from five kitchens are five hygiene
standards and five delivery radii. Buying a candle is not that decision.
Don't "unify" the two browse models; that trade throws away the only
thing making the food half honest.

- **`lib/kitchens.ts` derives, it does not fetch.** `buildKitchens`
  groups the listings the page already loaded, so a kitchen appears
  exactly when it has something live that reaches this buyer — the
  delivery-radius filtering is already done by `GET /products?lat&lng`,
  and a `GET /kitchens` would duplicate it in a second place. Pure and
  clock-free: it runs in the Server Component (the header count) and
  again in the browser (the grid), and those two must agree or hydration
  throws.
- **The dish grid is a `?view=dishes` toggle, not a deletion.** "Who has
  ragi cookies" is a real question. The view rides in `BrowseParams` with
  the filters and the sort, so switching keeps everything; `kitchens` is
  the default and is omitted from the URL.
- **A card previews the *filtered* dishes.** Tick "Pickles" and the four
  thumbnails are that kitchen's pickles — a preview reading the whole
  catalogue sends people into storefronts that don't sell what they
  ticked.
- **Never claim what the data doesn't say.** "Pure veg" only when *every*
  listing is vegetarian; `reviewCount: 0` renders "New kitchen", never
  0.0 out of five; a missing `distanceKm` prints nothing and sorts
  **last** under `nearest` — absent means "we weren't told where you
  are", the M12 rule again.
- **`MakerPortrait`, never `avatarSrc`** (M38b) — this is a grid, and the
  pre-M28 rows would render several kitchens under one stock face.
- No stretched link on the card: the dish thumbnails are links, and an
  overlay would swallow every one of them.

## The landing page is a split screen (M51, rebuilt M53)

`components/home/SplitPanels.tsx` — homemade food and handcrafted gifts,
half a screen each, the brand lockup centred over the seam, and the half
you lean toward opening to ~74%.

- **Hover is read on the container, with a dead middle third.** The
  pointer's x has to be inside the outer 34% of the width before a half
  opens (`LEAN` in `SplitPanels.tsx`); anywhere in the middle both halves
  stay level and the lockup between them stays up. The per-panel
  `onPointerEnter` version opened a half the instant the pointer crossed
  the centre line on its way anywhere — including to the header — and
  the lockup flickered out with it.
- **The two halves are inset from the viewport edge and separated by a
  diagonal gutter** (`--gutter`, half-width each side of the seam). They
  are two cards on the canvas, not one photograph with a line drawn on
  it, and the hero's top inset is what the floating header sits in — the
  bar is over `--hk-bg`, which is why no control in it needs on-dark ink.
- **Each photograph is bounded to its own slice**, `inset: 0 calc(100% -
  var(--seam) - var(--skew)) 0 0` and its mirror. The panels are
  full-width elements that clip themselves, so a photo at `inset: 0` is
  laid out across the whole screen and the panel shows a vertical strip
  of it — a picture of a whole table rendered as one blurred pot at 3×
  zoom. `.photo` also has to override `ImageSlot`'s inline
  `aspect-ratio` and its `width: 100%` (`aspect-ratio: auto !important;
  width: auto; height: auto`), or the four insets cannot size the box.
- **Portrait source photographs only.** A panel is a tall, narrow window;
  a landscape frame is cropped to whatever happens to be in the middle of
  it.
- **The seam is a diagonal, and it is one number.** Both panels sit in
  the same grid cell and clip themselves with `clip-path` against
  `--seam` (a percentage, registered with `@property` so it animates) and
  `--skew`. M51/M52 grew the panels with `flex-grow`, which re-lays-out
  each panel's own contents every frame — the copy inside crept as the
  split moved. Clipping changes what you see of a frame that never
  resizes, so the photographs cannot stretch and the type cannot creep.
  A straight vertical rule down the middle of two photographs is the
  template version of this layout; the diagonal is the screen's identity.
- **The copy column is computed from `--seam`, never guessed.** `.body`
  is `width: calc(var(--seam) - var(--skew))` (the mirror for the gifts
  half), so a panel's text is always inside its own slice and widens with
  it. Hardcoding a `max-width` is what put "Handcrafted gifts" through
  the diagonal at 26%.
- **A shut half keeps its title, its disc and its edge rail, and drops
  its blurb and label.** It is still an offer, not a photograph. The
  title drops to `clamp(19px, 2.1vw, 28px)` because a quarter-screen
  column cannot hold 46px type without becoming a ribbon.
- **The panel is an `<a>`, so it states its own colour on hover.** The
  global link-hover recolour turned the opening half's title and CTA to
  brand gold over a photograph — 3.2:1, and the M34 rule says gold never
  carries words.
- **Pointer and focus expand; a touch screen stays level (M52).** M51
  had an `IntersectionObserver` open whichever stacked half was showing
  more of itself. Measured at 390×844 it opened the food half at load —
  the gifts panel started at y=790, so the page's question was half
  asked — and the hand-off on scroll was the page's **entire CLS**
  (0.067; scrolling is not "recent input"). Don't bring the observer
  back to make the phone "match".
- **The whole expansion is inside `(hover: hover) and
  (prefers-reduced-motion: no-preference)`.** The global floor strips the
  transition, which would leave a panel *jumping* 50%→74%; under reduced
  motion both halves simply stay level.
- Dark photograph, so the split sets `--hk-focus-ring:
  var(--hk-gold-bright)` once and lets it inherit (the M34 rule).
- The **promise strip sits below the split** so both halves are in the
  first screenful. The comp's headline, eyebrow, heart, script line and
  plane are untouched — the two gold CTA cards became the panels.
- **The lockup is the `<h1>`, and the landing page's header is a
  different object (owner, 2026-08-27, M52).** `<hgroup id="hk-hero-brand">
  <h1><img alt="Homekrafted"></h1><p>slogan</p></hgroup>` — the alt is the
  heading's name (Google reads alt inside an h1 as the h1; axe passes it);
  the slogan is a `<p>`, never an h2. On `/` `HeaderClient` renders **no
  search and no wallet** — the profile icons and centred tabs, floating
  over the hero in a `position: fixed`, transparent bar — and turns solid
  once an `IntersectionObserver` sees `#hk-hero-brand` leave the top
  64px. **The tabs are visible from the first paint** (owner,
  2026-08-29); what the observer changes is the wash behind them, not
  whether the site has a menu. **The logo is in the row from first paint
  too, but invisible until that same flip (M56, owner 2026-08-31)** —
  `data-revealed` fades it in as the bar turns solid, so the wordmark
  reads as the hero's mark moving into the bar. It occupies its flex slot
  always (nothing reflows), `visibility: hidden` keeps it out of the tab
  order while unseen, and the handoff is deliberately **scroll-only**:
  hovering a split panel fades the hero lockup too, but that is a
  momentary hover state — don't couple SplitPanels to the fixed bar
  through a root attribute to cover it. No FLIP morph — rejected as
  machinery for no legible gain. Pinned in `presentation.spec.ts`
  ("landing logo hands over"). Every other route keeps the ordinary
  static row, which is why `e2e/tests/header-capacity.spec.ts` measures
  **`/shop`**, not `/`.
  **Revealed, it is `--hk-surface`, not a wash** (2026-08-29). At
  `rgba(255,255,255,.86)` a 36px display heading scrolling under the bar
  stayed legible straight across the nav, which reads as a rendering
  fault rather than a translucent surface; 0.96 only made the ghost
  fainter. Translucency buys the landing header nothing once it has
  turned solid — the point of the reveal is that the bar stops being part
  of the hero.

  `html { scroll-padding-top: 72px }` keeps a focused control from
  landing under the bar (WCAG 2.4.11). z-index 50, under the prompt (60)
  and the drawer (90).
- **The lockup is centred over the seam, high in the frame, and inert
  (M53).** It sits in `.brand`, `position: absolute; inset: 0` over the
  split with `pointer-events: none` — hovering "through" it opens the half
  underneath, which is what somebody moving diagonally toward a panel
  expects; without that the middle of the screen is a dead zone between
  the two things the page is asking about.

  **The glow is on the `<hgroup>`, not on the stage** (owner,
  2026-08-29). The panels' own scrim is deep at the bottom and light in
  the middle, which is exactly where the wordmark is, so the lockup and
  the slogan need a light plate under them — the mark keeps its own green
  and gold and is never recoloured to survive a photograph. It was a
  520px plate spanning the whole stage and read as fog over both halves;
  `.brandGroup::before` sizes itself to the heading box instead, so it
  tracks what it is lighting at every breakpoint with no second number to
  keep in step. Bright core, masked falloff, `backdrop-filter` — and the
  parent must not take `isolation: isolate`, `filter` or a static
  `opacity`, each of which makes a backdrop root and leaves the blur
  nothing to work on. It is disabled under 900px, where the block is on
  the canvas. The mark and the slogan carry a short white `drop-shadow`
  halo of their own on top of it: the plate is a broad, soft light and a
  wordmark's counters are small, so the halo is what puts the separation
  right at the letterforms. Light behind the mark is not a change to the
  mark — the green and the gold are still its own.

  **The comp's eyebrow and heart are gone** (owner, 2026-08-29) — a mono
  line naming the three cities, set over the seam so it had to be read
  against either photograph. The cities are in the food half's own copy
  and in the footer.
- **It steps aside on `:has()`, not on a second piece of state.**
  `.stage:has([data-active="food"]) .brand` (and the gifts mirror) fades
  and scales it out, reading the split's own attribute — so "a half is
  open" has exactly one source of truth. Same two guards as the
  expansion. The entrance stagger (`hkRise`, `backwards` fill) sits
  inside `no-preference` for the opposite reason: the floor shortens
  durations but not delays, and a held `from { opacity: 0 }` on a page
  that never animates is an invisible hero.
- **Stacked under 900px the diagonal goes, the rail goes, the width
  arithmetic goes, and the brand block moves above the panels with
  `order: -1`** (the panels are its DOM sibling and come first, which is
  the right source order for a screen reader). The split is
  `min-height: 640px` there — two cards with room to be read rather than
  two 300px letterboxes — so the phone hero deliberately runs past one
  screen.

## The rest of the landing page (M53)

The page under the hero is an argument in order, not a catalogue index:
ticker → quick entries → who is cooking → what arrives (reels) → most
loved → categories → occasions → how this works → promo bands → sell
with us → app. Three things in it are new and easy to get wrong:

- **`Ticker` and `HeroCollage`-style marquees are CSS and server
  components.** A duplicated run, `aria-hidden` on the copy, one
  `translate3d` keyframe, and the whole thing inside
  `prefers-reduced-motion: no-preference`. No timer, no client bundle.
- **Every phrase in the ticker is a rule the product enforces**, and
  every number on the page is derived from the catalogue the page
  already fetched. There is still no "200+ home chefs" strip.
- **"Ordered again and again" filters on `reviewCount > 0`.** An
  unreviewed listing carries `rating: 0`, so sorting the raw catalogue by
  rating ranks new listings last and a tie of zeros first. A rail called
  "most loved" has to be listings somebody loved.
- **`HowItWorks` copy is written from the rules** — the fail-open
  delivery filter, cooked-after-you-order plus pre-order, and the two
  buyer windows (cancel until packed, seven days from delivery). If a
  rule changes, that copy is wrong and changes with it.
- **"How this works" is the one section on its own ground**
  (`.explainerBand`, 2026-08-29). Everything above it is a rail of things
  to look at on the page's canvas, and eight of those in a row read as
  one long list however clear the headings are; this is the section that
  stops and explains, so the page stops with it — `--hk-surface`,
  hairlines top and bottom, a full-bleed ground with the `container` still
  on the `<section>` inside, so the copy keeps every other section's
  measure. Don't give a second section a band: two stops is no rhythm.
- **`SellCta` may not promise "zero commission"** (`commissionEnabled` is
  a business switch that is off) or an approval time (a person works the
  M22 queue).

## Vendor avatars — one component, a picker, and a guard (M38b)

**Nothing reads `Vendor.avatarSrc` directly. Render
`components/vendor/MakerPortrait`.** Ten seeded storefronts once pointed
at one file, `/images/vendors/avatar.jpg`, so two different kitchens
rendered under the same stock photograph of the same woman — on a
platform whose whole pitch is that a real person made this. M28 stopped
the seeds writing it; **the rows written before that day still hold it**
and nothing has cleared the column. `lib/maker-portrait.ts#ownAvatarSrc`
filters those rows back to "no picture".

**A HomeKrafter chooses their own character now, and the assigned
caricature is gone (owner, 2026-08-29).** M38b drew one of ten line-art
faces from a hash of the slug, so a kitchen that had never opened the
portal still had a portrait — one nobody chose. `/seller/storefront`
offers **sixteen characters** under the photo upload
(`lib/avatars/chef-characters.ts`, `components/seller/CharacterPicker`),
and against a real choice an assigned face is the wrong trade twice
over: it is an invention on a page claiming a real person made this, and
it hid the gap from the only people who can close it. A kitchen with
neither a photo nor a character shows the **labelled hatch
placeholder** — which looks like a missing asset because it is one.

**The seeded DEMO storefronts carry assigned characters (M56, owner
2026-08-31), and that does not reopen the rule above.** A demo fixture is
not a person; each demo kitchen gets a *distinct* character (never one
file shared — the M28 failure), set in `client/lib/data/vendors.ts`,
`seed.ts`/`seed-crafts.ts`, and on production by
**`server/prisma/seed-avatars.ts`** — additive, slug-allowlisted, updates
only rows whose `avatarSrc` is NULL or still the pre-M28 stock path (so
it also finally clears those rows), and never overwrites a photo or a
picker choice. The allowlist must never grow an entry for an onboarded
seller. vd8 (the platform, not a person) and vd9 (withdrawn laundry)
stay faceless on purpose.

- **A photo still wins, and the screen says so.** The upload is above the
  picker, the picker says "or", and choosing a character never hides the
  upload. This is the second-best answer to "who cooked this", not a
  substitute.
- **The characters are Open Peeps by Pablo Stanley, CC0 1.0** — public
  domain, no attribution owed. `scripts/build-chef-avatars.mjs` composes
  them through DiceBear (code MIT) with **every parameter named**, and
  the output is **committed**: nothing fetches dicebear.com at build time
  or at request time, and `images.remotePatterns` stays empty. Re-run the
  script only to change the cast, and keep its `CAST` in step with
  `CHEF_CHARACTERS`.
- **A character is stored in `avatarSrc` like an upload**, as a `.webp`
  path. That is why it needs no column and no mapper change — and it has
  to stay raster, because `next/image` refuses SVG without
  `dangerouslyAllowSVG` and the storefront's OpenGraph card and
  `LocalBusiness` JSON-LD both point at that same string.
- **The cast is ordered so the head coverings and the grey hair are not
  at the bottom.** A grid whose first row is six young women with long
  hair has already told most of the people looking at it that it is not
  for them. Labels describe the **drawing** and name no community on
  somebody's behalf — "Turban and beard", not a religion.
- **Two kitchens may pick the same character.** That is the M28 shape
  again *only* in appearance: a face somebody chose is not a face
  somebody was given. Don't "fix" it by assigning one back.
- **`client/lib/vendor-avatar.spec.ts` fails the build** on any read of
  `avatarSrc` outside its allowlist, and separately asserts the
  storefront route launders *both* its images. Four files are
  allowlisted, each with its reason in the spec — a fifth entry is a
  claim you should have to write down.
- **Clearing the column on those pre-M28 rows is the real fix**, and
  `ownAvatarSrc` can go the day it happens. Until then it is the
  difference between the grid being wrong and the grid being right.

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
- **Nothing is stored as it arrived (M25).** Every accepted upload is
  re-encoded by `server/src/uploads/image-pipeline.ts` — metadata
  stripped, orientation baked in, longest edge capped at 2000px, output
  **always WebP q82**. Storage stays local disk on the VPS
  (`/var/lib/homekrafted/uploads`, nginx serves it; `STORAGE_DRIVER=local`).
  Three rules if you touch it:
  - **The metadata strip is a privacy control, not an optimisation.** A
    phone photo of a home kitchen carries EXIF GPS; publishing it
    published a home cook's address. Never add `.withMetadata()` to "fix"
    orientation — `.rotate()` already bakes it in, which is why the strip
    is safe.
  - **`.rotate()` must stay ahead of the strip.** Drop the orientation tag
    without applying it and every portrait phone photo is stored sideways.
  - **WebP, not AVIF, is a CPU decision.** AVIF encodes in seconds on a
    1 vCPU box and this runs inline on the request. Revisit only if the
    box grows; nothing stored has to move, because the extension is
    derived rather than echoed.

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
- **A cancellation *does* refund — and must reverse the cashback with
  it.** Cashback lands at `placed`; refunding the total while leaving it
  meant place-then-cancel paid the buyer, repeatably (M22). Any new path
  that gives money back owes the same question: what else did placement
  hand over? `lifetimeSaved` unwinds too, or the loop buys loyalty tier
  for free.
- **An order is refunded through the order's own endpoint, never by
  crediting the wallet (M26).** `POST /admin/orders/:type/:id/refund`
  flips `Order.refundStatus`, takes an `Idempotency-Key`, refuses an
  unpaid order and is audited. `POST /admin/wallet/:userId/refund` does
  none of that — the admin order screen used it for months, so the same
  order could be refunded again the next day and three clicks credited
  three times (measured: ₹2,749 → ₹7,246 on a ₹1,499 order). The wallet
  endpoint is for an adjustment that is genuinely not an order refund.
  **Any new money button owes an idempotency key minted once per
  operation, not per click** — a per-click key does nothing for the retry
  that a timeout provokes.
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

- **A HomeKrafter can now *ask* for one (M50), and that is not the same
  thing.** The picker used to say "ask an admin to add it" with no way to;
  `POST /seller/taxonomy-suggestions` files a `TaxonomySuggestion` and an
  admin approving it on `/admin/catalog/suggestions` mints the row. Two
  rules: **the ask must never become the write** — the approve code lives
  in `src/admin/` for exactly the scan below, and
  `occasion-admin-only.spec.ts` now pins the seller controller as
  create-free — and **a refusal carries a reason, verbatim** (the M22
  rule), because a decline with no sentence is how people stop asking.
  Same machinery covers categories, which had the identical dead end.
- **Only an admin creates an occasion (M43), and the route is the gate.**
  `POST /admin/collections/occasions` is the single writer; there is
  deliberately no `/seller/*` equivalent, and
  `server/test/unit/occasion-admin-only.spec.ts` fails the build if one
  appears. A HomeKrafter *tags* a listing with an occasion — they do not
  mint one. This is not permissions hygiene: occasions are a shared
  vocabulary the whole catalogue browses by, and one anybody can add to
  stops being one ("Diwali", "diwali " and "Deepavali" as three hub pages
  splitting a festival's traffic, unmergeable). The **create row on
  `<Combobox>` is a prop, not a permission** — withholding it hides a row
  in a menu and nothing more. A duplicate name is a **409 naming the
  existing occasion**, never a silent de-duplication: handing back the
  existing row makes the admin believe the date and tagline they typed
  were saved onto it.
- **`components/ui/Combobox` is the searchable picker** (M43) — WAI-ARIA
  editable combobox, list autocomplete, single or multi, no dependency.
  Reach for it instead of a `<select>` or a chip wall wherever the list
  grows over time. Focus stays on the input and the active row rides on
  `aria-activedescendant`; don't reimplement that with a focusable list,
  which is the version that breaks Enter and Space.
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
- **A focus ring on a dark surface reads `--hk-focus-ring` (M34).** The
  global floor was a flat `--hk-pine`, which is **1.23:1 on
  `--hk-pine-deep`** — so on the footer, which is on every consumer page,
  a keyboard user lost the ring entirely for the last fifteen links of
  every page on the site, and the same held on both portal topbars, the
  dark PromoBand, the wallet card and the reel viewer. Every container
  painted pine-deep or the pine gradient now sets `--hk-focus-ring:
  var(--hk-gold-bright)` in its own rule, next to the background that
  causes it; the variable inherits, so one line covers everything inside.
  Two rules: **write the ring as `var(--hk-focus-ring, var(--hk-pine))`**,
  never the bare token, so a component that later lands on a dark surface
  stays visible — all 42 that hardcoded it were converted — and **a dark
  button on a light page needs none of this**, because `outline-offset`
  puts its ring on the page behind it.
- **`prefers-reduced-motion` is honoured globally (M34), so a component
  writes its own rule only to do something other than stop.** Six modules
  had opted in individually and about seventy had not, including the
  drawer slide and every hover transform. The CSS floor is in
  `globals.css`; the JS half is **`lib/motion.ts`**, and it is not
  optional — `element.scrollTo({ behavior: "smooth" })` is a script
  instruction and ignores the media query completely, so any scripted
  scroll takes `scrollBehavior()` rather than a literal.
- **A dialog owes three things**, not one: move focus in on open, trap
  Tab at both ends, restore focus to whatever opened it. `aria-modal`
  without them is a claim the page doesn't honour. **Use
  `lib/focus-trap.ts`** (`FOCUSABLE` + `trapTab`) — never write the
  selector or the wrap arithmetic again. `MobileDrawer` and
  `LocationPrompt` honoured all three from M16 but each held a private
  copy of the recipe, and `ReelViewer` — a full-screen player claiming
  `aria-modal` — honoured only the scroll lock from the day it shipped
  until M29. It survived review because the markup is right and a mouse
  never notices; only pressing Tab finds it. `lib/focus-trap.spec.ts`
  now fails the build on a private copy or on an `aria-modal` component
  that doesn't import the shared module, and
  `e2e/tests/focus-traps.spec.ts` presses the keys for all three.
- **Anything hidden off-screen must leave the tab order.** A
  `transform: translateX(100%)` panel is still focusable; use
  `visibility: hidden` (delay the transition so the animation survives).
  `aria-hidden` over focusable elements is itself a violation.
- **Icon-only buttons need `aria-label`.** `<Button variant="icon">`
  exists precisely so this is not forgotten.
- **A card that navigates is a link, not a `role="button"` div.** React's
  `onClick` on a div does *not* fire for Enter or Space, so a
  `role="button" tabIndex={0}` card is focusable and un-openable — which
  is exactly what every product grid shipped until M22. Use the stretched
  link (`ProductCard`'s `.nameLink::after` covering the card, buttons
  lifted above it with `z-index: 1`); it also buys open-in-new-tab, which
  a div never had. If a div genuinely must be the button, it owes an
  `onKeyDown` for both keys — `client/lib/keyboard-activation.spec.ts`
  fails the build otherwise.
- **`ImageSlot` needs a real `alt`** — see its section above.

## Auth & identity (M17) — three ways this broke at once

All three shipped, were reviewed, and were manually tested. None of them
had a test, and none was visible from reading the happy path.

- **An approved HomeKrafter's password is issued *to* them, and dies on
  first use (M32 — this reverses the rule below; show-once since M37).**
  Approval mints the account (`authProviders: ['phone']`) **and** a
  temporary password, returned once in the approve/issue response and
  stored only as a hash, because no provider key is set and the invite
  link reaches nobody. The old rule — "an admin never sets a credential,
  and must never be able to" — was protecting a principle by leaving
  every real kitchen with an account and no door. What preserves its
  substance: `mustChangePassword` is enforced in `JwtAuthGuard` (403
  `PASSWORD_CHANGE_REQUIRED` on every route but the change screen), the
  plaintext is never stored (a lost one is re-issued, not re-read), and
  the act is audited. **Restore the original rule once SendGrid/Twilio
  exist.**

  **Onboarding state is three-valued, and `mustChangePassword` alone
  cannot express it.** That flag is `false` both for a kitchen that
  arrived and chose a password *and* for one that was never given a
  credential, so the two-state version reported all thirteen existing
  production HomeKrafters as "onboarded" with zero sign-ins between them.
  `mapSignInState` reads `passwordHash` too: `awaiting` (issued, unused) ·
  `onboarded` (has a password of their own) · `no_credentials` (none at
  all — pre-M32, and the list with the most work attached). Any new
  surface answering "has this kitchen actually got online" owes the same
  three-way split.
  Everything below still holds: A one-time code therefore remains a first-class sign-in and
  **any surface offering to sign a HomeKrafter in must offer it**:
  removing it gives every real kitchen "Incorrect email or password" for a
  password that never existed.

  **M25 collapsed the form to one field and kept that door open, by
  status.** `POST /auth/continue` answers **409** (not 401) when the
  account exists with `passwordHash: null`, and the form turns that into
  the code route automatically. If you ever change that branch to a 401
  "for consistency", you have re-broken supply-side onboarding — the
  end-to-end path is pinned in `test/e2e/auth-continue.e2e-spec.ts`
  ("the approved HomeKrafter case"). "Use a code instead" is also always
  visible on the form, deliberately, not only after a failure.

  **M21 added the second door.** Approval sends a single-use, 7-day
  set-password link by email and SMS (`SellerInviteService`), which is
  why `resetPassword` adds `email` to `authProviders` — the account stops
  being phone-only the moment they use it. The link is minted through the
  same `PasswordResetToken` machinery as a reset, deliberately: it is
  single-use, expiring and session-revoking, and **a plaintext password
  must never be emailed**. That credential would sit readable in an inbox
  forever, could not be rotated, and on this platform is the one that can
  change payout details.
- **A failed request is never an answer, and `/seller/me` is where that
  bit (M39).** `getMySeller`/`getSellerVendor` ended `catch { return
  undefined }`. `/seller/me` is **not** in `PASSWORD_CHANGE_EXEMPT`, so
  an admin-issued temporary password makes it answer **403
  PASSWORD_CHANGE_REQUIRED** — on purpose, pinned by
  `server/test/e2e/temp-password.e2e-spec.ts`. Swallowed, that 403 became
  "this account has no kitchen", `SellerShell` rendered **"Sign in as a
  HomeKrafter"** at somebody who had just typed the right password, and
  its button returned to `/login`, whose "You're all set" card sent them
  straight back. A closed loop with no sign-in form in it, and the same
  swallow did it for a 500 or a dropped connection — which is why it
  looked intermittent. Now: **404 alone returns `undefined`**, everything
  else throws (`lib/api/seller-me-contract.spec.ts`); `AuthContext` keeps
  `failed` apart from `answered` and exposes `sellerLoadFailed` +
  `retrySellerRecord`; `SellerShell` has **four** states, and a failure
  gets a retry, never a rejection. `http.ts` routes the code to
  `/set-password` from wherever it lands — before M39 the client had
  **zero** references to a code the server invents so a client can act on
  it. Don't "fix" a future version of this by exempting `/seller/me`:
  that disables the control instead of handling it.
- **`/set-password` needs a way out for somebody who was never given
  one.** It asks for "the password you were given"; a HomeKrafter who
  signed in with a **one-time code** — the door that exists because the
  invite reaches nobody — has none, and met an unfillable form with no
  link off it. `resetPassword` already sets a password without the old
  one and clears `mustChangePassword` (its own comment says the forced
  gate must let them through), so the screen links to `/forgot-password`.
  A route, not a new endpoint and not a weaker guard.
- **One box decides its own type, and the two parsers are NOT twins.**
  `server/src/auth/identifier.util.ts` (libphonenumber-js, region `IN`) is
  the authority; `client/lib/auth/identifier.ts` only enables the button
  and picks the label. Unlike `lib/geo.ts` and its server copy, these are
  *allowed* to disagree — but only in one direction. The client must stay
  **looser**: a false positive costs one request and a clear 400, while a
  false negative strands somebody at a dead button with a valid number
  typed in and nothing to fix. Never "tighten" the client to match.
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
- **argon2 parameters live in `server/src/auth/hashing.ts`, and nowhere
  else (M31).** Never call `argon2.hash` bare — that is how all seven
  call sites ended up on the library's defaults (`m=65536, t=3, p=4`),
  which nobody chose and which put four lanes on the production box's one
  core. Passwords use the OWASP argon2id reference config
  (`m=19456, t=2, p=1`); one-time codes are cheaper on reasoning written
  out in that file. `argon2.verify` stays parameterless — it reads the
  cost from the stored digest, which is what lets old hashes keep working
  while `AuthService.maybeRehash` upgrades each one in the background on
  its owner's next sign-in. Both sets are pinned by
  `server/test/unit/hashing.spec.ts`.

## Tests (M17) — `docs/TESTS.md`

`cd client && npm test` · `cd server && npm test` · `cd server && npm run
test:e2e` (needs `TEST_DATABASE_URL` — see `docs/TESTS.md`). CI runs all
of it plus typecheck, lint and both builds.

**Structural specs are a layer of their own, and they exist because each
one caught a silent failure.** `vendor-privacy.spec.ts` (no public read of
a pickup address), `rbac-structure.spec.ts` (every portal controller
role-gated), `focus-trap.spec.ts`, `keyboard-activation.spec.ts`,
`silent-failure.spec.ts`, `vendor-avatar.spec.ts`. They scan source text,
so two rules: **strip comments before scanning** — this repo quotes
decorators in prose constantly, and a scan that counts a comment as code
fails *open*, which is how `rbac-structure.spec.ts` reported three
ungated controllers as gated — and **keep the allowlist a registry with a
stated reason per entry**, so a rename fails the build instead of
silently widening it.

**`RolesGuard`'s fail-closed rule only covers `/api/v1/admin`.** Three
admin-privileged routes hang off controllers most of whose routes belong
to the signed-in customer — `POST /orders/:id/refund`,
`POST /wallet/adjust`, `GET /users/:id` — so they carry a *method-level*
`@Roles('admin')` that neither the path rule nor a class-level scan sees.
They are pinned by name in `rbac-structure.spec.ts`'s
`ADMIN_ROUTES_OUTSIDE_ADMIN`. **Adding a privileged route to a mixed
controller means adding it there too**; two of the three move money, and
without the decorator every signed-in shopper can call them.

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
404. Boundaries therefore live only on `/shop`, `/search` and `/snacks`
— never app-wide.

**And a boundary costs ~285ms of the wait it covers, so it must be
earning that (M31).** Once React commits a Suspense fallback it throttles
replacing it, so a boundary whose content resolves in 20ms still holds
the skeleton for about three hundred milliseconds. Measured on the
production build, client-side navigation to a painted `h1`: `/seller`
385–401ms with a `loading.tsx` versus 80–100ms without; `/shop` 361ms
with, against 46–90ms for `/gifts`, `/hamper` and `/collections`, which
never had one. The two **dashboard groups' boundaries were deleted** for
this reason and the seller sign-in got 4× faster.

The line to hold: a `loading.tsx` is worth it only where the page is an
`async` server component that genuinely `await`s data — `/shop`,
`/search` and `/snacks` do, and there the skeleton covers real server
work that a slow response would otherwise turn into a dead click.
**Never add one over a route whose page is a thin wrapper around a client
component** (every `/seller/*` and `/admin/*` page is): the RSC payload
is static, so the boundary covers nothing but its own throttle. If you
add a boundary anywhere, measure the navigation before and after — `node
e2e/login-timing-dom.mjs` for the portal, and see M31 in `CHANGELOG.md`.

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

**An upload goes through the optimiser (2026-08-30); until then it was
served `unoptimized`, and that was not a shortcut (M25).** `next/image`
resolves a local `src` against its *own* server on `127.0.0.1:3000`.
Bundled art under `public/` is served by Next, so the optimiser works.
`/uploads/` is served **only by nginx**, from
`/var/lib/homekrafted/uploads` — the Next process had no such route, so
the optimiser fetched its own 404 page and answered `400 "The requested
resource isn't a valid image"`. Every HomeKrafter-uploaded photo rendered
broken on the live site from M16 until M25 found it by uploading a real
photo to production; M25 answered with `unoptimized`, honest because
`image-pipeline.ts` had already capped and re-encoded the file, at the
open cost that one stored size served every slot. Now the `/uploads/`
rewrite in `next.config.ts` applies in **production too**, pointed at
the public origin: the optimiser's in-process fetch is answered by nginx
from disk, and a 260px card gets a 260px AVIF. Three things to know
before touching it:

- **A `public/uploads` symlink does not fix it** — tried on the box; Next
  does not pick up `public/` changes at runtime.
- **Public requests never hit the rewrite.** nginx matches `/uploads/`
  before it proxies to Next; the rewrite exists for the optimiser's
  loopback fetch and dev alone. Don't "tidy" it back to dev-only — that
  puts the 400 back on every uploaded photo.
- **`images.minimumCacheTTL` is a week, `qualities` is `[50, 75]`.** The
  four-hour default had every returning visitor re-fetching every image
  and the 1-vCPU box re-encoding evicted ones; a week matches `/videos/`
  and is not `immutable` for the same reason. Quality 50 exists for the
  landing hero's two grainy photographs (measured: half the bytes); a
  product photo stays on 75.

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
- **Wishlist is in `<MobileDrawer>`** — otherwise unreachable below 1190px.
- **`LoyaltyTier`** = `bronze|silver|gold|platinum` (naming pending brand input).
- **Laundry `pricingModel`** uses all three union values: Wash & Fold
  `per-kg`, Dry Clean + Steam Ironing `per-item`, Home Cleaning `per-hour`
  (prototype says "per room", which doesn't map to the union).
- **Every vendor is seeded** (one per seed product incl. "Homekrafted"
  itself) so no `Product.vendorId` dangles.

Superseded: the hardcoded laundry day-picker dates (server now generates
rolling days from today — see `lib/schedule.ts`).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
