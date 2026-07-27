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
  schema contract). **JWT** (access + rotating refresh, not Auth.js — see
  "Backend (M8.0)" below for why) for phone OTP / email / social login.
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

## Role surfaces (M10a seller; M11a admin)

One app, three role surfaces, gated by `client/middleware.ts` on a
single `UserRole` (`consumer`\|`seller`\|`admin`, `lib/types/shared.ts`):
consumer at `/` (M0–M7, no gate), seller at `/seller/*` (M10), admin at
`/admin/*` (M11a). Each surface is its own route group with its own
shell component (`SellerShell`/`AdminShell`) and its own login screen
(`/seller/login`/`/admin/login`) — deliberately **not** a shared
`RoleShell`, so the two can diverge freely (e.g. M11b's admin-only
Catalog/Wallet/Collections/Analytics nav additions) without either
one's changes risking a regression in the other. All three surfaces sit
on the same `components/ui` primitives and `styles/tokens.css`.

`lib/auth/AuthContext.tsx` is the one mock identity store behind every
surface — `signIn()` (consumer), `signInAsSeller(type)` (one of 3 demo
sellers), `signInAsAdmin()` (the one demo admin) all converge on the
same `localStorage`-persisted state, mutually exclusive (signing in one
way replaces whichever identity was active). Every sign-in also mirrors
`role` into a plain, non-httpOnly `hk_role` cookie purely so
`middleware.ts` — which runs server-side and can't read `localStorage`
— can redirect an unauthorized `/seller/*`/`/admin/*` request to that
surface's login. **This is not a security boundary**: the cookie is
client-settable, and every `lib/api/seller.ts`/`lib/api/admin.ts`
function trusts whatever `vendorId`/`sellerId` (seller) or nothing at
all (admin — every admin query is deliberately unscoped) the calling
screen passes, with no server-side check that the caller is actually
who they claim. **M8 decision:** the real session is a **JWT** pair
(access + rotating refresh — not Auth.js/NextAuth, see "Backend (M8.0)"
below for why), swapped in at **M8.4** to replace the cookie +
`AuthContext`, and must re-derive every scoping id from that verified
token rather than trusting the client — see `docs/DATA-MODEL.md`'s
M10/M11a notes for the specific functions this applies to.

## Backend (M8.0) — `server/`

The standalone API from the plan's stack section, now real. **NestJS**
(TypeScript) + **Prisma** over **Postgres**, living in `server/`, entirely
separate from `client/`'s Next.js process — the two communicate over
HTTP once M8.4 wires `client/lib/api` up to it, never by sharing a
process or importing each other's code. `app/` (native, future) hits the
same API.

**Why JWT, not Auth.js:** the plan's stack line named Auth.js, but that
library is built around Next.js route handlers/middleware — `server/` is
a standalone NestJS service consumed by both the web app *and* future
native apps, which can't use a Next-coupled session library. A JWT
access+refresh pair is transport-agnostic (any client that can send an
`Authorization: Bearer` header), which is the actual requirement stated
in `server/README.md`'s "Lands in M8" section ("issued as tokens/sessions
usable by *both* web and mobile"). See `docs/adr/0002-backend-stack.md`
for the full decision record.

**Layering**, same shape as the frontend's own layering section above,
translated to the backend:

```
src/*/*.controller.ts   HTTP boundary — DTOs in, typed responses out
  ↓
src/*/*.service.ts       business logic — the only layer that touches Prisma
  ↓
src/prisma/prisma.service.ts   the one PrismaClient instance (Nest-lifecycle-managed)
  ↓
Postgres                        via prisma/schema.prisma
```

`src/common/` holds the cross-cutting pieces every module reuses:
decorators (`@Public`, `@Roles`, `@CurrentUser`), guards (`JwtAuthGuard`,
`RolesGuard`, both registered globally as `APP_GUARD`s in `AppModule`, in
that order — `RolesGuard` reads `request.user`, which `JwtAuthGuard` sets,
so ordering matters), the error-envelope filter, and the ownership-scoping
helpers M8.1–M8.3's seller/admin endpoints must route every query through.

### Request / auth flow

1. **Sign in** (`POST /auth/login`, `/auth/otp/verify`, or
   `/auth/social/:provider`) → `AuthService` verifies credentials
   (argon2 for passwords/OTP codes), issues a JWT **access token**
   (short TTL, `JWT_ACCESS_TTL`) and a JWT **refresh token** (longer TTL,
   `JWT_REFRESH_TTL`), and persists the refresh token server-side as a
   SHA-256 hash (`RefreshToken.tokenHash`) — never the raw token.
2. **Every subsequent request** carries `Authorization: Bearer
   <accessToken>`. The global `JwtAuthGuard` verifies the token's
   signature + expiry against `JWT_ACCESS_SECRET`, then attaches
   `{ userId, role, sellerId? }` to `request.user` — everything downstream
   (`@CurrentUser()`, `RolesGuard`, ownership-scoping helpers) reads from
   that verified value, never from a client-submitted id. A missing or
   invalid token → `401`; a route with `@Roles(...)` and the wrong role →
   `403`.
