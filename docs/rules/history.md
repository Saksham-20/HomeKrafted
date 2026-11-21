# History: blockers in full, execution model, M0 decisions

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Standing blockers (true as of 2026-08-15)

**Production carries no seeded data since 2026-09-03.** Every demo
user and kitchen was purged from the live database (only the admin
account and the platform storefront `vd8` remain — `vd8` is the default
vendor for admin-created listings, M44). The demo accounts in
`docs/TESTING.md` exist in a *local* seed only, and `OTP_TEST_PHONES` on
the box is empty. Don't re-run `seed.ts`/`seed-crafts.ts`/
`seed-catalogue.ts` against production: they would put all of it back.

**Social sign-in is verified since M27; the remaining gap is config.**
`POST /auth/social/:provider` requires a real Google/Apple **id-token**,
checked by `server/src/auth/social-token-verifier.ts` (jose + JWKS,
issuer + audience allowlist, nonce, bounded age) — the pre-M27 "trusts a
posted email" takeover is closed and pinned by tests. **Google is live
since 2026-11-21** (`GOOGLE_CLIENT_IDS` set on the box, project
`homekrafted-515407`, consent screen in production — `docs/LAUNCH-READINESS.md`
§0.4); no Apple service ID is configured, so Apple stays off. Don't "fix" a
failing social login by weakening the verifier — check the ID and origins.

**Razorpay is on real test keys since 2026-09-01, and going live is
config only.** Nothing branches on `rzp_test_` vs `rzp_live_`: the one
key-sensitive gate is `PaymentsService.isMockMode`, comparing against the
`.env.example` placeholders. The browser takes the key from the API
response (`rzpOrder.keyId || NEXT_PUBLIC_RAZORPAY_KEY_ID`), so the
server's key wins and a live switch needs **no client rebuild** — set the
two server vars plus `RAZORPAY_WEBHOOK_SECRET`, subscribe
`payment.captured` in the dashboard, restart. See `docs/DEPLOY.md`.

**Featured ranking is live on production (deployed 2026-09-19, `9cfc50c`).**
Migration `20260919120000_product_featured_rank` — one nullable
`Product.featuredRank` and one index, nothing backfilled — was applied by
`deploy.sh` after a fresh backup and a lineage check. The six listings that
were already `featured` (all crochet, rating 0) now lead the default browse
in unranked order until an admin ranks them on `/admin/catalog/featured`;
that is the rule working, not a bug. Twenty listings still carry badges their
makers set before tags became admin-only (10 Bestseller, 8 New, 2 Festive, 1
Curated) — an admin clears or keeps them in the Merchandising section, and
nothing deletes them for you. `docs/DEPLOY.md` has the runbook.

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
- **Email leaves the box (verified 2026-09-17).** Production runs Resend
  with `EMAIL_FROM` at `no-reply@homekrafted.in`, and
  `server/scripts/send-test-email.mjs` got a **200 + message id** from it
  — which Resend does not give an unverified sending domain, so the
  DKIM/SPF task that stood here from 2026-09-04 is done. Prove it that
  way, never by approving a real kitchen to find out. `TWILIO_*` and
  `WHATSAPP_*` are **also set on the box, and that is not the same as
  verified** — a revoked key looks exactly like a working one from here,
  and nothing has sent a real SMS or WhatsApp message through them yet.
  `EmailProviderService` still speaks Resend (default) and SendGrid, and
  **no key is still a logged stub** — a *supported* state the admin
  approve screen reads, so never make it throw; local dev has no key and
  must keep working. Three rules: **every message goes through
  `notifications/email-template.ts`** (one shell, inline styles and
  literal hex because a CSS variable resolves to nothing in an inbox, no
  images because a blocked remote logo on a sign-in email is worse than
  type, and always an HTML **and** a text part); **never email a
  plaintext password** — the invite is a single-use expiring link, and
  that has not changed; and **`EMAIL_FROM`'s domain is the thing Resend
  checks**, so changing it means redoing the DNS records at Hostinger.
