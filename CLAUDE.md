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
frontend-first with typed mock data before the backend lands; the mock
`client/lib/api` layer swaps to real calls against `server/` at M8.

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

Milestones (see the plan for full detail): **M0 Foundation** (this
milestone) → M1 UI primitives → M2 Marketplace browse → M3 Buy flow → M4
Laundry → M5 Snacks + Food promo → M6 Wallet → M7 Account & shared → M8
Secure backend (Postgres+Prisma, Auth.js, Razorpay) → M9 Integrations
(WhatsApp Cloud API, notifications).

## Stack

- **Next.js** (App Router, React, TypeScript), npm
- Styling: **CSS Modules** over `styles/tokens.css` (no Tailwind, no inline
  styles like the prototype)
- Fonts: `next/font/google` — Fraunces, IBM Plex Sans, IBM Plex Mono
- Icons: `lucide-react` (line icons) + inline SVG for brand marks
  (WhatsApp/App Store/Play) when needed
- `clsx` for conditional className composition
- **Not yet installed** (arrive in M8): Prisma, Auth.js, Razorpay. Don't add
  them early — `lib/api` is a mock layer specifically so the frontend can
  be built without a backend.

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
      api/                    typed async client-stub functions — the only way
                              components should read data (swap to real calls → server/ in M8)
    styles/
      tokens.css              verbatim copy of handoff/design-system/tokens.css — LAW
      tokens.extend.css       app-level vars for the known token gaps (M1) — NOT part of handoff
      globals.css             reset, base body, font-variable bridge, .container utility
  server/                  standalone backend API — shared by client + app (M8; placeholder now)
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
- **Placeholders, not fake art.** Every image/photo slot renders through
  `<ImageSlot>` (labelled diagonal-hatch placeholder). Never generate or
  embed real/fake product photography — that's Firefly/Canva/Higgsfield
  image-gen tools staying explicitly unused per the plan, until real
  photography is supplied.
- **CSS Modules only**, consuming token vars (`var(--hk-...)`), not
  scattered hex. No inline `style={{...}}` styling (that was the
  prototype's technique, not ours) except for genuinely dynamic values
  (e.g. `<ImageSlot>`'s `aspect-ratio`).
- Mobile-first, fluid. No fixed 430/1180 "stage" (that was the
  prototype's reviewer chrome). Container maxes out at 1180px via the
  `.container` utility class (`styles/globals.css`), grace­fully down to
  360px. Header collapses to a hamburger + `<MobileDrawer>` below ~840px.

## Channel rules (see `lib/channel.ts` — read before building any module screen)

| Module | Browse web | Checkout web | Live tracking |
|---|---|---|---|
| Marketplace | yes | full web checkout | status only (no map/rider) |
| Laundry | yes | web checkout **or COD** | app-only (web shows status line + "track on the app") |
| Snacks | yes (menu) | **no** — WhatsApp only (`wa.me`), no cart/checkout on site | WhatsApp status text |
| Full meals | **no** — promo only, no menu/cart | app-only | app-only |

`CHANNEL_RULES` in `lib/channel.ts` is the enforceable form of this table —
check `hasMenuOnWeb` / `hasCartOnWeb` / `hasCheckoutOnWeb` before rendering
anything in a Snacks or full-meals screen. If a component would need a flag
that isn't there, add it to `ChannelRule`, don't route around the module.

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

## Decisions made in M0 that Opus should confirm

- **`About` nav link** points at `/` (home) — the plan's route tree has no
  dedicated `/about`, and the prototype's own "About" nav item just calls
  `goHome()`. Add a real `/about` route later if one's wanted.
- **Wishlist added to `<MobileDrawer>`** beyond the brief's literal "links
  + wallet + account entries" — without it, Wishlist would be completely
  unreachable below the 840px breakpoint (its header icon is hidden there
  too), which reads as a real gap rather than a copy omission.
- **`LoyaltyTier`** modeled as `'bronze' | 'silver' | 'gold' | 'platinum'`
  — the plan specifies `tier` + `points` but not tier names; picked the
  most legible convention pending brand input.
- **Laundry `pricingModel`** exercises all three union values across the 4
  services: Wash & Fold `per-kg`, Dry Clean + Steam Ironing `per-item`,
  Home Cleaning `per-hour` (the prototype's copy says "per room" for
  cleaning, which doesn't map cleanly to the plan's 3-value union — modeled
  it as hourly labor pricing, a common real-world convention for deep
  cleaning).
- **Laundry day-picker mock dates**: kept the prototype's literal dates
  (19–22 Jul 2026) but corrected the day-name labels to match the real
  2026 calendar (the prototype's own "Sat 19 Jul" is wrong — 19 Jul 2026
  is a Sunday).
- **Snack list estimate total**: computed as the real sum of its line
  items (₹360), not the prototype's hardcoded "₹340" (which doesn't match
  its own three listed items).
- **Vendor records**: seeded all 8 (one per seed product, including
  "Homekrafted" itself for the in-house Festive Assorted Hamper) rather
  than "a few" — with only 8 products total, partial vendor coverage would
  leave some `Product.vendorId` pointing nowhere.
