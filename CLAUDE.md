# Homekrafted — CLAUDE.md

Quick context for any future session (human or agent) working in this repo.
Read this first, then the plan and docs it points to.

## What this is

Homekrafted is a home-craft marketplace: **handcrafted gifts** (multi-vendor,
hampers, occasions) and **homemade food** (snacks over WhatsApp; full meals
promo-only), one **Wallet** and one account layer. **Laundry/cleaning is
withdrawn (M19)** — route 404s, create endpoints 410, models stay so old
bookings render; don't build on it. Monorepo: `client/` (Next.js web),
`server/` (NestJS API shared by web and apps), `mobile/` (Expo shopper app,
`docs/APP.md`), `rider/` (Expo delivery-partner app, `docs/rules/rider-fleet.md`).
`client/lib/api` calls the real server; `NEXT_PUBLIC_USE_MOCK=true` reverts
to in-memory mocks.

**Live:** https://homekrafted.in — runbook `docs/DEPLOY.md`, tester handout
`docs/TESTING.md`.

Where to look: plan (scope authority)
`~/.claude/plans/read-the-handoff-i-jolly-hennessy.md` · design contract
`handoff/design-system/` + `DESIGN.md` · launch gaps `docs/LAUNCH-READINESS.md`
and the ranked backlog `docs/PRODUCTION-AUDIT.md` (check before proposing
work) · gifting plan `docs/GIFTING-REWORK.md` (read before touching `/gifts`,
categories or listing forms) · notifications `docs/NOTIFICATIONS.md` (add a
trigger, add a row) · native apps `docs/APP.md` · `CHANGELOG.md`.

## Standing blockers (full text: `docs/rules/history.md`)

- **Production has no seeded data since 2026-09-03** (only admin + platform
  vendor `vd8`). Never run `seed*.ts` against production.
- **Unshipped work carrying production migrations** (return-to-cart, R4, R7,
  R6a, G0/G1) needs the owner's go-ahead **and a backup in the turn it
  ships**; migrations run before the API restarts.
- **Provider config, not code:** Google/Apple OAuth IDs unset (social
  sign-in refuses every token — never weaken the verifier); Twilio/WhatsApp
  set but never proven; Resend email verified. A missing provider key is a
  logged stub — a supported state, never make it throw.
- **Razorpay live switch is server env only** (no client rebuild).
- **HomeKrafters are onboarded by an admin-issued, show-once temporary
  password** until SMS/email invites reach people.
- **Commission is a markup the buyer pays** (`common/pricing/commission.ts`);
  `mapProduct` (buyer) vs `mapProductForMaker` (maker/admin edit) are not
  interchangeable; an order records its own split at checkout and a payout
  sums `sellerAmount`, never re-derives it.
- **The "Backed by" logos on `/about` are unverified** — never alter a mark,
  keep the sentence under each.

## Stack

- **Next.js** (App Router, React, TypeScript), npm
- Styling: **CSS Modules** over `styles/tokens.css` (no Tailwind, no inline
  styles like the prototype)
- Fonts: `next/font/google` — Fraunces (variable), **Hanken Grotesk**,
  IBM Plex Mono, Kalam (annotations) — see Fonts & tokens wiring
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

**`npx tsc --noEmit` does not resolve a CSS module path** — `*.module.css`
is a wildcard ambient declaration, so deleting one and leaving an import
behind passes typecheck, lint and jest and fails only in `next build`.
That is how a portal commit reached the box and broke the deploy on
2026-09-04. **Run `npm run build` before pushing anything that deletes or
renames a file.**

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
      placeholder/            ImageSlot — labelled placeholder, see docs/rules/frontend.md
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
      featured-order.ts       featured-first ordering (compareFeatured, pinFeaturedFirst, …) — pure
      home-rails.ts           how the home page's uncurated rails are ordered — pure
      product/merchandising-badge.ts   the product-card badge chain — pure
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
  mobile/                  native app — Expo SDK 57, expo-router; see docs/APP.md
    src/platform/            the 5 shims — env, session, http, reachability, upload
    metro.config.js          watchFolders + resolveRequest ALIASES into client/lib
  rider/                   delivery-partner app — Expo, own project (does NOT compile client/lib);
                           see docs/rules/rider-fleet.md and rider/README.md
  handoff/                 DESIGN SYSTEM ONLY — read, never edit, never delete
  docs/                    PRD, API, architecture, data model, design system, ADRs
  CLAUDE.md  CHANGELOG.md
