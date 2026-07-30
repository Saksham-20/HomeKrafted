# Homekrafted — CLAUDE.md

Quick context for any future session (human or agent) working in this repo.
Read this first, then the plan and docs it points to.

## What this is

Homekrafted is a multi-service home-craft platform: a **Gifting Marketplace**
(multi-vendor, hampers, occasions), **Laundry, Cleaning & Ironing**
(bookable, two-slot), **Snacks + Food Delivery** (Snacks browsable +
WhatsApp order; full meals promo-only), unified by one **Wallet** and one
shared account layer. It ships as a **monorepo**: `client/` (the Next.js
web app — all web source lives here), `server/` (a standalone backend API
**shared by the web + the native apps**, arriving in M8), and `app/` (the
native mobile apps — React Native/Expo, future). The web is built
frontend-first with typed mock data before the backend lands; `client/lib/api`
now makes **real calls** against `server/` (`NEXT_PUBLIC_USE_MOCK=true`
reverts every module to the old in-memory mocks for offline frontend work).

**Live staging:** http://187.127.171.48 — see `docs/DEPLOY.md` (runbook,
env, one-command redeploy) and `docs/TESTING.md` (tester handout, demo
accounts).

- **Approved plan (scope authority):** `~/.claude/plans/read-the-handoff-i-jolly-hennessy.md`
- **Design system (visual contract):** `handoff/design-system/` + the reference
  prototype `handoff/prototype/Homekrafted.dc.html`
- **Docs:** `docs/` (PRD, API, architecture, data model, design system, ADRs)
- **Changelog:** `CHANGELOG.md`, one entry per milestone

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
location filtering, pre-order — see CHANGELOG).

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
      product/ hamper/ laundry/ snacks/ wallet/ account/   (M2+)
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
  `<ImageSlot>`.** Real brand photography now lives under
  `client/public/images/{products,categories,snacks,vendors,site}` and is
  wired through `<ImageSlot src="/images/...">` (falls back to the labelled
  diagonal-hatch placeholder when `src` is absent). Use the supplied photos
  where they exist; use the placeholder for slots that have none. **Never
  generate or AI-fabricate product/food imagery** (Firefly/Canva/Higgsfield
  image-gen stay unused) — only real supplied assets or the placeholder.
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
| Laundry | yes | web checkout **or COD** | yes | app-only (web shows status line + "track on the app") |
| Snacks | yes (menu) | **no** — WhatsApp only (`wa.me`), no cart/checkout on site | yes | WhatsApp status text |
| Full meals | **no** — promo only, no menu/cart | app-only | yes (interest only) | app-only |

`hasPreOrderOnWeb` is deliberately separate from `hasCheckoutOnWeb`:
scheduling is information, not a transaction. Snacks/meals carry the
chosen slot into the **WhatsApp message**, never an order record on the
site — so pre-order never reopens the cart question.

`CHANNEL_RULES` in `lib/channel.ts` is the enforceable form of this table —
check `hasMenuOnWeb` / `hasCartOnWeb` / `hasCheckoutOnWeb` before rendering
anything in a Snacks or full-meals screen. If a component would need a flag
that isn't there, add it to `ChannelRule`, don't route around the module.

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

## `ImageSlot` — the only way images render until real photography lands

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

Renders the diagonal-hatch placeholder from the prototype. Swap for
`next/image` per-slot once real photography exists — don't render actual
photos, renders, or AI-generated imagery in the meantime.

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

- **`About` nav** points at `/` — no dedicated `/about` route exists yet.
- **Wishlist is in `<MobileDrawer>`** — otherwise unreachable below 840px.
- **`LoyaltyTier`** = `bronze|silver|gold|platinum` (naming pending brand input).
- **Laundry `pricingModel`** uses all three union values: Wash & Fold
  `per-kg`, Dry Clean + Steam Ironing `per-item`, Home Cleaning `per-hour`
  (prototype says "per room", which doesn't map to the union).
- **Every vendor is seeded** (one per seed product incl. "Homekrafted"
  itself) so no `Product.vendorId` dangles.

Superseded: the hardcoded laundry day-picker dates (server now generates
rolling days from today — see `lib/schedule.ts`).
