# Architecture

High-level structure as of M0 (Foundation). Diagrams (system + request-flow,
generated via the `/diagram` skill) land alongside M8 once the backend
shape is finalized — this doc is the prose version until then.

## Stack

- **Framework:** Next.js, App Router, React, TypeScript, npm.
- **Styling:** CSS Modules consuming CSS custom properties from
  `styles/tokens.css` (the design system's single source of truth). No
  Tailwind, no CSS-in-JS, no inline styles (the prototype's inline-style
  approach is a visual reference only, not a technique to carry forward).
- **Fonts:** `next/font/google` — Fraunces, IBM Plex Sans, IBM Plex Mono —
  loaded once in `app/layout.tsx`, exposed as CSS variables consumed by
  the token font-family vars (see `docs/DESIGN-SYSTEM.md`).
- **Icons:** `lucide-react` for line icons; inline SVG for brand marks
  (WhatsApp, App Store, Play) that must stay unrecolored.
- **Data (M0–M7):** typed mock data (`lib/data/`) behind an `async`
  client-stub API (`lib/api/`). No network calls yet.
- **Data (M8+):** Postgres + Prisma, generated from `lib/types/` (the
  schema contract). Auth.js for phone OTP / email / social login.
  Razorpay for online payment. `lib/api/` function bodies swap from mock
  reads to real `fetch()` calls — call sites don't change.
- **Messaging:** `lib/messaging.ts` — a `Messaging` interface with a
  click-to-chat (`wa.me` deep link) implementation today; a WhatsApp Cloud
  API implementation drops in behind the same interface in M9.

## Why frontend-first

The plan's execution model is **Opus plans + reviews, Sonnet builds**,
milestone by milestone, **frontend-first**: build the full responsive UI
for every feature against typed mock data, and let the fields the screens
actually need fall out into `lib/types`. Those types then become the
Prisma schema in M8, once real usage has shaped them — rather than
guessing a backend schema up front and bending the UI to fit it.

## Layering

```
app/                     routes — compose components, fetch via lib/api
  ↓ imports
components/               presentation — UI primitives (M1), layout shell (M0),
                          per-module screens/widgets (M2+)
  ↓ imports
lib/api/                  the ONLY data-access boundary components should use
  ↓ imports (today)                              ↓ imports (M8+)
lib/data/                 typed mock fixtures      Prisma client → Postgres
  ↑ typed against
lib/types/                 the schema contract (Prisma models mirror this)
```

Two cross-cutting modules sit beside this stack, not inside it:

- `lib/channel.ts` — encodes the plan's channel matrix (what each of the
  4 modules may do on web) as data (`CHANNEL_RULES`), so screens check a
  flag instead of re-deriving the rule. Marketplace/Laundry render
  checkout; Snacks renders a menu + WhatsApp send, never a cart; full
  meals renders promo copy only, never a menu.
- `lib/messaging.ts` — the messaging abstraction Snacks (and later,
  Laundry/order status notifications) send through, isolating the M9
  Cloud-API swap to one file.

## App shell

`app/layout.tsx` is the composition root: it loads the three font
families, imports `styles/tokens.css` then `styles/globals.css` (import
order matters — see `docs/DESIGN-SYSTEM.md`), and wraps every route in
`AnnouncementBar` → `Header` → `{children}` → `Footer`
(`components/layout/`). `Header` is a server component that fetches
wallet balance / cart count / nav via `lib/api`, then hands plain props to
`HeaderClient` (`"use client"`) for the interactive bits (hamburger,
`MobileDrawer` open state) — data-fetching stays server-side; only actual
interaction is client-side.

## Security model (sketch — hardens in M8)

Nothing in M0–M7 touches real user data or payments — it's a fully static/
mock frontend. From M8:

- Auth.js session cookie gates all user-scoped reads/writes; unauthenticated
  requests to wallet/orders/wishlist/etc. 401.
- The wallet ledger is server-authoritative: the client never computes or
  submits `balanceAfter` (see `lib/types/wallet.ts` — that field only ever
  gets written by the server once real writes exist).
- Razorpay webhooks are the source of truth for payment confirmation, not
  client-side "success" callbacks.
- Every backend diff in M8 goes through `/security-review` before
  integration (per the plan's verification section).

## Testing & verification

Per milestone: Sonnet self-checks the Definition-of-Done (build/typecheck/
lint clean, responsive at 360/390/768/1180, docs updated), then Opus runs
`/review` + `/design-review` (+ `/security-review` for backend work)
before integrating. Playwright smoke tests (auth → cart → wallet pay →
order → refund → review) are planned post-M8.