3. **Access token expires** (short-lived by design) → the client calls
   `POST /auth/refresh` with its refresh token. `AuthService` verifies it,
   checks the stored hash is unrevoked and unexpired, then **rotates** it:
   the old row is marked revoked and a brand-new refresh token (+ row) is
   issued in the same operation. Presenting an already-rotated (revoked)
   refresh token is rejected outright — the reuse-detection signal a
   stolen/replayed token trips.
4. **Sign out** (`POST /auth/logout`) revokes the presented refresh token.
   The still-valid access token that was already issued keeps working
   until it naturally expires (by design — access tokens are stateless
   and short-lived specifically so revocation only needs to target the
   refresh token, not require a server-side check on every request).

### Payment & ledger flow (M8.2) — `server/src/{wallet,payments}/`

The wallet ledger is the one place in this codebase where correctness
matters more than anything else — a bug here either loses a shopper's
money or lets one fabricate it. The design leans on three primitives
stacked together, not any single trick:

**1. One write primitive, always.** Every balance mutation anywhere in
the app — a top-up credit, a wallet-pay debit, a cashback credit, a
refund credit, an admin adjustment — funnels through
`WalletService.postLedgerEntryTx`, the only code that ever writes
`Wallet.balance`/`WalletTransaction.balanceAfter`. It:
- Locks the wallet row with `SELECT ... FOR UPDATE` (raw SQL inside the
  open `Prisma.TransactionClient`) before reading the current balance —
  so two concurrent mutations against the *same* wallet can't both read
  the same stale balance and both write from it. The second waits for the
  first's transaction to commit (or roll back), then computes from the
  post-first-write balance. This is the actual double-spend guard,
  independent of idempotency keys — verified with two truly concurrent
  `POST /orders/:id/pay` calls whose combined total exceeded the wallet
  balance: exactly one succeeded, the other got a clean `402` with the
  balance and the losing order both left untouched (no negative balance,
  no torn write).
- Computes `balanceAfter` **server-side**, from the just-locked balance —
  never trusts, reads, or accepts a client-submitted `balanceAfter` or
  running total anywhere in the request/response contract.
- Rejects a debit that would take the balance negative with `402` before
  writing anything — no partial/negative balance is representable.
- Fires the wallet's `below-threshold` auto-top-up rule (if enabled)
  immediately after a debit that drops the balance under the configured
  floor, inside the same transaction — mirrors
  `client/lib/wallet/WalletContext.tsx#pay`'s reactive-only firing (never
  rescues an insufficient debit, only tops back up after a successful
  one).

**2. Idempotency keys, DB-enforced, no polling.** A money-mutating
endpoint that accepts an `Idempotency-Key` header runs the whole op
(claim + mutation) inside one transaction whose first statement `INSERT`s
a claim row into `IdempotencyKey`, keyed on a unique `(userId, scope,
key)` index. A concurrent duplicate call's `INSERT` blocks on Postgres'
own unique-index conflict handling until the first transaction commits or
rolls back — commits → the second raises a unique violation, caught, and
the now-committed row's stored JSON result is returned instead of
re-running the op; rolls back (the op legitimately failed, e.g.
insufficient balance) → the claim row never existed, so a retry with the
same key runs for real. No polling, no separate lock table, no
in-memory-only guard that a second server instance wouldn't see —
correctness comes from the database's own transactional guarantees. See
`server/src/common/idempotency/idempotency.service.ts`.

**3. Razorpay: verify first, trust nothing else.**
`POST /payments/razorpay/order` opens a Razorpay order for an amount read
**from the DB** — `Order.total` for an order payment, never a
client-submitted figure; a shopper's declared top-up amount is the one
accepted client input, but it's inert on its own (it only determines what
amount Razorpay's own checkout will collect — nothing in this app credits
anything until the next step). `POST /payments/razorpay/webhook`:
1. Verifies `X-Razorpay-Signature` — HMAC-SHA256 over the **raw** request
   body bytes, keyed with `RAZORPAY_WEBHOOK_SECRET`, compared with
   `crypto.timingSafeEqual` (constant-time, so an early-exit string
   comparison can't leak how many leading bytes matched via response-time
   variance). Requires the pre-JSON-parse bytes specifically — wired via
   `NestFactory.create(AppModule, { rawBody: true })` in `main.ts`, which
   still parses `req.body` normally for every route while additionally
   stashing the raw buffer on `req.rawBody` for this one handler.
   **An invalid or missing signature is rejected `400` before any other
   code runs — nothing is evaluated, nothing is looked up.**
2. Only then looks up the referenced `RazorpayOrder` row by
   `payload.payment.entity.order_id` — the row this app itself created in
   step 1 above, so its `amount`/`purpose`/`userId`/`orderId`/`walletId`
   are all server-derived, never re-read from the webhook payload.
