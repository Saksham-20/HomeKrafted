# server/ — Homekrafted backend API

The standalone backend API shared by the web app (`client/`) and the future
native apps (`app/`). **M8.0 (backend foundation)** — NestJS + Prisma +
Postgres scaffold, the full domain schema (every entity in
`client/lib/types/*.ts`), and one real vertical slice: JWT auth (email+
password, phone OTP, stub social) + RBAC + a Users/Addresses resource.
Domain endpoints (catalog, cart, orders, wallet, laundry, snacks, seller,
admin) are real as of **M8.1–M8.3c** — see "Seams for later milestones"
below for the per-milestone breakdown and what's still ahead (M8.4's
client swap, M9's WhatsApp/notification delivery).

## Stack

- **NestJS** (TypeScript), npm
- **Prisma** ORM over **Postgres** (`provider = postgresql`)
- **JWT** access (short-lived) + refresh (rotating, DB-backed) — no
  `@nestjs/passport`, a small custom `JwtAuthGuard` instead
- **argon2** for password + OTP-code hashing
- **class-validator**/**class-transformer** DTOs, global `ValidationPipe`
- **helmet**, CORS, **@nestjs/throttler** rate limiting
- **@nestjs/config** with fail-fast env validation

## Setup

```bash
cd server
npm install
cp .env.example .env      # then edit — see "Environment variables" below
```

### Database

Either run Postgres via Docker:

```bash
docker compose up -d      # postgres:16, matches .env.example's defaults
```

...or point `DATABASE_URL` at any Postgres 14+ instance you already have
running (a local Homebrew/apt install works fine — that's what M8.0 was
actually developed and verified against, no Docker available in that
environment). The user in `DATABASE_URL` needs `CREATEDB` privilege for
`prisma migrate dev`'s shadow database:

```sql
CREATE ROLE homekrafted LOGIN PASSWORD 'homekrafted' CREATEDB;
CREATE DATABASE homekrafted OWNER homekrafted;
```

Then:

```bash
npm run prisma:migrate    # applies prisma/migrations/, generates the client
npm run prisma:seed       # ports client/lib/data/*.ts into Postgres
```

`npm run prisma:seed` is idempotent — it clears every table it owns
(child-before-parent) before re-inserting, so it's safe to re-run in dev.
Seeded demo accounts (email + password `Passw0rd!123` for all of them):

| Account | Email | Role |
|---|---|---|
| Consumer | `ananya.iyer@example.com` | `consumer` |
| Seller — maker | `anjali@anjaliskitchen.example` | `seller` (type `maker`) |
| Seller — laundry partner | `ravi@freshfoldlaundry.example` | `seller` (type `laundry`) |
| Seller — snack seller | `meera@meerassnackbox.example` | `seller` (type `snack`) |
| Admin | `admin@homekrafted.example` | `admin` |

### Run

```bash
npm run start:dev     # watch mode, http://localhost:4000
npm run build          # tsc via `nest build`
npm run start:prod      # node dist/main (after build)
```

`/health` (liveness) and `/health/db` (readiness — pings Postgres) are
unprefixed and unauthenticated. Everything else sits under `/api/v1`.

## Environment variables

See `.env.example` for the full annotated list. Never commit a real `.env`
— the repo root `.gitignore`'s unanchored `.env*` rule already covers
`server/.env`. In production, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
must be real random secrets (`openssl rand -base64 48`) and must differ
from each other — `src/config/env.validation.ts` refuses to boot with the
dev placeholders once `NODE_ENV=production`.

## Verifying the stack (curl walkthrough)

```bash
BASE=http://localhost:4000/api/v1

# Email+password login
curl -sS -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ananya.iyer@example.com","password":"Passw0rd!123"}'
# -> { accessToken, refreshToken, user }

ACCESS=<accessToken from above>

# Protected resource
curl -sS $BASE/users/me -H "Authorization: Bearer $ACCESS"

# No token -> 401
curl -sS -i $BASE/users/me

# Wrong role (consumer hitting the admin-only route) -> 403
curl -sS -i $BASE/users/user-admin-demo -H "Authorization: Bearer $ACCESS"

# Phone OTP — the "sender" is a stub that logs the code to the server
# console (see `warn`-level log lines) instead of sending a real SMS.
curl -sS -X POST $BASE/auth/otp/request -H 'Content-Type: application/json' \
  -d '{"phone":"+919812345678"}'
# then read the code from the server log and:
curl -sS -X POST $BASE/auth/otp/verify -H 'Content-Type: application/json' \
  -d '{"phone":"+919812345678","code":"<code from log>"}'

# Refresh (rotating — the old refresh token is revoked and cannot be reused)
curl -sS -X POST $BASE/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'

# Logout (revokes the refresh token)
curl -sS -X POST $BASE/auth/logout -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

Address CRUD (proves a real owned resource end to end):

```bash
curl -sS $BASE/users/me/addresses -H "Authorization: Bearer $ACCESS"
curl -sS -X POST $BASE/users/me/addresses -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"label":"Test","recipientName":"Ananya Iyer","phone":"+919845000000","line1":"1 Test St","city":"Bengaluru","state":"Karnataka","pincode":"560001"}'
curl -sS -X DELETE $BASE/users/me/addresses/<id> -H "Authorization: Bearer $ACCESS"
```

This was actually run against a local Postgres during M8.0's build (no
Docker available in that environment — a Homebrew Postgres 15 install was
used instead, see "Setup" above) and all of the above returned the
expected status codes, including the 401/403 negative cases and the
rate-limit (`429`) after repeated `/auth/login` attempts.

Commerce (M8.1) — browse, cart, order, cross-user isolation:

```bash
# Browse: filter + sort (public, no token needed)
curl -sS "$BASE/products?category=pickles&sort=price-asc"
curl -sS "$BASE/products/mango-thokku-pickle"

# Cart — seeded demo cart already has 2 lines for user-demo
curl -sS $BASE/cart -H "Authorization: Bearer $ACCESS"
curl -sS -X POST $BASE/cart/items -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"productId":"pr4","sku":"roasted-makhana-100g","quantity":2}'

# Order — server recomputes every line's price from the DB, snapshots it
# onto OrderItem, decrements stock, clears the cart, starts at
# status "pending-payment" (the M8.2 payment seam — see docs/API.md)
curl -sS -X POST $BASE/orders -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"defaultAddressId":"addr-demo-1","paymentMethod":"wallet"}'
curl -sS $BASE/orders -H "Authorization: Bearer $ACCESS"

# Wishlist
curl -sS -X POST $BASE/wishlist/items -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -d '{"productId":"pr2"}'
curl -sS -X DELETE $BASE/wishlist/items/pr2 -H "Authorization: Bearer $ACCESS"

# Review (verifiedPurchase computed server-side from the user's own orders)
curl -sS -X POST $BASE/reviews -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"targetType":"product","targetId":"pr1","rating":5,"body":"Loved it."}'

# Cross-user isolation: register a second account, confirm it gets its
# own (empty) cart and a 404 — never someone else's data — for user-demo's
ISO=$(curl -sS -X POST $BASE/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Isolation Test","email":"iso-test@example.com","password":"Passw0rd!123"}')
ACCESS_B=$(python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])" <<< "$ISO")
curl -sS $BASE/cart -H "Authorization: Bearer $ACCESS_B"          # own empty cart
curl -sS -i $BASE/orders/<user-demo-order-id> -H "Authorization: Bearer $ACCESS_B"  # 404
```

All of the above was run against the seeded local Postgres during M8.1's
build and returned the expected shapes/status codes — see the M8.1
handoff notes for the full transcript (filter+sort browse, product-by-
slug, add-to-cart with server-computed totals, order creation with
price-snapshotting/stock-decrement/multi-address shipments, cross-user
404s on cart/orders, wishlist add/remove, review create with
`verifiedPurchase: true`).

Integrations (M9) — WhatsApp Cloud API, notification fan-out, seller
onboarding closing the loop:

```bash
BASE=http://localhost:4000/api/v1

# --- WhatsApp webhook: GET verify handshake -------------------------------
# WHATSAPP_VERIFY_TOKEN in .env must match `hub.verify_token` below.
curl -sS "$BASE/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=CHALLENGE_OK"
# -> 200, body: CHALLENGE_OK  (verbatim echo)
curl -sS -i "$BASE/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X"
# -> 403 (wrong token — challenge never echoed)

# --- WhatsApp webhook: POST, HMAC-verified over the raw body --------------
# WHATSAPP_APP_SECRET in .env is the HMAC key (for local testing, any
# string works — it's a shared secret, not a real Meta credential).
PAYLOAD='{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages","value":{"contacts":[{"profile":{"name":"Priya Sharma"}}],"messages":[{"from":"919812399999","type":"text","text":{"body":"Hi Homekrafted! I'\''d like to order:\n2x Masala Mathri\n1x Besan Ladoo\n\nEstimated total: ₹400"}}]}}]}]}'
BAD_SIG="sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
curl -sS -i -X POST "$BASE/whatsapp/webhook" -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: $BAD_SIG" -d "$PAYLOAD"
# -> 400 {"error":{"code":"BAD_REQUEST","message":"Invalid webhook signature"}} — no SnackOrder written

SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "<WHATSAPP_APP_SECRET>" | sed 's/^.* //')
curl -sS -X POST "$BASE/whatsapp/webhook" -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: sha256=$SIG" -d "$PAYLOAD"
# -> 200 {"received":true} — the exact "1x Snack Name" lines
# (client/lib/snacks/message.ts#buildSnackListMessage's own shape) are
# parsed into a real SnackOrder, matched against each Snack row's
# sellerId; server log shows:
#   [WhatsAppInboundService] [WHATSAPP INBOUND] created SnackOrder <id> for seller sl3 ...
#   [WhatsAppService] [WHATSAPP STUB — not sent, ...] to=919812399999 text="Hi Priya Sharma, update on order <id>: we've received your order." ...

# --- Snack seller advances the new order: real WhatsApp send seam --------
SELLER=$(curl -sS -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"meera@meerassnackbox.example","password":"Passw0rd!123"}')
SELLER_TOKEN=$(python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])" <<< "$SELLER")
curl -sS $BASE/seller/snack-orders -H "Authorization: Bearer $SELLER_TOKEN"   # find the new order's id
curl -sS -X POST "$BASE/seller/snack-orders/<orderId>/advance" -H "Authorization: Bearer $SELLER_TOKEN"
# -> status "received" -> "accepted"; server log shows a second
# [WHATSAPP STUB] line with the "accepted" status text, same recipient.

# --- Notification fan-out gated by NotificationPreference -----------------
CONSUMER=$(curl -sS -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ananya.iyer@example.com","password":"Passw0rd!123"}')
CONSUMER_TOKEN=$(python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])" <<< "$CONSUMER")
CONSUMER_ID=$(python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])" <<< "$CONSUMER")
curl -sS -X PATCH "$BASE/notifications/preferences/wallet" -H "Authorization: Bearer $CONSUMER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"sms":true,"whatsapp":false,"email":true,"inapp":true}'

ADMIN=$(curl -sS -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@homekrafted.example","password":"Passw0rd!123"}')
ADMIN_TOKEN=$(python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])" <<< "$ADMIN")
curl -sS -X POST "$BASE/admin/wallet/$CONSUMER_ID/adjust" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"direction":"credit","amount":75,"reason":"proof"}'
# -> {"wallet":{...},"balanceAfter":...,"transactionId":"..."} — the
# transactionId gap flagged in docs/API.md is closed (M9)
curl -sS $BASE/notifications -H "Authorization: Bearer $CONSUMER_TOKEN"
# -> 3 new rows for this event, channel "sms"/"email"/"inapp" — no
# "whatsapp" row, since that channel was left off. Server log shows one
# [SMS STUB] + one [EMAIL STUB] line with the exact rendered message.

# --- Seller-application create closes the /sell -> admin -> seller loop --
curl -sS -X POST "$BASE/seller-applications" -H 'Content-Type: application/json' \
  -d '{"businessName":"Test Studio","contactName":"Test Person","email":"test@example.com","phone":"+919800000000","category":"artist","city":"Pune","description":"Handmade decor."}'
# -> 201, status "new" — a real row, not a mock
curl -sS "$BASE/admin/sellers/applications?status=pending" -H "Authorization: Bearer $ADMIN_TOKEN"
# -> includes the application just created
curl -sS -X POST "$BASE/admin/sellers/applications/<id>/approve" -H "Authorization: Bearer $ADMIN_TOKEN"
# -> {application: {status:"approved"}, seller: {status:"approved", type:"maker"}, vendor: {...}}
curl -sS -X POST $BASE/auth/otp/request -H 'Content-Type: application/json' -d '{"phone":"+919800000000"}'
# then, using the code from the [OTP STUB] log line:
curl -sS -X POST $BASE/auth/otp/verify -H 'Content-Type: application/json' \
  -d '{"phone":"+919800000000","code":"<code from log>"}'
# -> accessToken whose decoded payload carries role:"seller" + a real
# sellerId — the new account can now call every `/seller/*` route.
```

All of the above was run against the seeded local Postgres during this
milestone's build (real values: `businessName: "Kavya's Terracotta
Studio"`, phone `+919876500001`) and returned the exact shapes/status
codes described — including the negative cases (bad HMAC signature never
writes a `SnackOrder`; the `whatsapp` channel never gets a `Notification`
row when the preference is off).

## Project layout

```
server/
  docker-compose.yml       postgres:16 for local dev
  .env.example              every env var, annotated
  prisma/
    schema.prisma            every domain model — the Prisma mirror of client/lib/types
    migrations/               generated SQL migrations
    seed.ts                   ports client/lib/data/*.ts into Postgres
  src/
    main.ts                   bootstrap: helmet, CORS, global prefix, ValidationPipe
    app.module.ts              root module — global guards/filters wired here
    config/                    typed config + env validation
    prisma/                    PrismaService (the one PrismaClient instance)
    common/
      decorators/               @Public, @Roles, @CurrentUser
      guards/                   JwtAuthGuard, RolesGuard
      filters/                  AllExceptionsFilter (error envelope)
      scoping/                   ownership-scoping helpers for M8.1–M8.3
      types/                     JwtPayload / RequestUser
    health/                     /health, /health/db
    auth/                       register, login, OTP, social(stub), refresh, logout
    users/                      me, profile update, address CRUD
    catalog/                    products/vendors/categories/occasions/collections/hamper-boxes (M8.1, public reads)
    reviews/                    list + create (M8.1)
    wishlist/                   get/add/remove, owner-scoped (M8.1)
    cart/                       get/add/update/remove/assign-address/clear + hamper lines, owner-scoped (M8.1)
    orders/                     create (server-priced) + list + history + detail, owner-scoped (M8.1)
```

## Security measures in place (M8.0)

- Passwords hashed with **argon2** (`argon2.hash`/`argon2.verify`) — never
  stored or logged in plaintext.
- OTP codes are also argon2-hashed at rest, short-TTL, with a per-row
  attempt counter (`PhoneOtp.attempts`, capped at 5) on top of the global
  rate limiter.
- Refresh tokens are **rotating** and stored server-side only as a SHA-256
  hash (`RefreshToken.tokenHash`) — never the raw token. Reusing an
  already-rotated (revoked) refresh token is rejected outright, which is
  the reuse-detection signal a stolen/replayed token trips.
- Global `JwtAuthGuard` — every route requires a valid access token unless
  explicitly marked `@Public()`. `RolesGuard` layers `@Roles(...)`
  restriction on top.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform:
  true })` globally — unknown body fields are rejected, not silently
  dropped or passed through.
- `helmet()` + explicit CORS allow-list (`CLIENT_ORIGIN`, credentials-aware).
- `@nestjs/throttler` — a global default limit plus a tighter per-route
  override (`@Throttle`) on every `/auth/*` route.
- Consistent error envelope (`{ error: { code, message } }`) via a global
  exception filter — no stack traces or internal details leak to clients.
- All secrets come from env (`.env`, never committed); `env.validation.ts`
  fails fast on missing/placeholder secrets in production.
- `User.suspended` actually gates sign-in now (login/OTP/social/refresh all
  check it) — the M0–M11a frontend mock flag didn't have a real session to
  enforce against; this is the real-backend upgrade the frontend's own
  doc comment (`lib/types/shared.ts`) flags as still owed.
- **(M8.1)** Every price in the commerce API is computed server-side from
  `WeightOption.price`/`HamperBox.price` — DTOs carry no price field at
  all, so `forbidNonWhitelisted` rejects a client-submitted `price`
  outright (`400`) rather than the service having to ignore it. Order
  totals are snapshotted onto `OrderItem`/`Order` at creation so they
  never drift from a later catalog price change.
- **(M8.1)** Every cart/wishlist/order query is scoped to
  `req.user.userId` (never a route/body param); cross-account access
  attempts `404` rather than `403` (never confirms another account's
  resource exists) — see `docs/API.md`'s "Commerce (M8.1)" section for
  the full contract and `CartService.assertOwnedItem` for the pattern.
- **(M8.1)** Stock is checked, then re-checked + decremented atomically
  inside the order-creation `$transaction`
  (`WeightOption.updateMany({where:{stock:{gte:qty}}})`) — closes the
  race two concurrent requests could otherwise both pass a plain
  pre-check through.
- **(M9)** The WhatsApp Cloud API webhook (`POST /whatsapp/webhook`)
  verifies `X-Hub-Signature-256` (HMAC-SHA256 over the **raw** body,
  keyed with `WHATSAPP_APP_SECRET`, constant-time compare) before
  parsing or acting on anything — same pattern as the Razorpay webhook
  above, mirrored in `whatsapp/whatsapp-signature.util.ts`. An invalid
  signature is rejected `400` with zero state change (no `SnackOrder`
  written). All 3 new outbound providers (WhatsApp, SMS, email) are
  env-gated: placeholder credentials degrade to an **obviously-labeled**
  logged stub (`[WHATSAPP STUB]`/`[SMS STUB]`/`[EMAIL STUB]`) rather than
  a silent pretend-success — see `docs/ARCHITECTURE.md`'s messaging/
  notification-flow section.
- **(M9)** `POST /seller-applications` is `@Public()` but throttled
  tighter than the app-wide default (`{ limit: 5, ttl: 60_000 }`, same as
  `AuthController`'s abuse-worth routes) and fully DTO-validated
  (`CreateSellerApplicationDto`) — an unauthenticated public form is the
  one surface here worth extra rate-limit scrutiny.

## Seams for later milestones

- **M8.1 (commerce) — done.** Catalog (public reads: products w/ filter/
  sort/pagination, vendors/storefronts, categories, occasions,
  collections, hamper boxes), reviews (create + list, verified-purchase
  check), wishlist, cart (product-or-hamper polymorphic lines, server-
  computed totals) and orders (server-authoritative pricing, price-
  snapshotting, multi-address shipments, gift-to-recipient) are real —
  see `docs/API.md`'s "Commerce (M8.1)" section for the full contract.
  `OrderStatus` gained a `pending_payment` (`"pending-payment"` on the
  wire) value for the M8.2 seam below — a new migration, additive only.
- **M8.2 (wallet/Razorpay) — done.** The wallet ledger is
  server-authoritative: every balance mutation computes `balanceAfter`
  inside the same row-locked DB transaction that writes `Wallet.balance`
  (`WalletService.postLedgerEntryTx`), supports `Idempotency-Key` for
  retry safety, and the Razorpay webhook (HMAC-verified) is the only
  thing that ever transitions `pending_payment` → `placed` / credits a
  verified top-up — see `docs/API.md`'s "Wallet & Payments (M8.2)"
  section.
- **M8.3a (services) — done.** Laundry (services/availability + owner-
  scoped bookings/subscriptions, wallet-pay via the M8.2 ledger), snacks
  (public menu read — ordering stays WhatsApp-only per `lib/channel.ts`),
  referrals/loyalty, notifications, support tickets, corporate inquiries
  — see `docs/API.md`'s "Services (M8.3a)" section.
- **M8.3b (seller portal) — done.** Owner-scoped endpoints for all 3
  seller types (maker listings/orders/storefront/reviews, laundry-partner
  bookings, snack-seller menu/orders) + payouts, `@Roles('seller')`, every
  query re-deriving `sellerId` from the verified JWT (never a
  client-supplied id) — see `docs/API.md`'s "Seller portal (M8.3b)"
  section.
- **M8.3c (admin panel) — done.** The unscoped counterpart to M8.3b:
  dashboard/analytics, user + seller directory (suspend, onboarding
  approval queue), catalog/review moderation, unified orders oversight +
  refunds, wallet oversight, collections CMS, all `@Roles('admin')` and
  all mutation-audited via the new `AdminAuditLog` table
  (`GET /admin/audit`) — see `docs/API.md`'s "Admin panel (M8.3c)"
  section. `src/common/scoping/ownership.util.ts`'s `assertAdmin` names
  the intentionally-unscoped read pattern every query in
  `src/admin/**` follows. This completes the 3-role
  (`consumer`/`seller`/`admin`) backend API surface.
- **M8.4 (client swap)** — `client/lib/api/*` function bodies swap from
  mock reads to real `fetch()` calls against this API; call sites in
  `client/` don't change (see `docs/API.md`).
- **M9 (WhatsApp/notifications) — done.** WhatsApp Cloud API (`src/whatsapp/`
  — outbound status sends for snack orders, the HMAC-verified inbound
  webhook creating/updating `SnackOrder` rows), real per-preference
  notification delivery (`src/notifications/notifications-delivery.service.ts`
  fanning out to SMS/WhatsApp/email provider stubs, `src/notifications/
  providers/`), the OTP sender wired to the same SMS provider, and the
  public `POST /seller-applications` create endpoint closing the `/sell`
  → admin-approve → seller-active loop end-to-end — see `docs/API.md`'s
  "WhatsApp & inbound webhook (M9)" / "Notification delivery (M9)" /
  "Seller applications (M9)" sections and the curl walkthrough above.
  Every provider is env-gated: real credentials -> real send, placeholders
  (the `.env.example` defaults) -> an obviously-labeled logged stub — see
  "Needs real credentials" below for exactly what to supply to go live.
- **This completes the planned milestone list (M0–M9)** — every module in
  the plan (`~/.claude/plans/read-the-handoff-i-jolly-hennessy.md`) is now
  either real or a clearly-labeled, real-code-path stub waiting only on
  credentials.

## Needs real credentials before going further than local dev

- `DATABASE_URL` — a real managed Postgres instance for staging/prod.
- `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — real random secrets, not the
  `.env.example` placeholders.
- Real Google/Apple OAuth app credentials to replace `/auth/social/:provider`'s
  stub (currently trusts a client-submitted profile payload instead of
  verifying a provider token — see `SocialLoginDto`'s doc comment).
- `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` — real
  test-mode (then live-mode) keys, wired in M8.2.
- **To go fully live on M9's integrations** (see `.env.example` for the
  full annotated list + where to get each one):
  - **Meta WhatsApp Cloud API** — a Meta Business app with the WhatsApp
    product added, a permanent System User access token
    (`WHATSAPP_TOKEN`), the app's Phone Number ID
    (`WHATSAPP_PHONE_NUMBER_ID`), a webhook verify token you choose
    yourself (`WHATSAPP_VERIFY_TOKEN`, entered into the Meta App
    Dashboard's webhook subscription form), the App Secret for HMAC
    verification (`WHATSAPP_APP_SECRET`), and — for sends outside the 24h
    customer-service window — an approved Message Template name
    (`WHATSAPP_STATUS_TEMPLATE`).
  - **SMS (Twilio-shaped)** — a Twilio account (or MSG91/any REST SMS
    provider, swapped behind `SmsProviderService`), its Account SID
    (`TWILIO_ACCOUNT_SID`) + Auth Token (`TWILIO_AUTH_TOKEN`) from the
    console dashboard, and a purchased/verified sending number
    (`TWILIO_FROM_NUMBER`). This also goes live for OTP delivery — no
    separate OTP credential needed.
  - **Email (SendGrid-shaped)** — a SendGrid account, a "Mail Send"-scoped
    API key (`SENDGRID_API_KEY`), and a verified sending domain for
    `EMAIL_FROM` (SendGrid's Sender Authentication).