```

## Read before touching… (the rest of the rules live here)

These bind as much as anything above; they moved out only so this file stays short.

| Before you touch… | Read |
|---|---|
| orders, cart, checkout, payments, refunds, wallet, meal plans, ISB delivery, dashboards' money figures, a seller's sale | `docs/rules/orders-and-money.md` |
| categories, attributes, icons, listings and their forms/photos, moderation, browse pages, diet/pre-order badges, reels, occasions, hampers | `docs/rules/catalogue.md` |
| anything location, pincodes, vendor coords, pickup addresses, courier/Shadowfax | `docs/rules/location-and-delivery.md` |
| `rider/`, `server/src/rider`, admin fleet screens, H3 zones, rider push | `docs/rules/rider-fleet.md` |
| any `/seller/*` or `/admin/*` screen, sub-admin scopes, verification badges, vendor avatars | `docs/rules/portals.md` |
| sign-in, sessions, refresh, passwords, OTP, invites, `/seller/me` | `docs/rules/auth.md` |
| tokens/fonts, `ImageSlot`, uploads, loading states, a11y, SEO/metadata, policy pages, the landing page `/` | `docs/rules/frontend.md` |
| tests, structural specs, contract harnesses | `docs/rules/tests.md` |
| the full reasoning behind the non-negotiable rules | `docs/rules/non-negotiables.md` |
| the full how-to-add rules (failures, browse machinery, URL state, nav menus) | `docs/rules/how-to-add.md` |
| launch blockers in full, the milestone history, M0 decisions | `docs/rules/history.md` |

## Non-negotiable rules (reasoning: `docs/rules/non-negotiables.md`)

- **`handoff/` is read-only reference** — never edit, delete, or lift its
  markup/inline styles. `styles/tokens.css` is a verbatim copy and is law;
  gaps go in `styles/tokens.extend.css`.
- **White-first; warmth is accent-only.** Canvas `#F4F3F0`, cards white +
  `1px #ECEAE4`. No beige/cream fills.
- **Gold `--hk-gold` never carries text** (3.2:1). Gold-family text uses
  `--hk-gold-text-sm`. Terracotta is prices/remove.
- **Every new surface owes a contrast pass:** add the route to
  `e2e/tests/public-routes.ts` and run `node e2e/sweep.mjs` before calling a
  visual change done.
- **Images: real assets or the placeholder, always via `<ImageSlot>`.** Never
  AI-generated product/food imagery. Stock photos only if logged in
  `docs/IMAGE-LICENSES.md` and processed by `scripts/process-stock-images.mjs`.
- **CSS Modules + `var(--hk-*)` only.** No Tailwind/shadcn/framer-motion/cva,
  no inline `style` except genuinely dynamic values.
- **Widths:** consumer surface 1440px (`[data-surface="consumer"]` marker),
  portals 1180, running prose `container-prose`. Header collapses below
  ~1190px; re-measure tab capacity against 1352px before adding a tab.
- **`client/lib` is shared with the native app:** no `react`, `next`,
  `@/components/*`, non-`@/lib` aliases, or DOM globals in it
  (`shared-boundary.spec.ts`). `http.ts`, `auth/session.ts`,
  `api/unreachable.ts` are forked for the app.
- **Breakpoints: 420 · 560 · 640 · 780 · 900.** Fold stray values only when
  already fixing that file.
- **No text control under 16px on phones** (global rule; never
  `maximum-scale=1`, never re-shrink a control).

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

## How to add things (full: `docs/rules/how-to-add.md`)

- **Domain field:** `lib/types/` → mock in `lib/data/` → getter in `lib/api/`.
  Components import data only from `@/lib/api`.
- **Component:** `Thing.tsx` + `Thing.module.css`, named export, tokens only;
  split a server wrapper from a `"use client"` leaf.
- **Failures:** read `docs/ERROR-HANDLING.md`. A failed request is never an
  answer — only 401/403 end a session (`lib/auth/session-answer.ts`). A failed
  read shows a Notice with Try again, never the empty state. A `lib/api`
  **write** never swallows its refusal (`silent-failure.spec.ts`).
  `addItem` rejects and "Added ✓" waits for it.
- **Loading copy and status labels** come from `lib/kitchen-copy.ts` (never
  random, true of a candle and a curry, plain in the admin panel).
- **New route:** check `lib/channel.ts` first; `formatCurrency`/`formatDate`
  from `lib/format`; SEO rules in `docs/rules/frontend.md`.
- **Listing pages:** filters/sort/page live in the URL (`lib/browse-params.ts`,
  `router.replace`, debounced); compose `components/browse/`; a category is
  a single-select scope, not a filter.
- **New milestone:** build to the brief's scope, update `CHANGELOG.md` and
  affected docs, report back.

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

## Design System

Read `DESIGN.md` before making any visual or UI decision — it is the
approved "Maker's Table" refinement direction (2026-09-02): same brand,
warmer paper canvas, Fraunces pushed harder, Hanken Grotesk body, receipt
provenance, rationed Kalam annotations. It layers over `handoff/` via
`tokens.extend.css` and never edits `tokens.css`. Do not deviate without
explicit owner approval; in QA, flag code that doesn't match it.

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