3. Dedupes by `(event, paymentId)` via a `WebhookEvent` unique-insert
   inside the same transaction as the credit/order-transition — a
   redelivered webhook (Razorpay retries on timeout/non-2xx) either loses
   that insert race and is acknowledged `200` as a no-op, or — belt and
   suspenders — finds `RazorpayOrder.status` already `"captured"` and
   no-ops anyway.
4. Credits the wallet (`purpose: "topup"`, + the 3% bonus above ₹2,000,
   mirroring the mock's `TOPUP_BONUS_THRESHOLD`/`RATE`) or transitions the
   linked `Order` `pending-payment -> placed` + credits cashback
   (`purpose: "order"`) — both go through the same `postLedgerEntryTx`
   primitive as every other credit in the app.

**Test-mode note:** `RAZORPAY_KEY_ID`/`_SECRET` ship as `.env.example`
placeholders (`rzp_test_placeholder`/`placeholder_secret`); when detected,
`POST /payments/razorpay/order` mints a local `order_mock_<uuid>` instead
of calling the real Razorpay API (`mock: true` in the response) so the
whole flow — including a *real*, correctly-HMAC-signed webhook call, since
`RAZORPAY_WEBHOOK_SECRET` is a real (if placeholder-valued) shared secret
either way — stays fully exercisable end to end without a live Razorpay
account. The real API-call code path (`RazorpayClient`, `fetch`-based, no
SDK dependency) still exists and takes over the moment real keys are set.

**Seam left for M8.3:** seller payouts. `Seller`/`Payout` tables exist in
the schema (M8.0) but nothing here credits a seller's payout ledger from
a captured payment — that's a distinct flow (platform's share vs. a
specific seller's share of a specific line item) explicitly deferred to
M8.3, not implemented or stubbed in M8.2.

## Security model

Nothing in M0–M7 touched real user data or payments — it was a fully
static/mock frontend. **M8.0 makes the auth + users/addresses slice real**
(everything else stays mock until M8.1–M8.3):

- JWT access token gates every non-`@Public()` route; unauthenticated
  requests to any authed endpoint (`/users/me`, and every M8.1+ user-
  scoped endpoint) return `401`.
- Passwords and OTP codes are **argon2**-hashed, never stored or logged
  in plaintext. Refresh tokens are stored only as a SHA-256 hash.
- **The wallet ledger is server-authoritative as of M8.2**: the client
  never computes or submits `balanceAfter` (see `lib/types/wallet.ts` —
  that field is only ever written inside `WalletService.postLedgerEntryTx`,
  the one code path that touches `Wallet.balance`/`WalletTransaction`).
  Every balance mutation locks the wallet row (`SELECT ... FOR UPDATE`)
  before computing the new balance, and every money-mutating endpoint
  supports an `Idempotency-Key` for retry/double-submit safety — see
  "Payment & ledger flow" above for the full design.
- **Razorpay webhooks are the source of truth for payment confirmation as
  of M8.2**, not client-side "success" callbacks: `POST
  /payments/razorpay/webhook` verifies `X-Razorpay-Signature` (HMAC-SHA256
  over the raw body, `crypto.timingSafeEqual`) before any state changes,
  and only a verified `payment.captured` event ever credits a wallet or
  transitions an order.
- Admin-role RBAC is enforced server-side via `RolesGuard` + `@Roles('admin')`
  (not the readable/settable `hk_role` cookie `middleware.ts` checks in
  the M0–M11a frontend mock) — verified end to end since M8.0, and again
  for the full `/admin/*` surface in M8.3c (a `consumer` **and** a
  `seller` token against every admin route both get a real `403`, not
  just a UI hide). **Every admin mutation writes an `AdminAuditLog` row**
  as of M8.3c (actor, action, target type/id, JSON metadata) — see
  `docs/API.md`'s "Admin panel (M8.3c)" section, `GET /admin/audit`. This
  completes the 3-role (`consumer`/`seller`/`admin`) RBAC + ownership
  model server-side: consumer/seller endpoints re-derive their scoping id
  from the verified JWT (never a client-supplied one — `ownership.util.ts`),
  admin endpoints are deliberately unscoped and audited instead.
- Platform hardening in place today: `helmet()`, an explicit CORS
  allow-list (`CLIENT_ORIGIN`), global `ValidationPipe` (whitelist +
  reject-unknown-fields + transform), `@nestjs/throttler` rate limiting
  (global default + a tighter override on every `/auth/*` route,
  verified to actually return `429`), and a global exception filter that
  normalizes every error into `{ error: { code, message } }` without
  leaking stack traces.
- Every backend diff goes through `/security-review` before integration
  (per the plan's verification section) — M8.0 is scheduled for one.

## Testing & verification

Per milestone: Sonnet self-checks the Definition-of-Done (build/typecheck/
lint clean, responsive at 360/390/768/1180 for frontend work; build +
boot + curl proofs for backend work), docs updated — then Opus runs
`/review` + `/design-review` (+ `/security-review` for backend work)
before integrating. Playwright smoke tests (auth → cart → wallet pay →
order → refund → review) are planned once M8.1–M8.4 land the remaining
domain endpoints + the client swap.