- **The invite link half (M21).** Approval now mints a single-use,
  7-day set-password link and sends it by **email and SMS**
  (`SellerInviteService`), so phone OTP is no longer the only door. What
  remains is purely config: with SendGrid and Twilio unset both channels
  degrade to a logged stub, and **the admin screen says so** — "Approved,
  but we could not reach them", with the link shown so it can be handed
  over by hand. `POST /admin/sellers/:id/resend-invite` re-sends and burns
  the previous link. Until the keys are set, **this still caps supply
  growth**; it is now one afternoon of config and nothing else.
- **Commission is a markup the buyer pays, not a deduction from the
  seller (2026-09-16, reverses M37).** A HomeKrafter types the price
  they want to receive; the buyer is charged that plus Homekrafted's fee
  plus GST on the fee. `WeightOption.price`/`mrp` and
  `MealPlan.pricePerMeal` are the maker's **base** — every buyer-facing
  read marks it up on the fly (`server/src/common/pricing/commission.ts`
  — `markUp`/`buyerPrice`/`markUpFactor`/`baseFromBuyerPrice`, all pure,
  no clock, no database), and nothing stores a marked-up price. Reversed
  because the listing form was rewritten to markup wording ("you receive
  ₹100 → customer pays ₹120") on 2026-09-09 and the server did not move
  with it for a week — a maker was promised ₹100, a buyer was charged
  ₹100, and the payout paid ₹76.40 (M37's deduction still running
  underneath). `commissionEnabled` (PlatformSettings, default **false**,
  strict `'true'` parse) still gates whether the fee is charged at all —
  off means the buyer pays exactly the base, safe to flip either
  direction with nobody charged for something they were not shown.
  **Production has had it on (20%, 18% GST) since 2026-09-05**, under the
  old deduction model; `prisma/migrate-to-markup-prices.ts` is the
  one-time, operator-run data pass that has to run at cutover — it
  divides every stored price by the live markup factor so a buyer sees
  the identical number immediately after, only the meaning of the column
  changes. Read its own header before running it.
  - **`mapProduct(product, rate)` vs `mapProductForMaker(product, rate)`**
    (`catalog/mappers/product.mapper.ts`) — two named functions, not one
    with a flag, because the failure mode of confusing them is
    asymmetric: a maker shown a buyer price is confused, a buyer shown a
    base price under-charges and the platform eats the fee. `mapProduct`
    is every buyer surface (`/products`, `/gifts`, `/shop`, a storefront,
    a cart line via `resolveCartLines`). `mapProductForMaker` is the two
    surfaces that legitimately show a maker their own figure — the
    seller's own listing read/write (`SellerListingsService`) and the
    **admin edit form** (`AdminCatalogService.getById`/`create`/`update`,
    feeding the shared `ListingForm`) — never the admin catalogue *list*,
    whose "Preview card" renders `<ProductCard>` labelled "As a buyer
    sees it" and therefore needs `mapProduct` like every other shopper
    surface (`PaginatedCatalog`'s doc comment has the reasoning). `rate`
    is a **required** argument on both — a call site nobody updated is a
    compile error, not a silently wrong price.
  - **An order records its own split, once, at checkout.** `OrderItem`
    gained `sellerAmount`/`commissionAmount`/`gstAmount`/`commissionPct`/
    `gstPct` (nullable) alongside the existing `price` (now the
    buyer-charged figure). A rate change must never move money on an
    order already placed, so a payout **sums `sellerAmount`**
    (`COALESCE(sellerAmount, price)`), never re-derives the split against
    whatever the rate happens to be on the day it's requested — the same
    shape M37 gave `Payout` itself, one layer down.
  - **A marketplace line is paid in full, always — never deducted at
    payout.** The fee is either already collected from the buyer
    (`sellerAmount` populated) or forgiven on transition
    (`sellerAmount IS NULL`, a pre-migration row — "fully payable" is a
    documented one-time rule, not a bug). `commissionEnabled` no longer
    touches a marketplace payout at all. **Laundry (withdrawn) and
    WhatsApp snack orders were never migrated to markup pricing** — still
    typed at the maker's sticker price with no fee embedded — so
    `computePayoutSplit`'s deduction still applies to that combined
    "legacy" total exactly as it did before this model existed
    (`SellerPayoutsService`, `payout-split.ts`).
  - **Mixed-era gross tracking is an estimate, and it is safe in one
    direction only.** No pre-2026-09-16 `Payout` row recorded a
    marketplace/legacy split, so `allocateClaimedGross` (`payout-split.ts`)
    attributes as much of a seller's already-claimed gross to marketplace
    as could possibly be true — capped at the total marketplace gross
    they have ever earned — which guarantees marketplace is never
    double-paid. The estimate can only ever be wrong in the other
    direction (a slight, self-correcting overstatement of the legacy
    share), never toward paying out money twice.
  - The rate rides on `GET /seller/me` (`commission: { pct, enabled,
    gstPct }`) — the listing form and payout screen compute from it,
    **never a hardcoded percentage**, and `client/lib/commission.ts`'s
    `markupBreakdown` mirrors the server's arithmetic exactly (GST
    included) for the live "customer pays ₹X" preview while typing a
    price; absent/unloaded reads as **no fee**, never a guessed rate.
    Flipping `commissionEnabled` is a business decision (audited, on
    `/admin/settings`), not a bug fix — don't turn it on in passing, and
    don't recalculate a payout already requested.
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

## What this is (full text, as of 2026-11-21)

Homekrafted is a home-craft platform: a **Gifting Marketplace**
(multi-vendor, hampers, occasions) and **Snacks + Food Delivery** (Snacks
browsable + WhatsApp order; full meals promo-only), unified by one
**Wallet** and one shared account layer. **Laundry, Cleaning & Ironing**
was a third module and is **withdrawn as of M19** — the route 404s, the
create endpoints return 410, and the models stay so existing bookings
still render. Don't build on it; see the channel table below. It ships as a **monorepo**: `client/` (the Next.js
web app — all web source lives here), `server/` (a standalone backend API
**shared by the web + the native apps**, arriving in M8), `mobile/` (the
native mobile apps — React Native/Expo; scaffolded 2026-09-06, see
`docs/APP.md`) and `rider/` (the delivery-partner app, a second Expo project —
see "Rider fleet"). The web is built
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
- **Gifting rework (plan, 2026-09-15):** `docs/GIFTING-REWORK.md` — the
  `/gifts` redesign, a department + attribute taxonomy, one auto-reveal
  listing form replacing both, and the hooks for AI-assisted listing later.
  §0 holds the owner's answers; several reverse rules in this file. **G0 and
  G1 built 2026-09-16, not yet deployed** — the production migration and
  data pass still need a go-ahead and a backup in the turn they happen;
  read the plan before touching `/gifts`, categories or the listing forms.
- **Notifications (what the platform sends, and when):**
  `docs/NOTIFICATIONS.md` — every trigger, its recipient, its channel and
  the line of code it comes from. Two paths: direct email (credentials
  and documents, preferences do not apply) and `deliver()` (everything
  else, gated per person per category). Add a trigger, add a row.
- **Native apps (`mobile/`):** `docs/APP.md` — the bootstrap, which API URL
  to point a device at, the `client/lib` shared-code contract and the
  aliases that make it resolve, the native-module ledger, and a catalogue
  of the build failures this architecture produces. Read it before
  touching `mobile/`, and note its shared-boundary rules bind `client/`
  too (see Non-negotiable rules).
- **Changelog:** `CHANGELOG.md`, one entry per milestone
