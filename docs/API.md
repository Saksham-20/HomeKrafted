# API contract

Through M0–M7 "the API" was `lib/api/` — typed, `async` functions that
resolve mock data from `lib/data/`. **M8.0 stands up the real backend**
(`server/`, NestJS + Prisma + Postgres) that this contract describes —
auth + users/addresses are real endpoints today. **M8.1 adds commerce**:
catalog browse (products/vendors/categories/occasions/collections),
reviews, wishlist, cart and orders are real endpoints as of this
milestone too — see "Commerce (M8.1)" below for the full contract. Wallet/
Razorpay payment capture (M8.2) is real — see "Wallet & Payments (M8.2)".
**M8.3a adds services**: laundry (services/availability + owner-scoped
bookings/subscriptions), snacks (public menu read), referrals/loyalty,
notifications, support tickets and corporate inquiries are real endpoints
as of this milestone — see "Services (M8.3a)" below. **M8.3b adds the
seller portal**: owner-scoped endpoints for all 3 seller types (maker
listings/orders/storefront/reviews, laundry-partner bookings, snack-seller
menu/orders) plus payouts, gated by `@Roles('seller')` and per-request
ownership re-derived from the JWT — see "Seller portal (M8.3b)" below.
**M8.3c adds the admin panel**: unscoped dashboard/analytics, user +
seller directory (suspend, onboarding approval queue), catalog/review
moderation, unified orders oversight + refunds, wallet oversight,
collections CMS, and an audit log every admin mutation writes to — gated
`@Roles('admin')` — see "Admin panel (M8.3c)" below. This completes the
full consumer/seller/admin backend API surface. WhatsApp/notification
delivery (M9) is still to come. The `client/lib/api` mock→real swap
itself (pointing `fetch()` calls at `server/`) is **M8.4** — no calling
component in `client/` changes shape, only what the function body does.

## Conventions

- Base path: **`/api/v1`** (set via `app.setGlobalPrefix('api/v1', ...)`
  in `server/src/main.ts`). `/health` and `/health/db` are the only
  unprefixed routes (liveness/readiness checks).
- Auth: **JWT** — a short-lived access token (`Authorization: Bearer
  <token>`) plus a longer-lived, rotating refresh token. See "Auth model"
  below. Unauthenticated requests to any non-`@Public()` endpoint return
  `401`; wrong-role requests to a `@Roles(...)`-guarded endpoint return
  `403`.
- Errors: `{ error: { code: string, message: string } }` with a matching
  HTTP status (`400` validation, `401` auth, `403` forbidden, `404` not
  found, `409` conflict, `429` rate-limited, `500` server) — implemented
  by `server/src/common/filters/all-exceptions.filter.ts`, applied
  globally. `code` is a stable machine-readable string (e.g.
  `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`).
- **Boolean request fields accept only `true`, `false`, `"true"` and
  `"false"`** — anything else is a `400`. The global `ValidationPipe`
  runs with `enableImplicitConversion` (query DTOs need it, so `?days=30`
  arrives as a number), and for a `Boolean` field that conversion is
  `Boolean(value)` — under which `"false"` is `true`. Every non-empty
  string therefore used to set a flag to **true** and return `200`,
  including on the verification badge and wallet auto-top-up. Fixed in
  M17 by `@BooleanField()`
  (`server/src/common/decorators/boolean-field.decorator.ts`), which is
  now the only correct way to declare one. `"yes"` and `"1"` are rejected
  rather than guessed at.
- Mutations (top-up, place order, create booking, send snack list) are
  `POST`; the wallet ledger is server-authoritative — the client never
  computes or sends `balanceAfter`.
- Pagination (products, orders): `?page=&pageSize=` query params, response
  shape `{ items: T[], page, pageSize, total }` once real data volume
  needs it — M0's mock lists are small enough to return whole.
- Rate limiting: a global default limit (`THROTTLE_LIMIT`/
  `THROTTLE_TTL_SECONDS`, `.env.example`) via `@nestjs/throttler`, with a
  tighter override on every `/auth/*` route (`@Throttle`) — verified in
  M8.0 to actually return `429` after repeated `/auth/login` attempts.

## Auth model (M8.0 — real, implemented in `server/src/auth/`)

Four sign-in flows, all converging on the same JWT session shape:

- **One identifier + password (M25)** — `POST /auth/continue`, body
  `{ identifier, password, name?, referredByCode? }`. This is what the web
  form uses; `register`/`login` below are unchanged and still serve the
  native clients. `identifier` is a mobile number **or** an email address
  and is parsed server-side (`identifier.util.ts`, India-default region,
  so a bare `9845012345` works); a number is normalised to E.164 and an
  address is lowercased, so one person cannot become two accounts by
  typing it differently.

  It signs in or signs up, and **the status is how the caller tells the
  outcomes apart** — the error envelope derives `code` from the status
  alone, so message text is not a contract:

  | Status | Meaning | What the form does |
  |---|---|---|
  | `200` | Signed in, or signed up. Body adds `created: boolean` and `kind: "email" \| "phone"`. | Redirect, or show the confirm-code step when `created`. |
  | `400` starting `NAME_REQUIRED` | The identifier is new and no `name` was sent. | Reveal the name field, resubmit. |
  | `401` | Wrong password. | Say so. |
  | `409` | The account exists but **has no password at all**. | Offer the code route. |

  The `409` is the one that matters. An approved HomeKrafter's account is
  minted without a credential, so answering `401` would tell every real
  kitchen their password is wrong for a password that never existed —
  see `CLAUDE.md`'s "Auth & identity (M17)". It does confirm the account
  exists, which is accepted knowingly: the alternative is a supply-side
  lockout. Guarded by `test/e2e/auth-continue.e2e-spec.ts`.
- **Email + password** — `POST /auth/register`, `POST /auth/login`.
  Passwords hashed with **argon2**. `register` takes an optional
  `referredByCode`, and **as of the 2026-08-07 audit it actually does
  something with it**: a matching code creates a `Referral` row
  (`status: joined`) inside the signup transaction. Before that the code
  was stored on `User.referredByCode` and *never read by anything* — no
  path in the server created a `Referral`, so every row on
  `/account/referrals` came from the seed and a real invite could never
  appear. An unknown code is ignored silently rather than failing the
  signup or reporting a miss (that would make registration an oracle over
  the code space); referring yourself is refused, which is reachable
  because codes are derived from the first name and the lookup runs after
  the row is inserted.
- **One-time code, by SMS or email** — `POST /auth/otp/request`,
  `POST /auth/otp/verify` (creates the account on first verify if none
  exists for that identifier). Codes are argon2-hashed at rest, short-TTL
  (`OTP_TTL_SECONDS`), with a per-attempt counter.

  Both take `{ identifier }` as of M25 — a number **or** an address — and
  the server picks the channel: `SmsProviderService` (Twilio-shaped) or
  `EmailProviderService` (SendGrid-shaped). Real credentials send a real
  message; placeholders degrade to a logged `[SMS STUB]`/`[OTP STUB]`
  pair so dev login keeps working. The pre-M25 `{ phone }` field is
  **still accepted** — the native apps send it, and narrowing a shipped
  request value breaks a client that cannot be redeployed.

  A successful verify also stamps `User.emailVerified` /
  `User.phoneVerified`. Those are records, **not gates**: nothing checks
  them before letting an account act, because delivery needs provider
  keys that are not set (`docs/LAUNCH-READINESS.md`), and gating on an
  undeliverable code would block every real sign-up.

  This remains a **first-class way in**, not merely a verification step.
  It is the only door an approved HomeKrafter has until they set a
  password.

  **Test bypass (M18).** `OTP_TEST_CODE` verifies without an SMS, but
  *only* for a number listed in `OTP_TEST_PHONES`, and never for an admin
  account. Both env vars must be set or the bypass does not exist. The
  scoping is the whole safety property: `otp/verify` creates an account
  for an unrecognised number, so an unscoped fixed code would be a
  complete authentication bypass. Guarded by
  `test/e2e/otp-bypass.e2e-spec.ts`.
- **Password reset (M18)** — `POST /auth/password/forgot` (body
  `{ email }`) and `POST /auth/password/reset` (body `{ token, password }`).
  Forgot **always returns 200 with the same body**, hit or miss: a
  different answer would make it an account-existence oracle. The emailed
  token is 32 random bytes, stored SHA-256-hashed, single-use, and valid
  for 60 minutes; requesting a second link consumes the first. A
  successful reset adds `email` to `authProviders` (the path a
  password-less approved HomeKrafter uses to gain one) and **revokes every
  refresh token** for the account. Suspended accounts get neither a link
  nor a reset. `SITE_URL` builds the link. Guarded by
  `test/e2e/password-reset.e2e-spec.ts`.
- **Password change (M32)** — `POST /auth/password/change`, body
  `{ currentPassword, newPassword }`. **Authenticated**, unlike the two
  above: it proves identity with a session *plus* the current password.
  Refuses a new password equal to the old one (400), which would
  otherwise clear the forced-rotation flag while leaving the admin's copy
  working. Revokes **every** existing session and returns a fresh
  `AuthResult`, so the caller swaps tokens rather than being signed out.
  Clears `mustChangePassword` and stamps `credentialsClaimedAt` (M37:
  there is no stored plaintext left to clear — only the hash exists).
  Guarded by `test/e2e/temp-password.e2e-spec.ts`.
- **Forced password change (M32)** — when `User.mustChangePassword` is
  set, `JwtAuthGuard` answers **403 `PASSWORD_CHANGE_REQUIRED`** on every
  authenticated route except `POST /auth/password/change` and
  `GET /users/me`. `PublicUser` carries `mustChangePassword` so a client
  can route to `/set-password`, but the server does not rely on it doing
  so. Set only by `POST /admin/sellers/:id/temp-password`; cleared by a
  password change *or* by using the emailed reset link.
- **Social** — `POST /auth/social/:provider` (`provider` =
  `google`\|`apple`). Body is `{ idToken, nonce?, name? }`.

  **`providerAccountId` and `email` are no longer accepted, and sending
  them is a 400 (M27).** Until then this endpoint trusted a posted email
  and issued a session for whatever account matched — the admin included.
  Identity now comes only from the verified token payload
  (`SocialTokenVerifier`): signature checked against the provider's
  published JWKS, `iss`/`aud` enforced, `aud` matched against a list
  (Google issues one client id per platform and this API is shared with
  the native apps), `nonce` compared when supplied. The old fields were
  *deleted* from the DTO rather than ignored, so `forbidNonWhitelisted`
  refuses them structurally.

  Statuses: **401** for a token that is invalid, expired, wrong-audience,
  wrong-issuer, replayed, or Google-unverified-email; **403** for an admin
  account (same rule as the OTP test-code bypass) or a suspended one;
  **503** when the provider is unconfigured, its JWKS is unreachable, or
  the key id is unknown — that last one because a rotation and a forgery
  look identical, and the tie goes to the real user. Pinned by
  `test/e2e/social-login.e2e-spec.ts`.

  Linking rule: a provider-verified email links to an existing account
  **only if that account is already `emailVerified`**. Otherwise the
  sign-in *seizes* it — every refresh token revoked and `passwordHash`
  cleared — because `register` never sets `emailVerified`, so an
  unverified match may be somebody who pre-registered the victim's
  address and is waiting for exactly this.
- **`GET /auth/social/config`** — `{ google: { enabled, clientId },
  apple: { … } }`. Public, and deliberately *not* under the tighter auth
  throttle: the sign-in page reads it on every render and that budget is
  per-IP, so an office behind one NAT would exhaust it and the only
  symptom would be sign-in buttons that sometimes are not there. The
  client id is served here rather than duplicated into a `NEXT_PUBLIC_*`
  build inline, so server and browser cannot disagree. Read server-side
  by `app/login/page.tsx`.

All three return the same shape:

```jsonc
// 200/201
{
  "accessToken": "<JWT, short TTL — JWT_ACCESS_TTL, default 15m>",
  "refreshToken": "<JWT, longer TTL — JWT_REFRESH_TTL, default 7d>",
  "user": { "id", "name", "email", "phone", "role", "referralCode", "createdAt", "suspended" }
}
```

- `POST /auth/refresh` — `{ refreshToken }` → new `{ accessToken,
  refreshToken }`. **Rotating**: the presented refresh token is revoked
  and replaced in the same operation; presenting an already-used
  (revoked) refresh token is rejected with `401` — the reuse-detection
  signal a stolen/replayed token trips. Refresh tokens are stored
  server-side only as a SHA-256 hash (`RefreshToken.tokenHash`), never
  the raw token.
- `POST /auth/logout` — `{ refreshToken }` → `204`, revokes that refresh
  token.
- JWT payload: `{ sub: userId, role, sellerId? }` — `sellerId` only
  present for `role: "seller"` accounts (resolved server-side from the
  `Seller` table at token-issue time, never trusted from the client).

### RBAC

- `@Public()` — opts a route out of the global `JwtAuthGuard` (register,
  login, OTP request/verify, social login, refresh, logout, `/health*`).
  Every other route requires a valid, unexpired access token.
- `@Roles('admin')` / `@Roles('seller', 'admin')` — layered on top via
  `RolesGuard`; a route with no `@Roles(...)` allows any authenticated
  role through. Wrong role → `403 FORBIDDEN`.
- Ownership scoping (M8.1–M8.3 seam): `server/src/common/scoping/ownership.util.ts`
  exports `assertOwnUserScope`/`assertOwnSellerScope`/`assertAdmin` — every
  seller/consumer-scoped query in later milestones re-derives its scoping
  id from the verified `@CurrentUser()`, never from a client-submitted
  `vendorId`/`sellerId`/`userId`.

## Users & addresses (M8.0 — real, `server/src/users/`)

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /users/me` | any authed role | `PublicUser` |
| `PATCH /users/me` | any authed role | updated `PublicUser` |
| `GET /users/me/addresses` | any authed role | `Address[]`, own addresses only |
| `POST /users/me/addresses` | any authed role | created `Address` |
| `PATCH /users/me/addresses/:id` | any authed role, own address only (404 otherwise) | updated `Address` |
| `DELETE /users/me/addresses/:id` | any authed role, own address only | `204` |
| `POST /users/me/addresses/:id/default` | any authed role, own address only | `Address` with `isDefault: true` |

**`phone` and `pincode` are validated as of the 2026-08-07 audit**, on
create and (via `PartialType`) on edit. Before that they were "a non-empty
string" and nothing more: `phone: "not-a-phone"` with `pincode: "ABCDEF"`
was accepted, stored, listed in the address book and shippable at
checkout. The cost of that lands on the HomeKrafter — a delivery is routed
by pincode and rescued by phone, so a malformed pair is a home cook who
has cooked the food, set out to deliver it, and cannot find or call the
buyer. `phone` uses `@IsPhoneNumber('IN')` rather than the region-less
form, which demands strict E.164 and would have rejected a plain
`9845012345`; `pincode` is `/^[1-9][0-9]{5}$/` — a format check, not a
lookup against codes we serve, since coverage is a delivery-radius
question decided elsewhere. See `addresses.e2e-spec.ts`.

`PATCH /users/me` validates `phone` the same way, for the same reason.
| `GET /users/:id` | **`admin` only** | any user's `PublicUser` — exists specifically to prove `RolesGuard` end to end against a real resource (see `UsersController`'s doc comment); a fuller admin user-management surface is M8.3/M11 scope |

## Uploads (M13 — real, `server/src/uploads/`)

| Endpoint | Auth | Returns |
|---|---|---|
| `POST /uploads?purpose=…` | any authed role | `{ url, key, bytes, mime }` |

`multipart/form-data` with the image in a `file` field. `purpose` is
required and must be one of `listing` \| `menu` \| `storefront` \|
`application` \| `laundry` — it picks the folder, and a value outside that
set is a `400` rather than a path.

Deliberately **not** role-gated: buyers upload dry-clean photos as well as
HomeKrafters uploading product shots, so authorization is "a valid
session", and `purpose` plus the caller's own id (never a body param)
decide where the bytes land.

**Every accepted upload is re-encoded before it is stored (M25).** The
bytes that land on disk are never the bytes that arrived: they go through
`image-pipeline.ts` (sharp/libvips), which

1. **strips all metadata** — a phone photo taken in a home kitchen carries
   EXIF GPS, so before this a HomeKrafter's public listing photo published
   their home address to anyone who ran `exiftool` on the URL;
2. bakes the EXIF orientation into the pixels first, so portrait photos
   are not stored sideways once the tag is dropped;
3. caps the longest edge at **2000px** and re-encodes to **WebP q82** —
   typically a tenth of the bytes of a straight-from-phone JPEG;
4. refuses **decompression bombs** via `limitInputPixels` (~90MP). A byte
   limit never caught these; the whole trick is that the file is small.

So the stored object is always `image/webp` with a `.webp` extension
whatever was uploaded, and `bytes` in the response is the *compressed*
size. WebP rather than AVIF deliberately: AVIF encode costs seconds of CPU
per image and this runs inline on a 1 vCPU box.

**`url` is the value to persist**, not `key`. It's relative
(`/uploads/listing/<sellerId>/<uuid>.webp`) while storage is local disk,
and would be absolute behind a CDN driver — a stored `url` keeps resolving
either way, which is what makes swapping drivers a config change rather
than a data migration. `key` is only needed to delete an object later.

Rejections:

| Status | `code` | When |
|---|---|---|
| `400` | `BAD_REQUEST` | missing/unknown `purpose`, or no file |
| `401` | `UNAUTHORIZED` | no session |
| `413` | `FILE_TOO_LARGE` | over `UPLOAD_MAX_BYTES` (default **12MB** since M25 — nothing that size is stored, so the limit is an abuse ceiling, not a storage budget) |
| `415` | `UNSUPPORTED_IMAGE` | bytes aren't a JPEG, PNG, WebP or AVIF — **or** they pass the sniff but will not decode (truncated, corrupt, or a bomb) |
| `429` | `RATE_LIMITED` | over `THROTTLE_UPLOAD_LIMIT` (default 30/min) |

The accepted type is decided by **sniffing the leading bytes**, not the
multipart `Content-Type` or the filename — both are caller-supplied. SVG
is rejected on purpose: it is XML that can carry script, and it would be
served from our own origin. Stored filenames are UUIDs; the client's
filename is never used for anything.

Reads don't go through the API — nginx serves `/uploads/` straight from
disk with `X-Content-Type-Options: nosniff` and a sandboxing CSP. See
`docs/DEPLOY.md`.

## Commerce (M8.1 — real, `server/src/{catalog,reviews,wishlist,cart,orders}/`)

Catalog browse is public (`@Public()`, per `lib/channel.ts`'s Marketplace
row — "Browse web: yes"); reviews/wishlist/cart/orders are owner-scoped
(`@CurrentUser()` resolves `userId` from the verified JWT, never a route/
body param — same rule as "Ownership scoping" above). Every price is
computed server-side from `WeightOption.price`/`HamperBox.price` — no
endpoint here ever trusts a client-submitted amount; `ValidationPipe`'s
`forbidNonWhitelisted: true` rejects a request body carrying an extra
`price` field outright (`400 VALIDATION_ERROR`) rather than silently
dropping it.

### Products & catalog

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /products` | public | Query params: `q` (free-text, see below), `category`, `occasion`, `vendor` (comma-separated **slugs**, OR-matched within each param, AND across params — mirrors `ShopClient.tsx`'s filter semantics), `dietary` (comma-separated **frontend** tags, e.g. `vegetarian,gluten-free`), `featured` (`true`/`false`), `isHamper` (`true`/`false`, **M18** — ready-made gift hampers; three states, since omitting it returns both and a hamper is an ordinary listing that still appears in `/shop`), `minPrice`/`maxPrice` (compared against the `defaultWeightSku`'s price — same basis `ShopClient`'s local `priceOf()` uses), `kind` (`food` \| `craft`, **M20** — omitted returns both, since the split is a browse convenience and a search for "candle" should find one either way), `sort` (`most-loved` default \| `price-asc` \| `price-desc` \| `nearest`, which needs `lat`/`lng`), `page`/`pageSize` (default 20, max 100). Returns `{ items: Product[], page, pageSize, total }`. Lists only `PUBLICLY_LISTED` statuses (**M22** — an allowlist, not `{ not: "hidden" }`; see `server/src/catalog/moderation.ts`). Ordering breaks ties on `id`, so paging cannot show a row twice or skip one. |
**M20 — `lat`/`lng` no longer filter every listing.** A `Product` now
carries `shippingScope`: `local` rows are gated on
`distanceKm <= Vendor.deliveryRadiusKm` exactly as before, and `national`
rows **skip the radius gate entirely** and are returned with or without
buyer coordinates. Distance still rides along for display where it means
something, but for a nationally-posted item it never excludes. A client
that assumed "coords supplied ⇒ everything returned is within the radius"
must stop assuming it. Every response also carries `kind`
(`food | craft`), which decides whether food-only fields like `shelfLife`
and `dietary` are meaningful at all.

| `GET /products/:slug` | public | No `hidden` filter — a direct-link/cart/order/wishlist resolve must still work, matching `lib/api/products.ts#getProduct`'s doc comment. `404` if no product has that slug. |
| `GET /vendors` | public | `Vendor[]`. Optional `?q=` searches the HomeKrafter's name, bio and area — same term semantics as `GET /products?q=`. **M36: `lat`/`lng` are rounded to 2dp (~1.1 km) on every public payload** — see the note below. |
| `GET /vendors/:slug` | public | `Vendor`; `404` if not found. `isFollowing` is always `undefined` here — this route is `@Public()`, so the global guard attaches no session and there is nobody to answer "am *I* following this" for. Use `GET /vendors/:slug/follow`. |
| `GET /vendors/:slug/products` | public | `Product[]`, excludes `hidden` — same rule `lib/api/products.ts#getProductsByVendor` applies |
| `GET /vendors/:slug/availability` | public | **M16 (M2).** `{ vendorId, prepTimeMins, workingDays[], blackouts[{date, reason?}], capacityPerDay? }` — what the pre-order picker needs to stop offering slots a kitchen can't cook. Public, because the picker runs before anyone signs in. Only blackouts **from today forward**; a past one is history and shipping it would grow the payload every year the kitchen stays open. `prepTimeMins` falls back to the platform's 90 when undeclared — never to zero, which would read as "instant". |
| `GET /vendors/:slug/profile` | public | **M16.** The rich HomeKrafter profile — story, kitchen photos, hours, prep time, policies, plus computed `trust`, `achievements` and `stats`. Split from `GET /vendors/:slug` because that route answers every product card and every follow check and none of them need a return policy. Returns a fully-shaped **empty** profile for a kitchen that has filled in nothing, so the storefront never branches on absence; `404` only when the vendor itself is gone. **Never includes `fssaiNumber`** — see below. |
| `GET /vendors/following` | any authed role | Storefronts the caller follows, newest follow first, each with `isFollowing: true`. **Declared above `:slug`** — Nest matches in declaration order, and the reverse would read `following` as a vendor slug. |

**M36 — public coordinates are rounded, and the raw column is not.**
`mapVendor` emits `lat`/`lng` at `PUBLIC_COORD_DP` (2 decimals, ~1.1 km)
unless the caller passes `{ preciseLocation: true }`. Only two do: the
admin approve response, which carries the `placement` warning telling the
operator to correct the pin, and `GET /seller/storefront`, where a
HomeKrafter is reading their own record.

The reason is the pickup-address promise. `/sell` asks a home cook for
their home address under an explicit on-form promise that buyers see only
their area, and four decimals of latitude is that address by another
route. It was moot while every vendor sat on one of 21 curated *area*
centroids; M36 seeds coordinates from a pincode and adds `PATCH
/admin/sellers/:id/coords` so an operator can set the exact spot — which
is when the payload would start carrying it. Rounding costs the buyer
nothing: radius filtering runs server-side against the unrounded column,
and no client code computes a distance from the response. Pinned by
`server/test/unit/vendor-privacy.spec.ts`.
| `GET /vendors/:slug/follow` | any authed role | `{ following, followerCount }` for this caller. |
| `POST /vendors/:slug/follow` | any authed role | Follows. Idempotent — a second press is the same state, not a `409`. Returns `{ following: true, followerCount }`. |
| `DELETE /vendors/:slug/follow` | any authed role | Unfollows. Returns `{ following: false, followerCount }`. |

**Follows (M15).** `VendorFollow` had sat in the schema since M8.1 with no
endpoint behind it — `FollowButton` was local `useState` and
`Vendor.followerCount` a seeded decoration. `followerCount` is now
**counted from the rows** after every follow/unfollow, for the same
reason review aggregates are: an incremented counter drifts and nothing
notices. The seed stopped writing invented follower numbers in the same
change, so a real follow doesn't collapse a fictional 612 to 1.

**HomeKrafter profiles (M16).** `VendorProfile` is a 1:1 optional table,
not columns on `Vendor`, because `Vendor` is read by every product card
and every distance filter. Three things it returns are **computed on
read, never stored** (`VendorProfileService`):

- `trust` — `{ score, tier, signals[] }`. Signals are the three admin
  verifications plus counted facts: review aggregate, delivered-order
  count, tenure, cancellation rate. Unearned signals are returned too,
  with their real detail line, because the seller portal renders the same
  list as a checklist.
- `achievements` — derived badges (`250+ orders`, `Top rated`, `2 years
  on Homekrafted`). Every one restates a fact visible elsewhere on the
  page; none is awarded, and none survives the behaviour that earned it.
- `stats` — `cancellationRate` is `null`, not `0`, until something has
  closed. An unknown rate is not a perfect one.

A stored trust score is a number with no owner that stops being true the
first time a kitchen's behaviour changes — the same reasoning that made
M15 recompute rating aggregates instead of incrementing them.
| `GET /categories`, `GET /categories/:slug` | public | `Category[]` / `Category` |
| `GET /occasions`, `GET /occasions/:slug` | public | `Occasion[]` / `Occasion`. **M16** adds `celebratedOn?`, `tagline?`, `imageSrc?` — see the occasion-hub note below. |
| `GET /collections`, `GET /collections/:slug` | public | `Collection[]` / `Collection` — `productIds` ordered by `CollectionProduct.sortOrder`. **M16** adds `imageSrc?`, `featured`, `sortOrder`; the list is ordered by `sortOrder` then `title` (title, not id, so two guides at the same position don't swap between requests). |

**Occasion hub + gift guides (M16, H8).** `Occasion` and `Collection`
both existed from M2, but the only way to reach either was to already
know an occasion's slug — the home page's "View all" pointed at `/shop`,
and a `Collection` with no occasion attached had no page at all. M16 adds
`/collections` (the hub) and `/guides/[slug]` (a guide's own page).

`Occasion.celebratedOn` is an **absolute date an admin sets, not a
recurrence rule**. Diwali, Raksha Bandhan and Karwa Chauth are lunisolar
and land on a different Gregorian date every year, so a stored `MM-DD` or
a "repeats yearly" flag would be wrong for exactly the occasions this
feature exists to sell into. Somebody rolls them forward annually via
`PATCH /admin/collections/occasions/:id`. `null` means **evergreen** — a
birthday has no season, and the hub lists those separately rather than
sorting them into a countdown they don't have.

The countdown itself is never computed by the API. `client/lib/occasions.ts`
takes `now` as an argument and never reads `new Date()` internally, so a
Server Component computes it once and ships text; nothing recomputes it
during hydration (CLAUDE.md's React #418 rule). `/` and `/collections`
carry `revalidate = 3600` so a static prerender can't freeze a countdown
at build time.

### Reviews

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /reviews?targetType=&targetId=` | public | `targetType`: `product`\|`vendor`\|`service`. Excludes `hidden: true` — same rule `lib/api/reviews.ts` applies. **M37:** `userId` is gone from every review payload — a stable account id on a public route let anybody cross-reference every review one buyer wrote; `userName` remains the public fact. |
| `POST /reviews` | any authed role | **Throttled 5/min per IP (M37, `THROTTLE_REVIEWS_LIMIT`)** — the delivered-order gate blocks strangers; this blocks a scripted burst from an account with real deliveries. Body: `{ targetType, targetId, rating (1–5), title?, body }`. Server sets `userId`/`userName` from the session. **Requires a delivered purchase (M15):** `403` unless the caller has a `delivered` `Order` containing that product (for a vendor review, any product from that vendor; for `targetType: "service"`, a `delivered` `LaundryBooking` for that `LaundryService`). `409` on a second review of the same target by the same user — `Review` is unique on `(userId, targetType, targetId)`. `404` if `targetId` doesn't resolve. On success the target's denormalised `rating`/`reviewCount` are **recomputed in the same transaction** (`ReviewAggregatesService`), for the product, its vendor and that vendor's `Seller` row. |
| `GET /reviews/mine` | any authed role | The caller's own reviews, newest first, **including `hidden: true` ones** — a moderated review has to stay visible to its author. |
| `GET /reviews/mine/pending` | any authed role | Delivered-but-unreviewed products: `{ targetType, targetId, name, slug, vendorName, imageSrc?, imagePlaceholder }[]`. Powers `/account/reviews`'s "waiting for your review" list. |

**Why delivered-only.** Before M15 the rule was "anyone signed in", with
`verifiedPurchase` recorded as a badge — but no submission UI existed, so
the endpoint had never been exercised. Opening a write endpoint on a
marketplace built on trusting a stranger's home kitchen, with no purchase
requirement, is a review-bombing surface aimed at the newest HomeKrafter.
`verifiedPurchase` stays on the model: seeded rows predate the rule, and
a moderator correction needs somewhere truthful to live.

**Ratings are recomputed, never incremented.** `PATCH
/admin/catalog/reviews/:id/moderate` calls the same recompute, because a
hide that leaves the average untouched is a moderator action silently not
taking effect. A vendor's rating spans direct storefront reviews *and*
every review of anything they make — both are "what people think of this
kitchen".

### Wishlist (owner-scoped)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /wishlist` | any authed role | Lazily creates an empty `Wishlist` row on first read (mirrors the mock `WishlistContext` starting empty). Returns `{ id, userId, items: [{productId, addedAt}] }`. |
| `POST /wishlist/items` | any authed role | Body `{ productId }`. Idempotent (upsert on the `wishlistId`+`productId` unique constraint) — adding twice is a no-op, not a duplicate row. `404` if the product doesn't exist. |
| `DELETE /wishlist/items/:productId` | any authed role | `204`, idempotent (removing an absent item is not an error). |

### Cart (owner-scoped)

`Cart` is 1:1 per user (`userId @unique`) — there's no cart id to guess,
`GET /cart` always resolves the caller's own. Every item-level mutation
additionally re-checks the parent cart's `userId` before touching a row
(`CartService.assertOwnedItem`) — operating on another account's
`CartItem` id `404`s rather than `403`ing (never confirms the id exists).

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /cart` | any authed role | Lazily creates an empty cart. Returns `{ id, userId, updatedAt, items: CartLineDto[], count, subtotal, shippingFee, total, cashbackEstimate }` — richer than the frontend `Cart` type, see "Response-shape notes for M8.4" below. Every `items[]` entry is resolved fresh via `resolveCartLine` (name/unitPrice/lineTotal/weightLabel/maxQuantity/isHamper) — `CartItem` itself only stores `productId`+`sku`/`hamperId`+`quantity`, no price. |
| `POST /cart/items` | any authed role | Body `{ productId, sku, quantity? }` (default 1). Adds, or increments an existing `productId`+`sku` line — mirrors `CartContext.addItem`. `400` if the resulting quantity would exceed `WeightOption.stock`. |
| `POST /cart/hamper-items` | any authed role | Body `{ boxId, items: [{productId, quantity}], giftNote?, wrap?, ribbon?, nameCard?, recipientAddressId?, hidePrice? }`. Creates a real `Hamper` row + one `CartItem{hamperId}` line — mirrors `CartContext.addHamperItem`. `400` if the summed item quantity exceeds the box's `maxItems`; `404` if `recipientAddressId` is set but isn't one of the caller's own addresses. |
| `PATCH /cart/items/:id` | any authed role, own item only (`404` otherwise) | Body `{ quantity }` (≥ 1). `400` if it would exceed stock (product lines only). |
| `DELETE /cart/items/:id` | any authed role, own item only | Removes the line. The linked `Hamper` row (if a hamper line) is left in place — a `Hamper` can still be referenced by a later `OrderItem` even after its `CartItem` is gone (see `schema.prisma`'s `Hamper` model comment). |
| `POST /cart/items/:id/address` | any authed role, own item only | Body `{ addressId? }` — assigns (or clears, if omitted) which saved address the line ships to. `addressId` must be one of the caller's own addresses (`404` otherwise). |
| `DELETE /cart` | any authed role | `204`, empties the cart. |

### Orders (owner-scoped)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /orders` | any authed role | Creates an order from the caller's **current `Cart`** — see "Server-authoritative pricing" below. Body: `{ defaultAddressId?, shipments?: [{addressId, deliveryDate?}], gift?: {recipientName, recipientAddressId, hidePrice?, message?}, paymentMethod: "wallet"\|"razorpay"\|"cod" }`. `gift.recipientAddressId` must be one of the caller's own saved addresses — "ship to someone else" means the recipient's address is in your address book, the same FK shape `Order.giftRecipientAddressId` requires; the mock checkout's synthetic `"gift-recipient"` id doesn't carry over (flagged for M8.4 below). `400` on an empty cart or a missing shipping address for some line; `404` if any resolved address isn't owned by the caller; `409` on a stock race lost inside the transaction. Clears the cart on success. **Accepts `Idempotency-Key` (2026-08-07 audit).** Until then it did not, and nothing on the server stopped a repeated submit from creating a second order with its own stock decrement and its own payable total — the only guard was `CheckoutClient`'s `placing` React state, which is not a lock. Three clicks in one task produced three orders and three wallet debits. The key check runs **before** the cart validation, so a sequential replay (a refresh, a retried request) returns the original order instead of failing "Cart is empty" for an order that in fact succeeded. |
| `GET /orders` | any authed role | Own orders only, newest first. `?page=&pageSize=` (default 20, max 100). Returns `{ items, page, pageSize, total }`. |
| `GET /orders/history` | any authed role | `client/lib/api/history.ts#getOrderHistory`'s unified shape, **marketplace orders only** — laundry/snack bookings join this in M8.3 (see below). **M37:** the marketplace stream is capped at the latest 100 — a cap, not a pager; the account screen is a scrolling list and 100 is past what anyone scrolls. |
| `GET /orders/:id` | any authed role, own order only (`404` otherwise) | Full order incl. items/shipments/gift. |
| `POST /orders/:id/pay` | any authed role, own order only | **M8.2.** Completes the `pending-payment -> placed` seam for a `paymentMethod: "wallet"` order: debits the wallet for `order.total` (read fresh from the DB), credits `order.cashbackEarned`, transitions the order to `placed` — one atomic transaction. `402` (`INSUFFICIENT_BALANCE`) if the wallet can't cover it, order left untouched. `409` if the order isn't `pending-payment` (already paid/cancelled) or `400` if its `paymentMethod` isn't `"wallet"`. Accepts an `Idempotency-Key` header (see "Idempotency" below) — safe to retry. |
| `POST /orders/:id/reorder` | owner | Puts a past order back in the caller's cart, **line by line against today's catalogue**. Returns `{ added: [{name, quantity}], skipped: [{name, reason}] }`. Partial success is the normal outcome, not an error: an item may be sold out, paused (`isAvailable`), delisted, or missing the exact weight that was bought — a home kitchen's catalogue moves between one order and the next. Hamper lines are always skipped (a hamper is a composed thing; rebuilding one belongs to the builder). Callers **must render `skipped`** — a reorder that silently drops half an order is worse than one that names the half. |
| `POST /orders/:id/cancel` | owner | Body: `{ reason? }`. Cancels while the order is `pending-payment`, `placed` or `confirmed`; `409` after that (the line is drawn at `packed` — once a home cook has cooked and boxed it, the cost of a cancellation lands on them). Restocks every line, and credits the wallet with the full total **only if money was actually taken** — a `pending-payment` order never captured any, and crediting there would mint money out of an abandoned checkout. Idempotent: cancelling twice returns the cancelled order. |
| `POST /orders/:id/return` | owner | Body: `{ reason }` (10–1000 chars, **required** — a return is a claim about food that already arrived, and "refund requested" with no words attached is unactionable). Requires `status: delivered`, `refundStatus: none`, and within **7 days of `deliveredAt`** (falling back to `placedAt` on pre-M15 rows). Sets `refundStatus: requested` + `refundReason` + `refundRequestedAt`. **Moves no money** — an admin resolves it with `POST /admin/orders/marketplace/:id/refund`. |
| `POST /orders/:id/refund` | `@Roles('admin')` | **M8.2.** Credits the order owner's wallet for `order.total` (`category: "refund"`) and sets `refundStatus: "refunded"`. `404` unknown order, `409` if the order was never paid (`pending-payment`). Idempotent: a second call (same `Idempotency-Key`, or none at all — the "already refunded" check alone catches it) returns the same result without a second credit. |

**Why a return doesn't auto-refund.** Whether a homemade jar that "tasted
off" earns a refund is a judgement call. Auto-refunding would make the
platform's most abusable path also its most frictionless one, and the
loss lands on a home cook, not a warehouse. The request is recorded with
the buyer's own words and handed to a person.

**Refunds go to the wallet**, not the original payment method, matching
every other refund path in this codebase (`OrdersService.refundOrder`,
admin refunds). A card reversal through Razorpay is a separate
integration, not something to half-introduce.

**`Order.deliveredAt`** is stamped wherever an order actually reaches
`delivered` — the HomeKrafter's `POST /seller/orders/:id/advance` and an
admin's `PATCH /admin/orders/:type/:id/status`. The return window counts
from it rather than `placedAt`, which on a made-to-order item can be a
week earlier.

#### Server-authoritative pricing + price-snapshotting

`OrdersService.create` never reads a price from the request body — the
DTO has no price field, and an extra one is rejected outright by
`forbidNonWhitelisted`. Every line's price is recomputed fresh via the
same `resolveCartLine` helper `GET /cart` uses (product line: the current
`WeightOption.price` for the requested `sku`; hamper line:
`HamperBox.price` + the sum of each hamper item's product's
default-weight price × quantity), then **snapshotted onto
`OrderItem.price`** at creation time — an order's total never drifts if
the catalog price changes afterward. Stock is checked once up front
(fast-fail before opening a transaction) and then re-checked +
decremented atomically inside the same `$transaction` that creates the
order: `WeightOption.updateMany({ where: { sku, stock: { gte: qty } },
data: { stock: { decrement: qty } } })` — an affected-row count of `0`
means a concurrent request won the race, and the whole order creation
throws `409 CONFLICT` and rolls back (no partial order, no double-sold
stock). `subtotal`/`shippingFee`/`cashbackEarned`/`total` use the exact
same `computeShipping`/`computeCashback` rules as
`client/lib/cart/pricing.ts` (flat ₹49 shipping under ₹999 subtotal, free
at/above it; flat 5% cashback, rounded) — ported verbatim to
`server/src/common/pricing/pricing.util.ts`.

#### Seam for M8.2 (wallet/Razorpay) — closed

Every order created by `POST /orders` starts at `status:
"pending-payment"` — the `OrderStatus` enum value M8.1 added specifically
for this seam (Prisma member `pending_payment`, `@map`ped to the DB value
`"pending-payment"`, same reasoning as `DietaryTag`'s
underscored-identifier/hyphenated-DB-value split — see
`server/prisma/schema.prisma`'s doc comment on the enum). `walletApplied`
still records the shopper's chosen payment method's *intent* at order-
creation time (`total` if `paymentMethod: "wallet"`, else `0`); M8.2 adds
the two endpoints that actually move money and close out the status:
- **`paymentMethod: "wallet"`** → `POST /orders/:id/pay` (above): debits
  the wallet, credits cashback, transitions to `placed`, atomically.
  Rejects (`402`, order untouched) if the balance can't cover it —
  M8.1's "accepted unconditionally" gap is now closed.
- **`paymentMethod: "razorpay"`** → `POST /payments/razorpay/order` (see
  "Payments — Razorpay (M8.2)" below) to open a Razorpay order for
  `order.total`, then the shopper completes checkout client-side and
  Razorpay's `payment.captured` webhook (verified server-side) transitions
  `pending_payment -> placed` + credits cashback.
- **`paymentMethod: "cod"`** has no M8.2 endpoint — it's placed already
  at `POST /orders` time in the sense that no online payment capture is
  needed; a real COD confirmation/failure flow (driver-side "collected"
  event) is a later milestone's concern, not modeled here.
- A failure/cancellation path that restocks the `WeightOption.stock`
  `POST /orders` already decremented is **not** built in M8.2 — an
  abandoned `pending-payment` order today just sits there forever with
  its stock held. Flagged as an M8.3+ follow-up (a TTL sweep or an
  explicit "cancel unpaid order" endpoint).

Not yet in the frontend mock's `OrderStatus` union
(`client/lib/types/marketplace.ts`) — M8.4 must add `"pending-payment"`
there before rendering a real order (see "Response-shape notes" below).

#### Seam for M8.3 (laundry/snacks in unified history)

`GET /orders/history` returns marketplace orders only, each shaped like
`client/lib/api/history.ts#OrderHistoryEntry` (`kind: "order"`). M8.3's
laundry/snack booking endpoints should produce `kind: "laundry"` (etc.)
entries in the same shape and merge + re-sort by `date` — the same way
the mock `getOrderHistory` already merges `Order`s and `LaundryBooking`s
today.

### Response-shape notes for M8.4 (client swap)

- `GET /cart`'s response is richer than the frontend `Cart` type
  (`{id, userId, items, updatedAt}`): each `items[]` entry already
  carries the resolved display/pricing fields `CartContext.lineInfo()`
  currently computes client-side (`name`, `unitPrice`, `lineTotal`,
  `imageSrc`, `weightLabel`, `maxQuantity`, `isHamper`), plus cart-level
  `count`/`subtotal`/`shippingFee`/`total`/`cashbackEstimate`. M8.4 can
  keep computing `lineInfo()` from a separately-fetched catalog (as
  today, ignoring the extra fields) or — recommended — drop `lineInfo()`
  entirely and read the server's numbers directly, removing the one
  place a client-computed and server-computed price could disagree.
- `Order.status` can now be `"pending-payment"` — add it to
  `client/lib/types/marketplace.ts`'s `OrderStatus` union before M8.4
  renders a real order; an unmapped status falls through any
  `Record<OrderStatus, ...>` lookup (e.g. `ORDER_STATUS_LABEL`) with
  `undefined`.
- Gift orders now require a real `recipientAddressId` from the caller's
  own address book, not the mock checkout's synthetic `"gift-recipient"`
  string — M8.4's checkout flow needs a way to get the recipient's
  address into the account's address book first (either "Save this as a
  new address" inline in the gift form, or reusing the existing
  add-address flow before checkout).
- Enum values that contain a hyphen in the frontend contract
  (`DietaryTag`'s `"gluten-free"` etc., `OrderStatus`'s new
  `"pending-payment"`) are stored as underscored Prisma enum identifiers
  at the DB layer (`gluten_free`, `pending_payment`) — every JSON
  response already converts back to the hyphenated frontend form, so
  nothing changes in M8.4 beyond the `OrderStatus` union update above;
  documenting it here so the DB migration and the wire format not
  matching visually isn't a surprise.

## Wallet & Payments (M8.2 — real, `server/src/{wallet,payments}/`)

The wallet ledger is **server-authoritative from day one** — the client
never computes or sends `balanceAfter`, and there is no endpoint that
credits/debits a wallet from a bare client-supplied amount+reason except
the admin-gated `adjust` op. Every real money movement instead derives its
amount from a DB row (`Order.total`, a `RazorpayOrder.amount` recorded at
order-creation time) or from a signature-verified Razorpay webhook — see
`docs/ARCHITECTURE.md`'s "Payment & ledger flow" section for the full
design rationale.

### Idempotency

Every money-mutating endpoint below (`POST /orders`, `POST /wallet/adjust`,
`POST /orders/:id/pay`, `POST /orders/:id/refund`) accepts an optional
**`Idempotency-Key`** request header (falls back to an `idempotencyKey`
body field if the header is absent). A repeat call with the same key
(scoped per-caller, per-endpoint) returns the exact first response without
re-running the mutation — safe for a client to retry on a timeout/network
error, or for a double-submitted click, without double-charging.
Implementation: `server/src/common/idempotency/idempotency.service.ts`,
backed by a DB-unique `IdempotencyKey` row inserted inside the same
transaction as the mutation itself (see `ARCHITECTURE.md` for the exact
mechanics — no polling, no separate lock). Omitting the header still runs
the op (no replay protection); every wallet-balance mutation is still
individually race-safe via the wallet row lock either way (see below).

**Supporting the header is only half of it — a client has to send one.**
The audit found the web client sent none anywhere, including on
`POST /orders/:id/pay`, which had accepted a key since M8. Checkout now
mints one key per attempt for `POST /orders` (stable across retries of the
same intended purchase, fresh for a new one) and keys the wallet payment
on the order id.

### Wallet (owner-scoped)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /wallet` | any authed role | `{ id, userId, balance, pendingCashback, lifetimeSaved, payWithWalletDefault, updatedAt }` — lazily creates a zero-balance wallet if none exists yet (shouldn't happen for a real account; `auth.service.ts` creates one at registration). |
| `GET /wallet/transactions` | any authed role | One page of the ledger, newest first: `{ items: WalletTransaction[], nextCursor: string \| null }`. Query: `limit` (default 50, max 100), `cursor` (a previous response's `nextCursor`). Cursor rather than offset because the ledger grows at the end being read from. `items` matches `client/lib/types/wallet.ts` exactly. **M23: this used to return the entire ledger as a bare array, uncapped.** |
| `GET /wallet/auto-topup` | any authed role | Current `AutoTopupRule`, or an off/`below-threshold` default shape if never configured. **Always carries `active: false` + `unavailableReason`** — auto-top-up is paused platform-wide, so a stored rule may read `enabled: true` and still never fire. Clients must branch on `active`, never on `enabled`. |
| `PUT /wallet/auto-topup` | any authed role | Partial patch: `{ enabled?, trigger?, thresholdAmount?, topupAmount?, paymentMethodRef? }`. Upserts. **Rejects `enabled: true` with `400`** (M19) — the credit it used to perform had no captured payment behind it. `thresholdAmount`/`topupAmount` are capped at ₹25,000. Turning an existing rule *off* still works. |
| `POST /wallet/adjust` | `@Roles('admin')` | Manual credit/debit: `{ userId, direction: "credit"\|"debit", amount, reason }`. The one endpoint where a caller-supplied `amount` is intentional — gated to admins, `reason` required (becomes the ledger row's `title` for audit), `category: "adjustment"`. |

There is deliberately **no** `POST /wallet/topup`, `/wallet/pay`,
`/wallet/earn-cashback`, or generic `/wallet/refund` endpoint — each would
mean trusting a client-submitted amount for a real credit/debit with no
independent verification. A wallet top-up only ever completes through the
Razorpay order + webhook flow below; a wallet *payment* only ever happens
via `POST /orders/:id/pay` (amount = the DB order's total); a refund only
ever happens via `POST /orders/:id/refund` (same). This is a deliberate
narrowing from the `docs/API.md`-M6-era placeholder note that once named
`POST /wallet/topup` as the eventual endpoint — superseded by this design.

### Payments — Razorpay (M8.2, `server/src/payments/`)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /payments/razorpay/config` | **public** (`@Public()`) | `{ cardPaymentsEnabled: boolean }` — whether this deployment can actually capture a card/UPI payment, i.e. whether `RAZORPAY_KEY_ID`/`_SECRET` are real rather than the `.env.example` placeholders. **A client must check this before offering the option**, not after creating something it then cannot collect. Opening Razorpay Checkout against an unconfigured key does not fail loudly: Razorpay answers `401`, the widget hides its own container, and neither the success handler nor `modal.ondismiss` fires — so an awaited promise hangs forever and the SDK's `overflow: hidden` is left on `document.body`. Found by the 2026-08-07 audit sweep, where the wallet's "Top up" button did nothing at all and checkout stranded a real `Order` at `pending_payment`. Discloses only the boolean, never a key. |
| `POST /payments/razorpay/order` | any authed role | Opens a Razorpay order. Body: `{ purpose: "order"\|"topup", orderId?, amount? }` — `orderId` required (and its `Order.total` is what's actually charged, never `amount` even if sent) when `purpose: "order"`; `amount` required when `purpose: "topup"`. Returns `{ razorpayOrderId, amount, amountPaise, currency: "INR", keyId, mock }`. `mock: true` when `RAZORPAY_KEY_ID`/`_SECRET` are still the `.env.example` placeholders — a locally-minted `order_mock_<uuid>` id is returned instead of calling Razorpay's API, so the whole flow (including the webhook below) stays exercisable without a real Razorpay account. `404`/`409`/`400` if the referenced order doesn't exist, isn't owned by the caller, isn't `pending-payment`, or isn't `paymentMethod: "razorpay"`. **Idempotent for `purpose: "order"` (M21):** if that order already has a `RazorpayOrder` in `status: created` for the same amount, its existing `razorpayOrderId` is returned rather than a second one being minted — a reload or a second tab must not leave two payable Razorpay orders against one `Order`, since a buyer who paid both is charged twice and credited once. A changed `Order.total` opens a fresh one (the stale row is for the wrong money). **`purpose: "topup"` is deliberately *not* de-duplicated** — two ₹500 top-ups are two legitimate top-ups and both credit. |
| `POST /payments/razorpay/webhook` | **public** (`@Public()`) | Razorpay's server calls this, not a signed-in shopper. Verifies `X-Razorpay-Signature` (HMAC-SHA256 over the **raw** request body, keyed with `RAZORPAY_WEBHOOK_SECRET`) before touching any state — an invalid/missing signature is `400`, nothing evaluated further. Only acts on a `payment.captured` event; every other event type is acknowledged `200` as a no-op. On a valid `payment.captured`: looks up the `RazorpayOrder` row by `payload.payment.entity.order_id` (never trusts the payload's amount) and either credits the wallet top-up (+3% bonus above ₹2,000, mirroring `client/lib/wallet/WalletContext.tsx`'s `TOPUP_BONUS_THRESHOLD`/`RATE`) or transitions the linked `Order` `pending-payment -> placed` + credits cashback — depending on that row's `purpose`. Deduplicated by `(event, paymentId)` via a `WebhookEvent` unique-insert — a redelivered event is acknowledged `200` as a duplicate, never reapplied. |

Signature verification requires the **raw**, pre-JSON-parse request bytes
— wired via `NestFactory.create(AppModule, { rawBody: true })` in
`main.ts` (Nest/Express still parses `req.body` normally for every route;
this additionally stashes the raw `Buffer` on `req.rawBody`). Re-signing a
re-serialized `JSON.stringify(req.body)` would not reliably byte-match
what Razorpay actually signed.

### Seam for M8.3 (seller payouts)

`Seller`/`Payout` tables already exist in the schema (M8.0) but have no
service/endpoint yet — a seller's share of a captured payment crediting
their own payout ledger (as opposed to the consumer wallet flows above) is
explicitly **out of scope** for M8.2 and left for M8.3.

## Services (M8.3a — real, `server/src/{laundry,snacks,referrals,notifications,support,corporate}/`)

### Laundry (`server/src/laundry/`) — withdrawn (M19; browse removed M37)

The module is **withdrawn**. M19 turned both create routes into `410
Gone`; **M37 deleted the four `@Public()` browse routes**
(`GET /laundry/services`, `/services/:slug`, `/availability/days`,
`/availability/slots`) and the server-side create paths behind the 410
stubs — a withdrawn module was still publishing a browsable price list.
What remains is the obligation set: owner reads, subscription
change/cancel, and the 410 stubs themselves (a native client built
against this file deserves "retired", not "never existed").

Booking payloads are **self-describing since M37**: every line carries
`serviceName` + `unitLabel` and the booking carries `pickupSlotLabel` /
`deliverySlotLabel`, because with the browse routes gone the row is the
only place those names still reach a customer.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /laundry/bookings` | any authed role | Mine, newest first. |
| `GET /laundry/bookings/:id` | any authed role | Owner-scoped — `404` (not `403`) if it exists but isn't mine. |
| `POST /laundry/bookings` | any authed role | **`410 Gone`** (M19). The service-side create path was deleted in M37. |
| `GET /laundry/subscriptions` | any authed role | Mine. |
| `GET /laundry/subscriptions/:id` | any authed role | Owner-scoped. |
| `POST /laundry/subscriptions` | any authed role | **`410 Gone`** (M19). |
| `PATCH /laundry/subscriptions/:id` | any authed role | Partial patch (`active`, `plan`, `slotDay`, `slotId`, `nextPickup`) — changing or pausing what you already signed up for must keep working. |
| `DELETE /laundry/subscriptions/:id` | any authed role | Soft-cancel (`active: false`, not a hard delete — bookings still reference it via `subscriptionId`). `204`. |

### Snacks (`server/src/snacks/`)

`@Public()` menu reads only — Snacks ordering is **WhatsApp-only**
(`lib/channel.ts`: "Cart web: no"), so there is deliberately no consumer
`POST /snacks/order` here; a `SnackList` never becomes a server-side
entity, it just formats a `wa.me` message client-side. `SnackOrder` (the
seller-side record of an inbound WhatsApp order) has seller-scoped read +
status-advance endpoints as of **M8.3b** — see "Seller portal (M8.3b)"
below (`GET/POST /seller/snack-orders/*`). **As of M9**, real inbound
WhatsApp messages actually create these rows — see "WhatsApp Cloud API
(M9)" below for the inbound webhook that parses them.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /snacks` | `@Public()` | Available snacks, optional `?category=savoury\|sweet\|baked\|namkeen` and `?q=` (name + description, same term semantics as `GET /products?q=`). |
| `GET /snacks/:slug` | `@Public()` | Single snack. |

### Meal subscriptions (M19 — real, `server/src/meals/`)

The platform's first recurring product, and the replacement for
`LaundrySubscription`, which recorded intent and produced nothing before
laundry was withdrawn.

**A cycle is prepaid, in one wallet debit, and nothing charges anybody in
the background.** There is no saved card and no recurring mandate — the
milestone this shipped in opened by deleting a code path that credited
wallet balance with no payment behind it, and a daily auto-charge on that
footing would be the same mistake pointed the other way. A buyer pays for N
meals up front; the subscription spends that down. When UPI AutoPay is
wired, `amountPaid` + `mealsRemaining` is the seam to convert against.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /meal-plans` | `@Public()` | Active, unmoderated plans. `?mealType=breakfast\|lunch\|dinner`, `?diet=veg\|non-veg`, `?q=`, and `?lat=&lng=` for radius filtering. No coordinates → the full list; browsing is never behind a location grant. |
| `GET /meal-plans/:slug` | `@Public()` | Single plan. A hidden or inactive plan is **404, not 403** — telling an anonymous caller that a plan exists but is hidden leaks a moderation decision. |
| `GET /meal-subscriptions` | consumer | The caller's own, newest first. |
| `GET /meal-subscriptions/:id` | consumer | With every delivery. Somebody else's id returns **404**, not 403. |
| `POST /meal-subscriptions` | consumer | **Money.** Debits `pricePerMeal × mealCount` in one go. Honours `Idempotency-Key`. `402` when the wallet cannot cover it, and the subscription *and* its deliveries roll back with it. |
| `PATCH /meal-subscriptions/:id/pause` | consumer | Cancels everything still scheduled **except locked dates (M37)** — a meal past `menuLockTime` the evening before is already being planned and still arrives; the pause confirmation says so. A paused subscription **keeps its seat** against the plan's capacity. |
| `PATCH /meal-subscriptions/:id/resume` | consumer | Rebuilds the remaining schedule from today forward — the old dates are in the past by then, and reinstating them would hand a kitchen meals that were due last week. |
| `PATCH /meal-subscriptions/:id/deliveries/:deliveryId/skip` | consumer | The meal is **owed, not lost**: the cycle grows a day at the far end. **M37:** a locked date (past `menuLockTime` the evening before) is a `409` — "this one will still be delivered". Delivery rows in every subscription payload now carry `dish?` (the set day menu, else a 7-line rotation's weekday line — resolved server-side) and `locked` (server-computed; never derive it from the browser clock). |
| `DELETE /meal-subscriptions/:id` | consumer | Terminal, and **moves no money**. A refund is an admin decision through `POST /wallet/adjust`, for the same reason M15 refuses to auto-refund a return: the loss lands on a home cook who already bought the ingredients. |

**M20 — a plan is no longer necessarily a meal.** `mealType` is optional;
when it is absent the plan is some other cadence (a monthly box, a weekly
loaf) and `slotLabel` names it. **Render `slotName`**, which the server
resolves from whichever applies — re-deriving it client-side is how the two
disagree. Delivery windows for a plan with no `mealType` come from the
kitchen's own hours rather than a mealtime.

### Seller — subscription plans (M20, `server/src/seller/meal-plans.controller.ts`)

`@Roles('seller')`, scoped to the caller's own `sellerId`. Until these
existed a kitchen could not create a plan at all, so "HomeKrafters decide
what they sell on subscription" was true of the intention and not of the
software.

| Endpoint | Notes |
|---|---|
| `GET /seller/meal-plans` | The kitchen's own plans. Carries one field the public payload does not: **`subscriberCount`**. `seatsLeft` is `null` on an uncapped plan, so putting the raw count on `mapMealPlan` would publish every kitchen's subscriber numbers to anyone who can read `GET /meal-plans`. |
| `POST /seller/meal-plans` | `mealType` optional; supply `slotLabel` for anything that is not breakfast/lunch/dinner. `productId` optionally backs the plan with one of their existing listings — a listing belonging to someone else is a **400**. |
| `PATCH /seller/meal-plans/:id` | A price change applies to **new** subscribers only; existing `MealSubscription` rows snapshotted their price and are never re-read. |
| `DELETE /seller/meal-plans/:id` | Closes to new subscribers. Does **not** touch people already on it — they paid for a run of meals and a kitchen changing its mind cannot cancel a prepaid commitment. |
| `GET /seller/meal-plans/deliveries?days=14` | The cook's work queue: every meal owed, soonest first, with the customer and address. |
| `PATCH /seller/meal-plans/deliveries/:id/delivered` | Marks one meal delivered. **The only path that decrements `mealsRemaining`** — a skipped meal is still owed, so only an actual delivery spends one. Hitting zero expires the subscription. |
| `GET /seller/meal-plans/:id/menus?days=14` | **M37.** The next `days` dates' menus for one plan: `{ lockTime, days: [{ date, lines, source: "day"\|"template"\|"none", locked, lockAt, scheduledCount }] }`. `source: "template"` means the weekday line of a **7-line** `weeklyMenu` (read Monday→Sunday; any other line count opts out of the fallback). `scheduledCount` is how many subscribers a change to that date reaches. Days capped at 30, default 14. |
| `PUT /seller/meal-plans/:id/menus/:date` | **M37.** Sets one date's menu (`{ lines: string[] }`, ≤10 lines of ≤120 chars); `lines: []` clears it back to the rotation. A **locked** date — past `menuLockTime` IST the evening before — is a `400` naming the lock time; the audited admin override is the only door past it. A *change* to a previously set date notifies every subscriber scheduled for it (`meals` category); a first-time set notifies nobody — planning is not a change. |

`moderationStatus` is absent from both seller DTOs, so `forbidNonWhitelisted`
turns an attempt to set it into a 400 — the same rule that stops a seller
awarding themselves a verification badge.

Response notes worth branching on:

- `MealPlan.brackets` carries the 30-minute windows the kitchen actually
  offers, so no client re-derives them and disagrees with the server.
  `bracketStart` is a label (`"12:30"` = 12:30–13:00), never an instant.
- `seatsLeft` is `null` when a plan is uncapped, which is **not** the same
  as zero.
- `moderationStatus` and `isActive` are both returned. They are separate
  switches — the admin's and the kitchen's — and a buyer needs both to pass.
  Collapsing them into one `available` boolean is how a moderator's action
  gets silently undone by a cook toggling their own availability.
- `pricePerMeal` on a subscription is the **snapshot** taken at subscribe
  time, not the plan's price today.

### Referrals & loyalty (`server/src/referrals/`)

Owner-scoped. Unlike the client mock's argument-less
`applyReferralCredit()` (auto-picks "the next eligible referral in this
browser session"), the real endpoint targets one `Referral` id
explicitly — a cleaner, individually-idempotent unit for "this referral
pays out at most once" over a real, persistent table. **Flagged for
Opus/M8.4**: the `/account/referrals` demo-button call site will need to
pass a specific referral id once this swaps in.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /referrals/code` | any authed role | `{ code }` — the caller's own `User.referralCode`. |
| `GET /referrals` | any authed role | Mine (as referrer), newest first. |
| `POST /referrals/:id/apply-credit` | any authed role | Owner-scoped (`referral.referrerUserId` must be the caller). Credits `REFERRAL_REWARD_AMOUNT` (₹250, `client/lib/data/referrals.ts`) to the caller's wallet via `WalletService.postLedgerEntryTx` (`category: "referral"`) and marks the referral `rewarded`. **Once-only**: a referral already `status: "rewarded"` → `409`, re-read inside the same transaction as the ledger write (same read-then-mutate-atomically shape as `OrdersService.refundOrder`). **The referee must have a delivered order (2026-08-07 audit)** — `409` otherwise, naming which condition is unmet. Before that the reward was gated on nothing but the row existing, and `/account/referrals` shipped an "Apply referral credit (demo)" button that called it: a shopper granting themselves a ₹250 wallet credit, the same shape as the open review endpoint M15 closed. Delivered rather than placed, because a place-then-cancel round trip would otherwise pay ₹250 for nothing (the hole M22 closed on cashback). Supports `Idempotency-Key`. |
| `GET /loyalty` | any authed role | `LoyaltyAccount` — lazily creates a zero-point account if none exists yet. |

### Notifications (`server/src/notifications/`)

Owner-scoped read/preferences endpoints below. **As of M9**, real
delivery exists too — see "Notification delivery (M9)" further down for
`NotificationsDeliveryService`, the internal (not directly HTTP-exposed)
seam every event-producing module (currently `AdminWalletService.adjust`/
`issueRefund`) calls to actually fan a notification out.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /notifications/preferences` | any authed role | `NotificationPreference[]`, one per `NotificationCategory` (6) — lazily backfills any missing category row. **M18**: the backfill uses `defaultChannelsFor(category)`, not the schema's column defaults. Transactional categories (order, laundry, snacks, wallet, account) default to **WhatsApp + email + in-app**; `promo` stays in-app only, because opting somebody into marketing on WhatsApp is how a sender gets blocked — and a block is per-sender, so one promo costs every future order update to that person. SMS stays off everywhere but OTP. |
| `PATCH /notifications/preferences/:category` | any authed role | Partial patch: `{ sms?, whatsapp?, email?, inapp? }`. Upserts. |
| `GET /notifications` | any authed role | Inbox, newest first, **latest 50** (M37 — capped, not paged; the client captions the cut). One row per channel actually delivered for a given event (M9) — e.g. a wallet event with both `sms` and `email` enabled produces two rows. |
| `PATCH /notifications/:id/read` | any authed role | Body: `{ read?: boolean }` (defaults `true`). Owner-scoped — `404` if it exists but isn't mine. |

### Support (`server/src/support/`)

Owner-scoped.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /support/tickets` | any authed role | Body: `{ subject, channel: "chat"\|"call"\|"email", message, orderRef? }` — creates the ticket with one opening `sender: "user"` message. |
| `GET /support/tickets` | any authed role | Mine, newest first. |
| `GET /support/tickets/:id` | any authed role | Owner-scoped — `404` if it exists but isn't mine. |
| `POST /support/tickets/:id/messages` | any authed role | Body: `{ body }`. `sender` is derived from the caller's own role (`"agent"` for an admin, `"user"` otherwise), never client-supplied. Bumps the ticket's `updatedAt`. |

### Corporate inquiry (`server/src/corporate/`)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /corporate-inquiries` | `@Public()` | Body: `{ companyName, contactName, email, phone, occasion?, orderType?, estimatedQuantity, budgetRange?, message }`. `CorporateInquiry` has no `userId` FK (an inquiry may predate an account, same as `SellerApplication`). **Throttled 5/60s** (M20) — the same budget as `POST /seller-applications`, its sibling public intake; it had been on the app-wide 120/min while fanning out a notification per admin per channel. `orderType` is `corporate\|bulk`, defaulting to `corporate`. Every admin is notified on inbound, `void`-called outside the write and capped at 10 recipients. |

### Corporate quotes (M20, `server/src/corporate/`, `server/src/admin/corporate.controller.ts`)

`CorporateInquiryStatus` had `quoted` in it since M7b with nothing being
quoted, and nothing anywhere read a row. These are the reader and the thing
being quoted.

**Admin** — `@Roles('admin')`, every mutation audited:

| Endpoint | Notes |
|---|---|
| `GET /admin/corporate-inquiries` | One page: `{ items, page, pageSize, total, summary: { unworked, contacted, quoted } }`. Query: `status` (`new\|contacted\|quoted\|closed`), `page`, `pageSize` (default 25, max 100). **`summary` counts the whole queue, never the filter** — narrowed to the loaded rows it read "0 unworked" the moment an admin filtered. |
| `GET /admin/corporate-inquiries/:id` | One enquiry plus its quotes. |
| `PATCH /admin/corporate-inquiries/:id/status` | `new\|contacted\|quoted\|closed`. |
| `PATCH /admin/corporate-inquiries/:id/notes` | `internalNotes` — never shown to the customer. |
| `POST /admin/corporate-inquiries/:id/quotes` | Builds a draft. **Every line carries a required `vendorId`, even a custom one** — seller order visibility, seller notifications and payouts all resolve a kitchen through the vendor, so a line naming none is work nobody can see and money nobody can be paid (**400**). A catalogue line whose `productId` belongs to a different kitchen is also a **400**. |
| `PATCH /admin/corporate-inquiries/quotes/:quoteId` | Drafts only. Repricing a **sent** quote is a **409** — somebody is looking at the old number; withdraw and re-raise. |
| `POST /admin/corporate-inquiries/quotes/:quoteId/send` | Mints the accept token, emails the link, sets the inquiry to `quoted`. **The raw token exists only in that email** — it is stored as a SHA-256 hash and never returned by any read. Re-sending rotates it, killing the previous link. |
| `DELETE /admin/corporate-inquiries/quotes/:quoteId/link` | Withdraws the link. The quote survives as the record of what was offered. **Only a `sent` quote drops back to `draft`** — that is what makes it re-pricable. An `accepted` or `declined` quote keeps its status, so withdrawing a forwarded link after the deal closed cannot rewrite what happened or reopen the 409 above. |

**Public** — `@Public()`, no account, because procurement will not make one:

| Endpoint | Notes |
|---|---|
| `GET /corporate/quotes/:token` | **200** for a resolvable token with the state in the body — `valid \| accepted \| expired \| declined`. `expired` is derived from the clock, never stored. Only not-found and revoked **404**, and they are byte-identical, so a token cannot be probed. "Already accepted" is a normal state, not an error. Carries no vendor names — which kitchen supplies which line is our commercial arrangement. |
| `POST /corporate/quotes/:token/accept` | Body `{ acceptedName }`. **A POST, never a GET** — a link prefetcher or email scanner must not accept a ₹50,000 order by following a link. Claimed with a conditional `updateMany`, so concurrent requests on a forwarded link accept exactly once and the losers get the receipt rather than a 409. **Creates no `Order`s** — see below. |
| `POST /corporate/quotes/:token/decline` | So a row does not sit at `sent` forever. |

**Acceptance deliberately creates no orders.** `Order.userId`,
`OrderItem.addressId` and `OrderShipment.addressId` are all required and a
`CorporateInquiry` has no user and no address — the schema cannot express a
corporate order. Writing one anyway would push an uncollected five-figure
amount into GMV, into the payouts queue as a real debt to a home cook, and
through `computeCashback` as ~5% credited to an account auto-created for a
stranger. An admin places the orders once an address and payment terms
exist.

### Unified order history — laundry joins the merge

`GET /orders/history` (M8.1) now merges marketplace `Order`s **and**
`LaundryBooking`s into the one normalized list, sorted newest-first —
`kind: "order"` or `"laundry"`, same shape
`client/lib/api/history.ts#getOrderHistory` already produces client-side.
`SnackOrder` is **not** merged in: it has no `userId` FK
(`schema.prisma`) — a WhatsApp-origin order is identified by
`customerName`/`customerPhone`, not a Homekrafted account, and is
seller-scoped only (see `client/lib/types/food.ts#SnackOrder`'s own doc
comment). There is no "my snack orders" to merge into a consumer's
history; exposing snack orders is a seller-side surface (M8.3b).

### Seam for M9 (delivery) — closed

Seller-scoped reads/writes (a HomeKrafter's pickup queue, `SnackOrder`
inbox, listings and `Payout`s) are **real as of
M8.3b** — see "Seller portal (M8.3b)" below. Admin-unscoped views (every
seller's data unscoped, orders oversight, wallet oversight, catalog/review
moderation) are **real as of M8.3c** — see "Admin panel (M8.3c)" below.
Support-ticket/corporate-inquiry *admin* review queues are still not
surfaced under `/admin/*` (only the owner/public endpoints in this
section) — a small remaining seam, not blocking anything. Actually
sending anything over SMS/WhatsApp/email, and WhatsApp Cloud API
ingestion of inbound snack orders, is **real as of M9** — see "WhatsApp
Cloud API (M9)" and "Notification delivery (M9)" below.

## WhatsApp Cloud API (M9 — real, `server/src/whatsapp/`)

Server-side WhatsApp Cloud API integration (`WhatsAppService`) — the real
Meta Graph API call (`POST /{phoneNumberId}/messages`) always runs
through the same code path; when `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`
are still the `.env.example` placeholders, it degrades to an
obviously-labeled logged stub (`[WHATSAPP STUB]`) instead of a silent
pretend-success. `WhatsAppService.sendStatus(recipient, orderRef, state)`
is the shared seam both the snack-seller status-advance
(`SellerSnackOrdersService.advance`, M8.3b) and the inbound webhook's
order-confirmation reply (below) call through — template-based
(`WHATSAPP_STATUS_TEMPLATE`) when configured, else a plain-text session
message.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /whatsapp/webhook` | `@Public()` | Meta's one-time subscription verification handshake: `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. Echoes `hub.challenge` back verbatim (`200`) only if `hub.verify_token` exactly matches `WHATSAPP_VERIFY_TOKEN`; otherwise `403`, challenge never echoed. |
| `POST /whatsapp/webhook` | `@Public()` | Inbound messages + outbound delivery/read statuses. **HMAC-verified**: `X-Hub-Signature-256` (`sha256=<hex>`) over the **raw** request body, keyed with `WHATSAPP_APP_SECRET`, constant-time compared (`whatsapp/whatsapp-signature.util.ts`, mirrors `payments/razorpay-signature.util.ts`'s pattern) — an invalid/missing signature is `400` with **zero state change** (nothing parsed, no `SnackOrder` written). A valid delivery is handed to `WhatsAppInboundService`, which: (1) logs any `statuses[]` entries (delivery/read receipts) for visibility; (2) for each inbound `messages[]` text entry, parses lines matching `client/lib/snacks/message.ts#buildSnackListMessage`'s exact shape (`"NNx Snack Name"` per line) — anything that doesn't match at least one such line is logged and ignored. Each matched line is looked up by `Snack.name` (case-insensitive); items are grouped by the matched `Snack.sellerId` and one `SnackOrder` (+ `SnackOrderItem`s) is created per seller referenced, `status: "received"`. After creation, `WhatsAppService.sendStatus(...)` sends the customer a "received" confirmation (real or stub). **Deduplicated by message id (M21):** the claim `WebhookEvent(provider: 'whatsapp', eventId: 'message:<wamid>')` is inserted inside the same transaction as the `SnackOrder`s, so Meta's delivery retries (it retries anything it doesn't get a timely `200` for) are acknowledged as duplicates instead of creating a second order for the same customer list. A message that matches no snack spends no claim, so a menu fixed a minute later can still accept the redelivery. Confirmations are sent *after* the commit, never inside it. Deliberately minimal per the M9 brief — a production integration would likely use an interactive WhatsApp list/flow instead of free-text parsing. |

## Notification delivery (M9 — real, `server/src/notifications/notifications-delivery.service.ts`)

`NotificationsDeliveryService.deliver({ userId, category, title, body, refType?, refId? })` —
not a directly HTTP-exposed endpoint; an internal seam any module with a
user-facing event calls into (currently `AdminWalletService.adjust`/
`issueRefund`, category `"wallet"` — see "Wallet oversight" below).
Reads the user's `NotificationPreference` for that category (lazily
creating a default row if none exists, same convention as
`NotificationsService.getPreferences`) and, **for each enabled channel**,
calls that channel's provider then persists one `Notification` row per
channel actually delivered — so `GET /notifications` reflects exactly
what went out (two rows for a category with both `sms` and `email` on,
zero for `whatsapp` if that one's off). `inapp` never calls an external
provider; being "delivered" *is* the persisted row. A channel with no
contact info on file (no `phone` for sms/whatsapp, no `email` for email)
is skipped; a provider throwing is caught and logged per-channel — never
blocks the other channels or rolls back the event that triggered it.

Providers (`server/src/notifications/providers/`), each env-gated to a
logged stub on placeholder credentials, same convention as `WhatsAppService`:

- **SMS** (`SmsProviderService`) — Twilio's REST API shape (`Account SID`
  + `Auth Token` Basic auth, form-encoded `POST .../Messages.json`).
  MSG91 or any other REST SMS provider is a drop-in swap behind the same
  `send()` signature. Also used by `OtpService` for real OTP delivery
  (see "Auth model" above).
- **Email** (`EmailProviderService`) — SendGrid's `POST /v3/mail/send`
  shape (Bearer API key, JSON body). An SMTP transport is a drop-in
  alternative behind the same `send()` signature.
- **WhatsApp** — reuses `WhatsAppService.sendText` from the section above.

## Seller applications (M9 — real, `server/src/seller-applications/`)

Closes the M8.4b-flagged gap: the `/sell` form now creates a real
`SellerApplication` that lands in the actual admin approval queue (`GET
/admin/sellers/applications`, "Sellers + the onboarding approval queue"
below) — no longer future-flagged.

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /seller-applications` | `@Public()`, throttled `{ limit: 5, ttl: 60_000 }` | Body: `{ businessName, contactName, email, phone, category?, specialties, city, area, areaLabel?, deliveryRadiusKm?, description }`. **`category` is optional since M22** and the `/sell` form no longer sends it — it is derived from `specialties` (`specialty-taxonomy.ts#categoryForSpecialties`), as is the `Vendor.type` minted at approval. Still accepted (`"home_chef"\|"maker"\|"baker"\|"artist"\|"other"`) so a shipped native client keeps working. `specialties` gained the craft half of the marketplace in M22 — `beverages, candles, ceramics, textiles, jewellery, art_prints, bath_body, stationery, home_decor, personalised` alongside the existing food values; `crafts` remains valid and now means "other handmade". **M36 — `pincode` replaces `area`, and the supply side is national.** Body now carries `pincode` (six digits, any Indian pincode, validated against `server/src/common/pincodes.json`); `city` is **derived** from India Post's district and the value sent is only a fallback. One of `pincode`/`area` is required — `area` stays accepted, and optional, so a native client built before M36 keeps working. A pincode that is well-formed but unknown is `400 APPLICATION_INVALID` naming the pincode; **no pincode application is ever waitlisted.** *Legacy:* `area` is a `TRICITY_AREAS` id **or the literal `"other"`**; when it is `"other"`, `areaLabel` is required and the row is filed `"waitlisted"` rather than `"new"` — it cannot be approved until an admin assigns a real area (see `PATCH .../area` below). That waitlist was the reason for M36: it had no exit in the UI, so an applicant outside the tricity could never be approved by anyone. `deliveryRadiusKm` is genuinely optional: **omit it and it stays `null`**, which is what lets `PlatformSetting.defaultDeliveryRadiusKm` apply at approval. `SellerApplication` has no `userId` FK (an application may predate an account, same as `CorporateInquiry`). **M36b — the pickup address.** Also accepts `addressLine1` (**required in practice**; the service refuses without it, with a written message rather than a decorator's), `addressLine2`, `landmark` and `pickupPhone`. These carry onto `VendorProfile.pickup*` at approval and are **never returned on a public payload** — the `/sell` form promises buyers never see them, and `server/test/unit/vendor-privacy.spec.ts` fails the build if `src/catalog`'s public region reads those columns. Readable on exactly two surfaces: `GET /admin/sellers/:id/profile` and the HomeKrafter's own `GET /seller/profile`. **M32:** also accepts `instagramUrl`, `websiteUrl`, `fssaiNumber` (stored only when `specialties` include food), `yearsMaking`, `capacityPerDay` — all optional. `businessName`, `contactName` and `phone` are now checked for shape and normalised (phone → E.164, Instagram → profile URL, website → protocol filled in); a refusal is `400 APPLICATION_INVALID` with a `problems: [{ field, message }]` array whose messages are written to be shown to the applicant. Links, licence and capacity are carried onto `VendorProfile` at approval — the licence **unverified**, since the badge has one write path and it is admin-only. |

### Admin — resolving a waitlisted application (M19)

| Endpoint | Auth | Notes |
|---|---|---|
| `PATCH /admin/sellers/applications/:id/area` | `@Roles('admin')` | Body: `{ area, note? }` where `area` must be a real `TRICITY_AREAS` id (`"other"` is rejected — it is the value this endpoint exists to resolve). Moves the row to `"reviewing"` so it re-enters the approval queue, keeps the applicant's original `areaLabel`, and writes an audit entry. **Without this the `"other"` waitlist is a dead end** — the public form accepts the applicant and approval refuses them, forever. |
| `PATCH /seller/profile` | `@Roles('seller')` | **M36c** added the pickup address (`pickupAddressLine1`, `pickupAddressLine2`, `pickupLandmark`, `pickupPincode`, `pickupPhone`) to the fields a HomeKrafter may change themselves — people move, and an address they cannot correct is wrong from the day they do. **Changing any of them clears `addressVerified`**, the same rule `fssaiNumber` has followed since M16 and for the same reason: letting a verified badge survive an edit to the thing it verifies is the one way a seller could set their own badge through this endpoint. It clears *only* that flag — `verifiedAt`/`verificationNote` are shared with the identity and licence checks. An empty string clears a line to NULL. The verification booleans remain absent from the DTO and `forbidNonWhitelisted` turns an attempt into a 400. |
| `PATCH /admin/sellers/:id/coords` | `@Roles('admin')` | **M36.** Body: `{ lat, lng, location? }`. Moves a kitchen to where it actually is — the correction step for a pincode centroid that was not close enough. `Vendor.lat`/`lng` decides which buyers can see a storefront at all, and the bundled centroid is trustworthy for only 44% of Indian pincodes, so this endpoint is what makes approving nationally safe. Audited with before/after (`vendor.set_coords`). **No seller-facing equivalent exists, deliberately:** a HomeKrafter moving their own pin changes who can buy from them, the same class of self-granted advantage as setting their own verification badge, and unlike the badge it would be invisible on every screen. |
| `GET /pincodes/:pincode` | `@Public()` | **M36.** `{ pincode, district, state, serviced, spreadKm, approximate }`, or **404** when India Post has no such code. Serves `/sell` (echo back "Panchkula, Haryana" so an applicant can see they typed the right six digits — the only confirmation available on a form with no address lookup) and the buyer location picker. `serviced` reflects `PlatformSetting.servicedPincodePrefixes` and **selects copy, never visibility** — a buyer outside the serviced area still sees the whole catalogue, per the standing "location is never a gate" rule. It is ignored entirely on `/sell`: applying is national. `Cache-Control: public, max-age=3600`. |
| `POST /admin/sellers/applications/:id/approve` | `@Roles('admin')` | `409` if the application's placement does not resolve, naming the place so the admin knows what to fix — **reachable only for pre-M36 rows**, since every valid pincode resolves. **M36:** the response gains `placement: { lat, lng, spreadKm, pincode, label }`, present **only** when the storefront was planted on a pincode centroid wide enough to be worth checking (`spreadKm > 2`), so its presence means "go and correct this one" rather than "here are some coordinates". Nothing is created on refusal — no `User`, no `Vendor`, no `Seller`. **M21:** also mints a single-use 7-day set-password link and sends it by email + SMS (`SellerInviteService`), because the account is created with no credential and the in-app welcome it used to send alone sits behind the login they cannot pass. Response gains `invite: { email, sms, reached, fallbackLink? }`; `fallbackLink` is present **only** when nothing was delivered, so an admin can hand the link over. Returns `409` when the applicant's email already has a HomeKrafter account (previously a 500 from a unique violation). **M32:** also issues a temporary password in the same call and returns it as `signIn: { email, phone, displayName, temporaryPassword }`, because with no provider key configured the link above reaches nobody and an admin needs something short enough to read down a phone. This reverses M21's "approval mints no credential" rule; the substance of that rule is preserved by forced rotation at first sign-in. **M37:** this response is the **only** place the plaintext ever exists — nothing stores it, and no later read returns it. Lost means re-issued via `POST /admin/sellers/:id/temp-password`. |

## Compatibility

There is no `/api/v2` and no deprecation mechanism, and `server/` is shared
with the native apps. Two rules follow.

1. **Treat every enum as open.** Clients must ignore members they do not
   recognise rather than failing. `SellerApplicationCategory` gained
   `home_chef` in M19; more will follow.
2. **Removing an accepted request value is breaking**, and needs a note
   here. M19 removed the `laundry` and `cleaning` chips from the `/sell`
   form but **deliberately left the API accepting them**, precisely so a
   shipped client does not start getting a `400` for a value it was told
   was valid.

## Seller portal (M8.3b — real, `server/src/seller/`)

Every route under `/seller/*` is `@Roles('seller')` — a `consumer` or
`admin` token gets `403` (never even reaches a service method), and every
route requires an access token (`401` with none). Every method resolves
the acting seller from `req.user.sellerId` — a claim `AuthService`
mints into the JWT server-side at login/refresh from `Seller.userId ===
user.id` (see `docs/DATA-MODEL.md`), **never** a client-supplied
`sellerId`/`vendorId` in a route, query, or body param.
`SellerService.resolveSeller` re-reads the `Seller` row fresh from the DB
on every call (not just trusting the token's claim), and every `/seller/*`
controller goes through the single `resolveHomeKrafter`.

**There is no per-type gating any more (M12).** The old
`resolveMaker`/`resolveLaundryPartner`/`resolveSnackSeller` trio, and the
`403 "only available to <type> sellers"` they threw, are gone: one supply
role, every module open to every HomeKrafter. `Seller.specialties` is a
discovery tag and never an access decision. The only `403` left on these
routes is the cross-seller-ownership case below.

**Ownership on every read + write**: a resource that exists but belongs to
a *different* seller **404s** — never `403`, never a partial/redacted
response — so a seller can't distinguish "not mine" from "doesn't exist."
This was verified live (see `README.md`'s walkthrough) for every
mutating + single-resource route: a second maker account (own `vendorId`)
reading/editing/deleting seller A's product, reading/advancing seller A's
order, replying to a review on seller A's vendor/product; a second laundry
partner reading/advancing seller A's booking; a second snack seller
reading/editing/deleting seller A's menu item and reading/advancing seller
A's snack order — all `404`, and the underlying row was confirmed
unchanged afterward. List endpoints scope by a `WHERE` clause tied to the
resolved seller (never return another seller's rows at all, not even
filtered client-side).

### Dashboard + storefront (`server/src/seller/seller.controller.ts`)

| Endpoint | Seller type | Notes |
|---|---|---|
| `GET /seller/me` | **M17.** The caller's own `Seller` record (`+ vendorName`, `vendorSlug`), resolved from their session — there is no id parameter. Added because the web client had no way to read it and was resolving the signed-in kitchen from **mock data**, falling back to a demo record for every real HomeKrafter. **M37:** carries `commission: { pct, enabled }` — the platform rate the listing form's "you receive ₹N" line computes with, server-supplied so no screen hardcodes a percentage. |
| `GET /seller/dashboard` | any | Shape branches on `seller.type` — maker: `{ todayOrdersCount, todayRevenue, pendingPayoutAmount, lowStockCount, rating, reviewCount }` (mirrors `SellerDashboardSnapshot`); laundry: `{ todayPickupsCount, todayDeliveriesCount, weekEarnings, pendingPayoutAmount, rating, reviewCount }` (`PartnerDashboardSnapshot`); snack: `{ incomingOrdersCount, menuSize, earnings, pendingPayoutAmount }` (`SnackDashboardSnapshot`). `pendingPayoutAmount` is computed live (see Payouts below), not read off a stale field. |
| `GET /seller/storefront` | any | The caller's own `Vendor` (resolved via `seller.vendorId`, never a param). The "maker only" 403 this used to carry went in M12 — one supply role, every module. |
| `PATCH /seller/storefront` | any | Body: `{ bio?, location?, avatarSrc?, bannerSrc? }`. No `vendorId` field on the DTO — always the resolved seller's own vendor. |
| `PATCH /seller/specialties` | any | **M33.** Body: `{ specialties: SellerSpecialty[] }` → `{ specialties }`. The only route that can change `Seller.specialties` after approval, so a HomeKrafter approved for food can take on gifting **under the same account** rather than filing a second application. Full replacement, not an append — dropping a category has to work too. `400` on an empty list, and on newly adding a withdrawn tag (`laundry`/`cleaning`); one already on the row is kept, so a legacy partner is not locked out of the screen. Re-derives `Vendor.type` in the same transaction. Grants nothing: access has never depended on `specialties` (M12), and every listing still enters the M22 review queue individually. |

### Analytics (M16 — `server/src/seller/analytics.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /seller/analytics?days=30` | `{ days, from, to, totals, series[], topItems[], byWeekday[] }`. `days` is clamped to 1–365 and echoed back, so the client renders the window it got rather than the one it asked for. Scoped through `resolveHomeKrafter`; the window is the only thing a caller chooses. |

**Revenue is the seller's line-item share, not the order total.** A
marketplace order can span several kitchens, so crediting each of them
with the whole `Order.total` — which is what the admin GMV figure does,
deliberately, as a platform-wide proxy — would overstate what a home cook
earns and disagree with what they are actually paid out. Every
marketplace figure sums `OrderItem.price * quantity` over that vendor's
own products. Snack orders and laundry bookings belong to one seller
outright, so those use their own totals.

Measured on the seed data: one 30-day window contained three orders
touching `vd1` with totals of ₹987, ₹518 and ₹899. One of them spans two
vendors, so `vd1`'s real share is ₹938 + ₹249 + ₹899 = **₹2,086** — not
the ₹2,404 an order-total sum would have reported.

Ratios are `null`, never `0`, when there is nothing to divide by:
`revenueChangePct`/`orderCountChangePct` when the previous window was
empty (a percentage change from zero is a division by zero wearing a
percent sign), `repeatRate` when there are no orders, `cancellationRate`
when nothing has closed. Repeat buyers are resolved against the buyer's
**whole** history with that kitchen, not just the window, so a customer
of two years doesn't read as new because their first order predates the
chart — keyed on `userId` for marketplace orders and on `customerPhone`
for snack orders, which is all a WhatsApp order has.
`SnackOrderStatus` has no `cancelled` member, so snack orders contribute
nothing to the cancellation ratio rather than being reported as a
flattering 0%.

### Profile (M16 — `server/src/seller/profile.controller.ts`)

The story, hours, policies and licence behind the storefront. Separate
from `/seller/storefront`, which stays the four catalogue-facing fields
that ride on every product card.

| Endpoint | Notes |
|---|---|
| `GET /seller/profile` | The caller's own profile — everything the public one has, plus `fssaiNumber`, `fssaiExpiry`, `verifiedAt`, `verificationNote` and `completion: { percent, missing[] }`. |
| `PATCH /seller/profile` | Body: any of `tagline`, `story`, `knownFor[]`, `languages[]`, `prepTimeMins`, `responseTimeMins`, `capacityPerDay`, `minOrderValue`, `workingDays[]` (0 = Sunday), `opensAt`/`closesAt` (`HH:MM`), `cancellationPolicy`, `returnPolicy`, `customOrderPolicy`, `acceptsCustomOrders`, `packagingNote`, `hygieneNote`, `fssaiNumber` (14 digits), the four social URLs. Upserts — approval mints a `Vendor`, not a `VendorProfile`, so the first save is a create. |
| `GET /seller/profile/photos` | Kitchen photos, `sortOrder` ascending. |
| `POST /seller/profile/photos` | `{ url, caption?, kind? }`. `url` is what `POST /uploads?purpose=storefront` returned — the URL, never the key (M14's rule). `409` past 12 photos. |
| `PUT /seller/profile/photos/order` | `{ ids: string[] }` in display order. Scoped by `vendorId` in the update filter, so another kitchen's id matches nothing rather than reordering their gallery. Declared **above** `:id`. |
| `PATCH /seller/profile/photos/:id` | `{ caption?, kind?, sortOrder? }`. `404` for a photo the caller doesn't own. |
| `GET /seller/profile/blackouts` | **M16 (M2).** Days this kitchen is closed, including past ones — the seller's own record. |
| `POST /seller/profile/blackouts` | `{ date: "YYYY-MM-DD", reason? }`. Idempotent — marking the same day off twice updates the reason rather than 409ing. |
| `DELETE /seller/profile/blackouts/:id` | Scoped by `vendorId` in the filter, so another kitchen's id matches nothing rather than reopening their day. |
| `DELETE /seller/profile/photos/:id` | Removes the row and returns the remaining list. The file stays on disk — nothing deletes uploads yet (M14, see `docs/DEPLOY.md`). |

**Availability is three separate things, deliberately not merged**
(M16, M2): the weekly pattern (`VendorProfile.workingDays`), the
exceptions to it (`VendorBlackoutDate`), and how much notice is needed
(`VendorProfile.prepTimeMins`). A recurring blackout rule would collide
with `workingDays` and make "am I open on the 14th" answerable two ways.

**`PATCH /seller/profile` cannot set a verification flag.**
`fssaiVerified` / `identityVerified` / `addressVerified` are absent from
`UpdateSellerProfileDto`, and the global `ValidationPipe`'s
`forbidNonWhitelisted` turns an attempt into a `400
VALIDATION_ERROR: property fssaiVerified should not exist` rather than
silently dropping it. `SellerProfileService.updateOwn` additionally
assembles its Prisma payload field-by-field instead of spreading the DTO,
so a field added to that DTO later cannot reach a column by accident.

**Submitting a new `fssaiNumber` clears an existing verification**
(`fssaiVerified: false`, `verifiedAt: null`). A changed licence has not
been checked, and letting a badge survive an edit to the thing it
verifies would be the one route by which a seller could set their own
badge.

### Listings — maker only (`server/src/seller/listings.controller.ts`)

CRUD over `Product` rows where `vendorId === seller.vendorId`. No
`vendorId`/`id`/`slug`/`rating`/`reviewCount` field on the create/update
DTO — server-generated/derived, never client-set. Every price/stock field
(`WeightOption.price/mrp/stock`) is still caller-supplied here (unlike the
consumer-facing catalog) because this *is* the seller setting their own
prices — the money-safety rule elsewhere ("never trust a client price")
is specifically about a *buyer's* request not being trusted to set what
they pay, which doesn't apply to a seller pricing their own listing.

| Endpoint | Notes |
|---|---|
| `GET /seller/listings` | Mine, newest first. |
| `GET /seller/listings/:id` | Owner-scoped — `404` if it exists but isn't mine. |
| `POST /seller/listings` | Body mirrors `client/lib/api/seller.ts`'s `SellerListingInput`: `{ name, categoryId, occasionIds?, dietary?, description, isPackaged, isHamper?, kind?, shippingScope?, isSnack?, cashbackPct, tags?, imagePath?, weightOptions: [{sku,label,price,mrp,stock}], defaultWeightSku }`. **M20 section flags:** `kind` (`food\|craft`, default `food`) decides which vertical the listing appears in — `/gifts` is the catalogue filtered on `craft`. `shippingScope` (`local\|national`, default `local`) is deliberately *not* derived from `kind`: a `national` listing skips the delivery-radius gate entirely, and a kitchen posting pickles across India is a real case. `isSnack` (default `false`) adds it to the WhatsApp snacks menu without removing it from the shop. All three are optional so a pre-M20 client that sends none of them behaves exactly as before. Validates `categoryId`/`occasionIds` exist and every `weightOptions[].sku` is globally unique (`409` on clash — `WeightOption.sku` is a unique column) before inserting. `slug` is server-generated from `name` (+ a random suffix on collision). |
| `PATCH /seller/listings/:id` | Partial patch of the same shape. Supplying `weightOptions` replaces the full set (delete+recreate, inside a transaction) rather than merging. |
| `DELETE /seller/listings/:id` | `204`. `409` if the product is still referenced by an existing order/cart/wishlist/hamper line (FK-protected — mark unavailable instead of deleting a listing with order history). |

### Orders — maker only (`server/src/seller/orders.controller.ts`)

Orders containing at least one `OrderItem` whose `productId` belongs to
`seller.vendorId`.

| Endpoint | Notes |
|---|---|
| `GET /seller/orders` | Mine, newest first (any order with ≥1 of my items). **M37:** the payload is the seller-scoped projection, not the buyer's order — own line items only, `itemsSubtotal` (the caller's share, which is also the payout basis), own shipments/addresses, gift block, `paymentMethod`, and a `multiVendor` flag. The buyer's `userId`, the whole-order `subtotal`/`total`/`walletApplied`/`cashbackEarned` and the refund fields are **absent**: a participant in a shared order never sees the other kitchens' business. **Paged (M37):** `?page&pageSize` (default 50, max 100) → `{ items, page, pageSize, total }`. |
| `GET /seller/orders/:id` | Owner-scoped — `404` if the order exists but has none of my items. Same M37 projection as the list. |
| `POST /seller/orders/:id/advance` | Advances `placed → confirmed → packed → shipped → delivered` (one step per call). `409` if already `delivered`/`cancelled`/`returned`, or still `pending-payment` (can't fulfil an unpaid order). **M37 — graded multi-vendor guard:** on an order that also contains another vendor's items, any participant may still record `confirmed`/`packed` (their own prep), but `shipped`/`delivered` answer `403` — those are whole-order claims (`delivered` stamps `deliveredAt`, starts the return clock, and is every vendor's payout basis), so on a shared order they belong to `PATCH /admin/orders/:type/:id/status`. |

### Reviews — maker only (`server/src/seller/reviews.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /seller/reviews` | Reviews targeting my vendor (`targetType: "vendor"`) or any of my products (`targetType: "product"`), newest first. |
| `POST /seller/reviews/:id/reply` | Body: `{ body }`. Owner-scoped by the review's *target*, not a direct FK — `404` if the review targets a different vendor/product. Sets `sellerReplyBody`/`sellerReplyCreatedAt`. |

### Item availability (M12)

| Route | Who | Notes |
|---|---|---|
| `PATCH /seller/listings/:id/availability` | own HomeKrafter | Body `{ isAvailable }`. The HomeKrafter's own "am I making this today" switch. Separate from `PATCH /seller/listings/:id` so a toggle doesn't submit the whole item, and separate from admin `moderationStatus` — an item can be allowed and simply not being cooked. Buyers need both to pass. |
| `PATCH /seller/menu/:id/availability` | own HomeKrafter | Same, over a `Snack` (writes `Snack.available`). |

### Search (M15)

`GET /products`, `GET /vendors` and `GET /snacks` each accept an optional
`q` (trimmed, max 80 chars). The query is split on whitespace into at
most 6 terms; **every term has to match somewhere on the row (AND across
terms), in any of that entity's searchable fields (OR across fields)** —
so `mango pickle` narrows `mango` rather than widening it.

| Endpoint | Fields searched |
|---|---|
| `GET /products?q=` | `name`, `description`, its category's `name`, its vendor's `name` |
| `GET /vendors?q=` | `name`, `bio`, `area` |
| `GET /snacks?q=` | `name`, `description` |

`GET /products?q=` additionally floats rows whose **own name** matched
above rows that only matched on description/category/vendor, ahead of the
chosen `sort` — so `sort=price-asc` still orders by price within each of
those two tiers.

Matching is case-insensitive `contains` (`ILIKE`), not Postgres
full-text: FTS needs a `tsvector` column plus a refresh trigger, and
still loses on the partial words people type. Revisit at catalogue sizes
where a sequential scan hurts — see `docs/PRODUCTION-AUDIT.md` phase 4.

**There is no `GET /search`.** The client fans out to these three
endpoints in parallel (`client/lib/api/search.ts`), which reuses each
one's existing visibility rules — moderation status, HomeKrafter
availability, delivery radius — rather than keeping a fourth copy of "what
may a buyer see".

### Location filtering (M12)

`GET /products` and `GET /snacks` accept optional `lat` + `lng`. Supplied
together, results are limited to kitchens whose own `Vendor.deliveryRadiusKm`
reaches the buyer (haversine, `server/src/common/geo.ts`), and each item
carries `distanceKm` + `distanceLabel`. `GET /products` also takes
`sort=nearest` and `availableOnly=false` (portal/admin use, to include
paused items).

**Omitting them is a first-class case**, not an error: the visitor declined
the location prompt or hasn't picked an area, and the full catalogue is
returned rather than an empty page.

`POST /seller-applications` requires `specialties` and a placement — a
`pincode` since M36, or a legacy `area` — and accepts `deliveryRadiusKm`. The full current body is documented in the Seller
onboarding table above — **that table is the source of truth**; this
paragraph is a pointer, not a second spec.

**M19:** `area` also accepts `"other"` (with a required `areaLabel`) so
someone outside the tricity can register interest. Approval refuses any
area that does not resolve through `TRICITY_AREAS` — there is no longer a
`TRICITY_CENTRE` fallback, because it placed out-of-area kitchens at
Chandigarh's exact centre, ~0 km from every buyer and inside every
delivery radius.

### Bookings — any HomeKrafter (`server/src/seller/bookings.controller.ts`)

`LaundryBooking` rows where `partnerId === seller.id`.

| Endpoint | Notes |
|---|---|
| `GET /seller/bookings` | Mine, newest first. |
| `GET /seller/bookings/:id` | Owner-scoped. |
| `POST /seller/bookings/:id/advance` | Advances `scheduled → picked-up → in-progress → out-for-delivery → delivered`. `409` at a terminal status (`delivered`/`cancelled`). |

### Menu — any HomeKrafter (`server/src/seller/menu.controller.ts`)

CRUD over `Snack` rows where `sellerId === seller.id`. Same "seller sets
their own price" reasoning as Listings above.

| Endpoint | Notes |
|---|---|
| `GET /seller/menu` | Mine. |
| `GET /seller/menu/:id` | Owner-scoped. |
| `POST /seller/menu` | Body mirrors `SellerMenuInput`: `{ name, description, price, category, diet, imagePath?, available }`. |
| `PATCH /seller/menu/:id` | Partial patch. |
| `DELETE /seller/menu/:id` | `204`. `409` if still referenced by an existing snack-list/order line. |

### Snack orders — any HomeKrafter (`server/src/seller/snack-orders.controller.ts`)

`SnackOrder` rows where `sellerId === seller.id` — the WhatsApp-origin
inbound orders the M8.3a doc noted were seamed here.

| Endpoint | Notes |
|---|---|
| `GET /seller/snack-orders` | Mine, newest first. |
| `GET /seller/snack-orders/:id` | Owner-scoped. |
| `POST /seller/snack-orders/:id/advance` | Advances `received → accepted → out-for-delivery → delivered`. `409` once `delivered`. |

### Payouts — all 3 types (`server/src/seller/payouts.controller.ts`)

`Payout` is its own ledger row (not a `WalletTransaction`) per the
milestone brief — no money actually moves anywhere yet in M8.3b, this
only records the request; a real payout-provider integration (bank
transfer/Razorpay Payouts, and an admin "mark paid" action) is a later
seam (M8.3c/M9). Earnings are computed **server-side** from the seller's
own *delivered* records — maker: `Σ OrderItem.price × quantity` for items
on `vendorId === seller.vendorId` where `Order.status = "delivered"`;
laundry: `Σ LaundryBooking.estimatedTotal` where `partnerId ===
seller.id` and `status = "delivered"`; snack: `Σ SnackOrder.total` where
`sellerId === seller.id` and `status = "delivered"` — never a
client-submitted amount. "Pending balance" = that computed total minus
the sum of every `Payout` (paid + pending) already recorded for this
seller, floored at 0.

| Endpoint | Notes |
|---|---|
| `GET /seller/payouts` | `{ items: Payout[], summary: {totalPaid, totalPending, lifetimeEarned}, pendingBalance, commission }`. `items` = mine, newest `periodEnd` first. **M37:** each item carries `grossAmount`/`commissionAmount`/`commissionPct` (absent on pre-M37 rows, where `amount` was always gross); `commission` is `{ enabled, pct, grossPending, commissionOnPending, netPending }` — while `enabled` is false the figures are an estimate at the configured rate and `pendingBalance` stays gross; enabled, `pendingBalance` is the net a request would pay. |
| `POST /seller/payouts/request` | Computes the pending balance and inserts a new `status: "pending"` `Payout` (`periodStart` = the day after the latest existing payout's `periodEnd`, or the seller's `createdAt` if none; `periodEnd` = now). `400` if the pending balance is `≤ 0`. `409` if a `pending` payout already exists for this seller (one in flight at a time) — enforced under a `FOR UPDATE` lock on the `Seller` row (M21), so two simultaneous requests produce one payout and one `409`, not two payouts. `Idempotency-Key` is supported but does **not** cover this: it de-duplicates a repeat of one request, and a double-click sends two. No `sellerId`/amount field on the request at all — the strongest form of isolation here is that there's no id parameter through which to even attempt targeting another seller's payout. **M37:** the split is computed once here and stored on the row — `amount` is the payable figure (net while `commissionEnabled` is on, gross otherwise) and `grossAmount`/`commissionAmount`/`commissionPct` record the arithmetic; a disabled-era row reads gross/0/0. The pending balance subtracts `COALESCE(grossAmount, amount)` over prior payouts, so enabling the flag never double-counts commission already deducted. |

## Admin panel (M8.3c — real, `server/src/admin/`)

Every route under `/admin/*` is `@Roles('admin')` — a `consumer` or
`seller` token gets `403` (never even reaches a service method), verified
live for this milestone (see `README.md`'s walkthrough). Unlike
`SellerModule`, this surface is **deliberately unscoped**: every read
spans every user/seller/order/wallet, not filtered to the caller's own
resource (`assertAdmin`'s framing in `ownership.util.ts`). Because of
that, **every mutation writes an `AdminAuditLog` row** (actor, action,
target type/id, JSON metadata) after it succeeds — see "Audit log" below.
Money actions (order refund, wallet adjust/refund) funnel through
`WalletService`'s row-locked ledger primitives — `AdminOrdersService.refund`
calls `OrdersService.refundOrder` directly for marketplace orders (the
same admin-gated method `POST /orders/:id/refund` already exposes) rather
than re-implementing it; `AdminWalletService.adjust`/`issueRefund` call
`WalletService.adjust`/`postLedgerEntryTx` — **never a raw
`prisma.wallet.update({ data: { balance } })`**.

### Dashboard + analytics (`server/src/admin/dashboard.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /admin/dashboard` | `{ gmvTotal, ordersTodayCount, ordersTotalCount, ordersByType: {marketplace,laundry,snack}, activeSellersByType: {maker,laundry,snack}, usersCount, pendingApplicationsCount, pendingPayoutsAmount, walletLiability }` — real server-side aggregates (`Seller.groupBy`, `Payout`/`Wallet` `aggregate`), not client-computed sums. |
| `GET /admin/analytics` | `{ gmvSeries: [{date,gmv,orderCount}] (last 14 days), ordersByType, topSellers: [{key,name,type,orderCount,revenue}] (top 6), topProducts: [{productId,name,unitsOrdered,revenue}] (top 6), newUsersByMonth: [{month,count}], walletFlow: {creditsTotal,debitsTotal,netFlow,byCategory} }`. |

### Users (`server/src/admin/users.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /admin/users` | One page of accounts, newest first: `{ items, page, pageSize, total }`. Query: `role` (`consumer\|seller\|admin`), `status` (`active\|suspended`), `q` (matches name, email or phone, case-insensitive), `page`, `pageSize` (default 25, max 100). **M23: this used to return every account on the platform** — the one query that grows with the whole customer base — and the screen filtered it in the browser. |
| `GET /admin/users/:id` | Single user detail. |
| `PATCH /admin/users/:id` | Body: `{ suspended: boolean }`. Sets `User.suspended` — the same flag `AuthService` already gates login/OTP/social/refresh on, so a suspended user's next auth attempt is rejected `401` immediately (an already-issued access token still expires naturally on its own short TTL). Audited (`user.suspend`/`user.reactivate`). |

**CSV exports neutralise spreadsheet formulas (M16).** A field beginning
`=`, `+`, `-`, `@`, tab or CR is executed as a formula by Excel, Sheets
and LibreOffice — so a HomeKrafter naming their shop `=cmd|'/c calc'!A1`
would get it run on the machine of whoever opens the export. Every value
goes through `csvCell`, which quotes it, doubles interior quotes and
prefixes a leading formula character with `'`. Applied at the single
point every export passes through, so it cannot be forgotten per-column.
(Visible on real data: a phone number exports as `'+919008033445`.)

**`commissionPct` is modelling only.** `Payout` amounts are gross and
settlement happens by hand, so nothing deducts it. It exists because
"what would a 12% take rate have earned last quarter" has to be
answerable before the business can set one — and every surface that
renders it says so.

### Sellers + the onboarding approval queue (`server/src/admin/sellers.controller.ts`)

Closes the `/sell` → admin → seller-access loop: a pending
`SellerApplication` becomes an active `Seller` (+ `Vendor` storefront)
once approved. Static `applications*` routes are declared before the
dynamic `:id` ones, same reasoning as `OrdersController`. The *create*
side of an application — `POST /seller-applications`, public, **M9** —
lives in its own top-level module (`server/src/seller-applications/`),
documented in "Seller applications (M9)" above; this controller only
ever reads/decides on rows it didn't create.

| Endpoint | Notes |
|---|---|
| `GET /admin/sellers` | One page: `{ items, page, pageSize, total }`. Query: `specialty` (a single `SellerSpecialty`, matched with `has` — a HomeKrafter with several appears under each), `q` (display name or storefront name), `onboarding` (**M32**: `no_credentials` = no password at all, so no way in exists yet — every HomeKrafter approved before M32; `awaiting` = issued sign-in details never used; `onboarded` = chose their own password), `page`, `pageSize` (default 25, max 100). Every seller (any type/status), newest first. **M32:** each item carries `signIn: { status, username, issuedAt, claimedAt }` with `status` one of the three above — `mustChangePassword` alone cannot tell "chose their own password" from "was never given one", and both read `false`. **M37:** `temporaryPassword` is gone from this payload (and from the column behind it): the plaintext exists only in the response of the issue/approve call itself, so the directory no longer ships every un-onboarded kitchen's live password in one body. Admin-only — it appears on no buyer-facing payload. |
| `GET /admin/sellers/:id/detail` | **M32.** Everything about one HomeKrafter on one screen — `{ seller, vendor, contact, signIn, activity, application }`. `contact` carries email and phone (admin-only: reaching a kitchen by phone is the whole onboarding path while no provider key is set). `activity.revenue` is their **line-item share**, never the order total. `application` is the row they were approved on, matched by email, and is absent for a kitchen created by hand. |
| `GET /admin/sellers/:id` | Single seller detail. |
| `PATCH /admin/sellers/:id/status` | Body: `{ status: "approved" \| "suspended" }` — suspend an active seller or reactivate a suspended one. Audited (`seller.suspend`/`seller.reactivate`). |
| `GET /admin/settings` | **M16 (M5).** `{ commissionPct, commissionEnabled, defaultDeliveryRadiusKm, servicedPincodePrefixes, menuLockTime }`. **M37** added `commissionEnabled` (default **false**, strict `'true'` parse — anything else reads as off, the direction that fails safe for money): whether payout requests actually deduct `commissionPct`. While off the rate drives estimates only. **M36** added `servicedPincodePrefixes` — comma-separated pincode prefixes Homekrafted currently *delivers* to (`"160,1401,1403,1341,1346"` is the Chandigarh tricity). It is the launch gate and it is **buyer-facing only**: it must never gate an application, an approval, or a HomeKrafter's portal, or the pre-M36 waitlist is back under a new name. It **fails open** — an empty or missing value means no gate, because an empty catalogue cannot be told apart from a broken site by the visitor or by us. A malformed prefix is refused on write (where it can be reported) while the reader silently drops junk. Missing rows fall back to defaults, so a database that has never had a setting written behaves exactly like the constants it replaced. `hamperBuilderEnabled` was removed in M18 with the builder it gated; a stale row is ignored rather than surfaced. |
| `PATCH /admin/settings` | Partial. Commission 0–100%, radius 1–100 km, `menuLockTime` a 24-hour `HH:MM` (M37 — when a delivery date's meal menu and its skip close, IST, the evening before; default `20:00`), validated in the DTO **and** the service — a take rate over 100% is a typo, not a setting, and that boundary shouldn't depend on which door the value came through. Audited (`platform_settings.update`) with before/after. |
| `GET /settings/public` | **M17. Public — no auth.** The allowlisted subset, built by **picking** keys (`PUBLIC_SETTING_KEYS`), never by deleting them: a new setting is private until it is named there, which is the direction that fails safe. The commission rate is a commercial term and never appears here. **Empty since M18** — its only entry was `hamperBuilderEnabled` — so the endpoint and its allowlist stand as the seam a future public setting goes through. `Cache-Control: public, max-age=60`. |
| `GET /admin/exports/:kind` | **M16 (M5).** `orders` \| `sellers` \| `payouts`, optional `?days=`. Returns a real `text/csv` download with a UTF-8 BOM (so Excel on Windows reads a HomeKrafter's name rather than mangling it) — not JSON the client turns into a Blob, so an accountant can be sent a URL. **Any other `kind` is a `400` naming the valid ones** (audit 2026-08-06: the `switch` had no `default`, so it returned `undefined`, the caller destructured `{ filename }` off it, and a mistyped URL became a 500 that quoted the internal error). |
| `GET /admin/analytics?days=` | **M16 (M5)** adds the range (was pinned at 14 days), clamped 1–365 and echoed back, plus `commissionPct` and `modelledCommission`. |
| `GET /admin/sellers/:id/profile` | **M16.** The seller's own profile view plus `sellerId`/`vendorId`/`vendorSlug`/`displayName` — including the submitted `fssaiNumber`, which an admin has to read in order to check it and which the public storefront never publishes. |
| `PATCH /admin/sellers/:id/verification` | **M16.** Body: any of `{ identityVerified?, addressVerified?, fssaiVerified?, fssaiExpiry?, note? }`. **The only write path to the verification badge** — see the `/seller/profile` section for why. Every field optional, so identity can be verified today and the licence next week without clearing what was already checked. Stamps `verifiedAt` on any decision including a revocation ("when was this last looked at", not "when was it approved"), notifies the HomeKrafter with the granted/withdrawn list plus the note, and audits `seller.verification` with the full before/after flag state. |
| `GET /admin/sellers/applications` | Every `SellerApplication`, any status (`?status=pending` narrows to the queue — every status short of the two terminal ones). **M32:** each item carries `existingSeller: { id, displayName, status, since }` when that email already has a HomeKrafter account — `approveApplication` has refused those since M19, and the queue now says so before the click. |
| `POST /admin/sellers/applications/:id/approve` | `409` if already `approved`/`rejected`. Otherwise, **one atomic transaction**: (1) finds-or-creates the applicant's `User` account (reuses an existing account by email if one exists, upgrading `consumer` → `seller`; otherwise mints a fresh `role: "seller"` account with `authProviders: ["phone"]` and no password — phone-OTP is its login path — plus a `Wallet` + `LoyaltyAccount`, same recipe `AuthService.verifyOtp`'s first-time-phone signup uses); (2) creates a `Vendor` storefront from the application's business details (`SellerApplicationCategory` → `VendorType`, `"other"` → `"maker"`); (3) creates the `Seller` row (`type: "maker"`, `status: "approved"`) pointing at it; (4) marks the application `approved`. Unlike the M11a frontend mock (which pointed `Seller.userId` at a synthetic placeholder id), this is a real FK — a live `User` row must exist, so one is provisioned right here. Returns `{ application, seller, vendor, invite, signIn }`. Audited (`seller_application.approve`). **M32:** the account is now created *with* an issued password (`mustChangePassword: true`), not none — see `POST /admin/sellers/:id/temp-password`. |
| `POST /admin/sellers/applications/:id/reject` | `409` if already `approved`/`rejected`. Audited (`seller_application.reject`). |
| `POST /admin/sellers/:id/temp-password` | admin | **M32, show-once since M37.** Issues a temporary password for an approved HomeKrafter and returns `{ email, phone, displayName, temporaryPassword }` — **the only place the plaintext ever exists**. Only the argon2 hash is stored; a lost password is re-issued (which revokes the old one and every live session), never re-read. Sets `mustChangePassword`, so the value is force-rotated at first sign-in. Never written to the audit row. `409` if the seller is not approved or is suspended. Also called automatically by approve. |
| `POST /admin/sellers/:id/resend-invite` | admin | Re-sends an approved HomeKrafter's sign-in link and **burns the previous one**. The remedy for "the approval email never arrived", which is otherwise unfixable now that a duplicate application is refused. `409` if the seller isn't approved, or if the account is suspended — a re-send must not be a way back into an account an admin has closed. Returns the same `invite` report. |

### Catalog + review moderation (`server/src/admin/catalog.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /admin/catalog/products` | One page of the queue: `{ items, page, pageSize, total, pendingCount }`. Query: `status` (`pending\|active\|rejected\|hidden\|flagged\|featured`), `vendorId`, `q` (listing/kitchen/category name), `page`, `pageSize` (default 25, max 100). **`pendingCount` is platform-wide and never narrowed by the filter or the page** — a queue badge reading zero because the admin is looking at "hidden" is how a HomeKrafter waits a week. Every product, any vendor, including pending/rejected/hidden/flagged ones (unlike the public `GET /products`), each annotated with `vendorName`/`categoryName`. **The review queue (M22): `pending` first, oldest `submittedAt` first**, everything else newest-first behind it. |
| `GET /admin/catalog/products/:id` | Single product detail. |
| `PATCH /admin/catalog/products/:id/moderate` | Body: `{ action: "approve"\|"reject"\|"hide"\|"unhide"\|"flag"\|"unflag"\|"takedown"\|"feature"\|"unfeature", reason?: string }`. **M22:** `approve` resolves a `pending` listing *and* restores a hidden/flagged one (both write `active`); `reject` writes `rejected`. **`reason` is required (min 10 chars) on `reject`/`hide`/`takedown`/`flag`** — 400 without it — and is stored on `Product.moderationNote`, shown verbatim to the HomeKrafter and sent to them by every channel their `account` preferences allow. An allowing action clears the note. `feature`/`unfeature` toggle `Product.featured` only and deliberately leave the note and decision stamp alone. Every status change also stamps `moderatedById`/`moderatedAt`. Audited (`product.<action>`) with `{ from, to, reason }`. |
| `GET /admin/catalog/queue` | **M28.** Everything awaiting review across **all three** catalogue tables — `Product`, `Snack`, `MealPlan` — oldest submission first, with `{ kind, id, name, makerName, submittedAt, imageSrc?, editHref? }` per item plus `total` and `counts` per kind. Deliberately unpaginated and capped at 200: it is the actionable backlog, not an archive, and paginating a union of three differently-sorted tables buys correctness problems to solve a problem that does not exist yet. `total` is counted separately so a truncated response still reports the real depth. |
| `PATCH /admin/catalog/snacks/:id/moderate` | **M28.** Same body and same rules as the product route above, including the required `reason` on a refusal, stored on `Snack.moderationNote` and sent to the HomeKrafter verbatim. `feature`/`unfeature` 400 — a snack has no merchandising flag. Audited (`snack.<action>`). **Why this did not exist:** M22 applied the review gate to `Product`, `Snack` and `MealPlan` but built the admin half for `Product` alone, so a snack created after M22 sat `pending` forever with no endpoint able to approve it and no screen listing it. |
| `PATCH /admin/catalog/meal-plans/:id/moderate` | **M28.** As above, for `MealPlan`. Audited (`mealPlan.<action>`). |
| `PUT /admin/catalog/meal-plans/:id/menus/:date` | **M37.** The emergency door past the menu lock — same write as the seller route with `enforceLock` off. Audited (`meal_plan.menu_override`, before/after lines in metadata) and it **still notifies** the subscribers scheduled for the date: the lock exists to stop silent changes, not to stop people being told. |
| `GET /admin/catalog/reviews` | One page (`?page&pageSize`, default 50, max 100 — M37) of reviews, any target, newest first, each annotated with `targetName` (product/vendor/service name). Returns `{ items, page, pageSize, total }`. |
| `PATCH /admin/catalog/reviews/:id/moderate` | Body: `{ hidden: boolean }`. Same `Review.hidden` flag `ReviewsService.list` already filters on. Doesn't clear `flagged` on unhide (an audit trail of why it was hidden). Audited (`review.hide`/`review.unhide`). |

### Orders oversight (`server/src/admin/orders.controller.ts`)

Unifies marketplace `Order`s, `LaundryBooking`s and `SnackOrder`s into
one list/detail surface, unscoped — `id` is `${type}:${the underlying
record's id}`.

| Endpoint | Notes |
|---|---|
| `GET /admin/orders` | One page of every order/booking/snack-order, newest first: `{ items, page, pageSize, total }`. Query: `type` (`marketplace\|laundry\|snack`), `q` (matches reference, customer name or HomeKrafter name, case-insensitive), `page` (capped at 40), `pageSize` (default 25, max 100). **M23: this used to return all three tables in full, and the screen searched them in the browser** — which stops working the moment the response is a page, so `q` is now the server's job. |
| `GET /admin/orders/:type/:id` | Full record (line items included) — `400` for an invalid `:type`. |
| `GET /admin/orders/:type/:id/summary` | **M26.** The one unified *list row* for this order — the detail screen's header, which needs the customer and HomeKrafter names that the source table does not carry. Built by the same per-type row builders `GET /admin/orders` uses, so a summary can never disagree with the row it was reached from. `404` for an unknown id, `400` for an invalid `:type`. Exists because the client used to resolve this by fetching page 1 of the list and searching it in the browser: any order with 25 newer siblings rendered "Order not found." on a screen that also holds the refund control. **M27** adds `statusOptions: string[]` — the statuses this kind may be overridden to, server-derived, so the client keeps no copy of the status tables. Named `statusOptions` and not `allowedStatuses` on purpose: the maps carry no transition rules, so "allowed" would be a claim the server does not check. |
| `POST /admin/orders/:type/:id/refund` | `marketplace` delegates straight to `OrdersService.refundOrder` (idempotent via `refundStatus`). `laundry` credits the booking owner's wallet via `WalletService`'s ledger primitives directly (`category: "refund"`, `refType: "laundryBooking"`) — idempotent-by-content (a prior refund `WalletTransaction` for this exact booking short-circuits to a no-op), since `LaundryBooking` has no `refundStatus` field to flip. `snack` is `400` — a `SnackOrder` has no `userId`/wallet to credit (WhatsApp-origin, no registered account). Supports `Idempotency-Key`. Audited (`order.refund`). |
| `PATCH /admin/orders/:type/:id/status` | Body: `{ status }` (frontend-hyphenated form, e.g. `"out-for-delivery"`). A manual override distinct from a seller's one-step-at-a-time `advance` — jumps straight to any valid status for the type. `400` for a status not valid for that type. Audited (`order.status_override`). |

### Wallet oversight (`server/src/admin/wallet.controller.ts`)

| Endpoint | Notes |
|---|---|
| `GET /admin/wallet` | Platform-wide totals plus one page of per-user balances: `{ totalLiability, walletCount, totalLifetimeSaved, balances, page, pageSize, total }`. Query: `page`, `pageSize` (default 25, max 100). **The three totals are aggregates over every wallet and are never narrowed by the page** — a liability figure that only totalled the rows on screen would quietly mean something else. `{ totalLiability, walletCount, totalLifetimeSaved, balances: [{userId,userName,walletId,balance,pendingCashback,lifetimeSaved,transactionCount}] }` — every wallet, balance descending. |
| `GET /admin/wallet/:userId` | The wallet plus one cursor page of its ledger: `{ wallet, transactions, nextCursor }`. Query: `limit` (default 50, max 100), `cursor`. Cursor rather than offset — a ledger grows at the end being read from. `{ wallet, transactions }` for one user. |
| `POST /admin/wallet/:userId/adjust` | Body: `{ direction: "credit"\|"debit", amount, reason }`. Forwards straight into `WalletService.adjust` (the same method `POST /wallet/adjust` already exposes) with `userId` from the route, not the body. Response: `{ wallet, balanceAfter, transactionId }` — **`transactionId` added in M9**, closing the M8.4b-flagged shape gap (`client/lib/api/admin.ts` no longer synthesizes a fake id). Supports `Idempotency-Key`. Audited (`wallet.adjust`). **M9**: also fires a `"wallet"`-category notification to the affected user via `NotificationsDeliveryService` (see "Notification delivery (M9)" above). |
| `POST /admin/wallet/:userId/refund` | Body: `{ amount, title, refType?, refId? }`. A standalone refund credit not necessarily tied to an `Order`. **Never use it to refund an order** — it sets no `refundStatus`, so nothing stops the same order being refunded again, and callers routinely omitted `Idempotency-Key`; `/admin/orders/[type]/[id]` did exactly this until M26 and would credit three times for three clicks. `POST /admin/orders/marketplace/:id/refund` is the order path: it reads the amount off the order, flips `refundStatus`, and refuses an unpaid one. Goes through `WalletService.postLedgerEntryTx` inside an idempotency-wrapped transaction — never a raw balance write. Response also includes `transactionId` (M9). Supports `Idempotency-Key`. Audited (`wallet.refund`). **M9**: also fires a `"wallet"`-category notification, same as `adjust` above. |

### Collections & CMS (`server/src/admin/collections.controller.ts`)

`Collection` CRUD — title/description/occasion + ordered product
membership (`CollectionProduct.sortOrder`, delete+recreate on every
save — reordering is just re-submitting `productIds` in the new order).

| Endpoint | Notes |
|---|---|
| `GET /admin/collections` | Every collection. |
| `GET /admin/collections/:id` | Single collection detail. |
| `POST /admin/collections` | Body: `{ title, description?, occasionId?, productIds }`. `404` if any `productId`/`occasionId` doesn't exist. Server-generates `slug`. Audited (`collection.create`). |
| `GET /admin/collections/occasions` | **M16.** Every `Occasion`. **Declared above `:id`** — the reverse would resolve it to a collection whose id is literally "occasions". |
| `PATCH /admin/collections/occasions/:id` | **M16.** Body: `{ celebratedOn?, clearCelebratedOn?, tagline?, imageSrc? }`. `clearCelebratedOn: true` returns an occasion to evergreen — an omitted optional field means "leave it alone" everywhere else here, so a passed occasion needs an explicit way back rather than a sentinel date. Audited (`occasion.update`) with the previous date. |
| `PATCH /admin/collections/:id` | Same body shape — full replace, not a partial patch (mirrors `client/lib/api/admin.ts#upsertCollection`). Audited (`collection.update`). |
| `DELETE /admin/collections/:id` | `204`. Audited (`collection.delete`). |



### Support / disputes (M15) — `server/src/admin/support.controller.ts`

`SupportTicket`/`SupportMessage` and the customer-facing
`/support/tickets` endpoints shipped in M7b/M8.3a, and
`SupportService.addMessage` carried a comment reserving `sender: "agent"`
for "the M11 support-queue surface, not built yet". It was never built:
tickets were written and **nothing on the platform could read them**.
Until M15 that was also the *only* remedy a buyer had, since there was no
cancel or return path either.

| Endpoint | Notes |
|---|---|
| `GET /admin/support/tickets` | One page of the queue: `{ items, page, pageSize, total, summary: { open, inProgress, awaitingReply } }`, newest activity first. Query: `status` (`open\|in-progress\|resolved\|closed`), `page`, `pageSize` (default 25, max 100). **`summary` counts the whole queue, never the filter or the page** — derived from the loaded rows it reported nobody waiting the moment an admin clicked "Resolved". Each item adds the customer's name/email/phone, `lastMessageAt`, and `awaitingReply` (the newest message came from the customer). |
| `GET /admin/support/tickets/:id` | One ticket with its full thread. |
| `POST /admin/support/tickets/:id/messages` | Body: `{ body }`. Posts as `sender: "agent"` and moves an `open` ticket to `in-progress` in the same write — a ticket someone has answered is not still untouched, and making an agent set that by hand guarantees the queue lies. Audited (`support.reply`), notifies the customer. |
| `PATCH /admin/support/tickets/:id/status` | Body: `{ status }` (hyphenated frontend form). Audited (`support.status`). Resolving notifies the customer — "we consider this done" is a claim they may want to argue with. |

**`awaitingReply` is the number that matters** on this queue, not the
status counts: status labels drift, "the customer wrote last" doesn't. It
excludes `resolved`/`closed`, which is only safe because **a customer
writing back on a resolved ticket reopens it** (`SupportService.addMessage`,
M15) — otherwise "that didn't actually fix it" would land in a bucket the
queue treats as done.

### Payouts (M15) — `server/src/admin/payouts.controller.ts`

The other end of `POST /seller/payouts/request`. Between M8.3b and M15 a
HomeKrafter could request a payout and **nothing on the platform could
act on it** — no endpoint, no screen, no transition out of `pending`.
Earnings accrued from delivered orders and had no way to leave.

| Endpoint | Notes |
|---|---|
| `GET /admin/payouts` | One page: `{ items, page, pageSize, total, summary: { pendingCount, pendingTotal, paidTotal } }`. Query: `status`, `page`, `pageSize` (default 25, max 100). **`summary` counts every payout, never the page or the filter** — reduced over the loaded rows it reported nothing pending the moment an admin clicked "Paid". Optional `?status=pending\|paid\|rejected`. Returns `{ items, summary: { pendingCount, pendingTotal, paidTotal } }`. Pending sorts first regardless of the filter — this screen is a queue. Each item carries the HomeKrafter's display name, storefront name and contact — and (M37) the row's own `grossAmount`/`commissionAmount`/`commissionPct` when set, absent on pre-M37 rows whose `amount` was always gross. |
| `GET /admin/payouts/:id` | One payout. |
| `POST /admin/payouts/:id/pay` | Body: `{ reference?, note? }`. Sets `paid` + `paidAt` + `decidedById`/`decidedAt`. Audited (`payout.paid`) and notified to the HomeKrafter. Applied as a conditional update with `status: 'pending'` in the WHERE clause (M21), so of two admins deciding the same payout at once exactly one wins and the other gets a `409` naming the outcome that won — the loser must never overwrite `reference`, which is the only link to a transfer that happened outside this system. |
| `POST /admin/payouts/:id/reject` | Body: `{ note }` (5–500 chars, **required**). Sets `rejected`. Audited (`payout.rejected`) and notified. Same conditional update and same `409` as `/pay` — a rejection must not be able to overwrite a settlement that raced it. |

**Marking paid records a settlement; it does not perform one.** There is
no payout-provider integration (bank transfer / Razorpay Payouts). An
admin transfers out of band and stores the bank/UPI `reference`, which is
the only link between this row and a real transfer — and what a
HomeKrafter quotes when the money hasn't arrived. Implying a transfer the
system never made would be worse than the honest ledger.

**Both decisions are one-way** (`409` on a second call). Re-deciding a
settled payout would let an admin rewrite a row asserting that real money
moved; the fix for a mistake is a new payout, which leaves both facts on
record.

`PayoutStatus` gains `rejected`. Refusal needs to be expressible — wrong
bank details, an account under review — without deleting the request and
losing the record that it was made. The reason is shown to the
HomeKrafter on `/seller/payouts`: a refusal with no explanation is worse
than one that never happened.

### Audit log (`server/src/admin/audit.controller.ts`)

`AdminAuditLog` — one row per admin **mutation** across every controller
above (never a read), written *after* the mutation succeeds so a
rejected/rolled-back action never leaves a misleading row. Not FK-bound
to its target (`targetType`/`targetId` is a loose pointer, since one log
table spans many unrelated target tables) — a dangling reference should
never block writing the log itself.

| Endpoint | Notes |
|---|---|
| `GET /admin/audit` | `?targetType=&actorId=&page=&pageSize=` all optional. `{ items: [{id,actorId,actorName,actorEmail,action,targetType,targetId,metadata,createdAt}], page, pageSize, total, targetTypes }`, newest first. **M27** adds `targetTypes` — the distinct entity kinds actually present, unfiltered, so the UI filter's options come from the data instead of a hand-typed list of Prisma model names that goes stale the first time a new kind is logged. Read by `/admin/audit`, which shipped in M27; note the filters there are exactly these two plus pagination — action and date filters were **not** faked client-side over one page, which would lie on the one screen whose job is completeness. |

## Health

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | public, unprefixed | `{ status: "ok", timestamp }` — liveness only |
| `GET /health/db` | public, unprefixed | `{ status: "ok", database: "connected" }` — pings Postgres via Prisma |

## Products & catalog — `lib/api/products.ts`, `lib/api/catalog.ts`

**Real as of M8.1** — see "Commerce (M8.1)" above for the actual request/
response shape (filters, sort, pagination). This table is kept as the
`lib/api` function → endpoint mapping for M8.4's swap; note `category`/
`occasion` filter by **slug**, not id (`?category=pickles`, not
`?category=ct1`) — the "Future endpoint" column below predates that
decision and is superseded by the table above.

| Function | Returns | Real endpoint |
|---|---|---|
| `getProducts()` | `Product[]` | `GET /api/v1/products` |
| `getProduct(slug)` | `Product \| undefined` | `GET /api/v1/products/:slug` |
| `getFeatured()` | `Product[]` | `GET /api/v1/products?featured=true` |
| `getProductsByCategory(categoryId)` | `Product[]` | `GET /api/v1/products?category=:slug` |
| `getProductsByOccasion(occasionId)` | `Product[]` | `GET /api/v1/products?occasion=:slug` |
| `getProductsByVendor(vendorId)` | `Product[]` | `GET /api/v1/vendors/:slug/products` |
| `getCategories()` | `Category[]` | `GET /api/v1/categories` |
| `getCategory(slug)` | `Category \| undefined` | `GET /api/v1/categories/:slug` |
| `getOccasions()` | `Occasion[]` | `GET /api/v1/occasions` |
| `getOccasion(slug)` | `Occasion \| undefined` | `GET /api/v1/occasions/:slug` |
| `getCollections()` | `Collection[]` | `GET /api/v1/collections` |
| `getCollection(slug)` | `Collection \| undefined` | `GET /api/v1/collections/:slug` |

## Vendors — `lib/api/vendors.ts`

**Real as of M8.1** — see "Commerce (M8.1)" above.

| Function | Returns | Real endpoint |
|---|---|---|
| `getVendors()` | `Vendor[]` | `GET /api/v1/vendors` |
| `getVendor(slug)` | `Vendor \| undefined` | `GET /api/v1/vendors/:slug` |

## Snacks — `lib/api/snacks.ts`

**Real as of M8.3a** (menu reads only) — see "Services (M8.3a)" above.

| Function | Returns | Real endpoint |
|---|---|---|
| `getSnacks()` | `Snack[]` | `GET /api/v1/snacks` |
| `getSnack(slug)` | `Snack \| undefined` | `GET /api/v1/snacks/:slug` |
| `getSnackList()` | `SnackList` | Still mock/no-endpoint — a `SnackList` never becomes a server-side entity, it formats a `wa.me` message client-side (`lib/channel.ts`). |

## Laundry — `lib/api/laundry.ts`

**Real as of M8.3a** — see "Services (M8.3a)" above for the full contract
(server-authoritative pricing, wallet-pay via the M8.2 ledger, subscription
CRUD).

| Function | Returns | Real endpoint |
|---|---|---|
| `getLaundryServices()` | `LaundryService[]` | `GET /api/v1/laundry/services` |
| `getLaundryService(slug)` | `LaundryService \| undefined` | `GET /api/v1/laundry/services/:slug` |
| `getLaundryDays()` | `LaundryDay[]` | `GET /api/v1/laundry/availability/days` |
| `getLaundrySlots()` | `LaundrySlot[]` | `GET /api/v1/laundry/availability/slots` |
| `getLaundryHowItWorks()` | `LaundryHowItWorksStep[]` | static copy — stays client-side content, not an endpoint |
| `getLaundrySubscriptionPlanOptions()` | `LaundrySubscriptionPlanOption[]` | static copy (weekly/biweekly/monthly labels+hints) — stays client-side content, not an endpoint |
| `createBooking(input)` | `LaundryBooking` | `POST /api/v1/laundry/bookings` — server-priced (see "Services (M8.3a)"), starts `status: "scheduled"` |
| `createSubscription(input)` | `LaundrySubscription` | `POST /api/v1/laundry/subscriptions` |

`LaundryBookingClient`'s call sites swap at **M8.4** without changing
shape — the DTO's field names were chosen to match the mock's
`CreateBookingInput`/`CreateSubscriptionInput` as closely as an
owner-scoped, server-priced endpoint allows (see "Services (M8.3a)" for
the one flattening: `slot: {day, slotId}` → `slotDay`/`slotId` on the
subscription DTOs).

## Seller portal — `lib/api/seller.ts`

**Real as of M8.3b** — see "Seller portal (M8.3b)" above for the full
contract. The mock's every function signature took the caller's own
`vendorId`/`sellerId` as an explicit argument (documented there as "M8
must re-derive this from the verified server session instead of trusting
a client-passed id" — now done: none of the real endpoints below accept
one at all, it's always resolved from the JWT).

| Function | Returns | Real endpoint |
|---|---|---|
| `getSeller(sellerId)` / `getSellerVendor(vendorId)` | `Seller \| undefined` / `Vendor \| undefined` | No longer separate lookups — `GET /seller/dashboard` resolves the caller's own seller+vendor server-side; `GET /seller/storefront` returns the vendor directly. |
| `getSellerListings(vendorId)` / `getSellerListing(vendorId, id)` | `Product[]` / `Product \| undefined` | `GET /seller/listings` / `GET /seller/listings/:id` |
| `createSellerListing(vendorId, input)` | `Product` | `POST /seller/listings` |
| `updateSellerListing(vendorId, id, input)` | `Product \| undefined` | `PATCH /seller/listings/:id` |
| `deleteSellerListing(vendorId, id)` | `void` | `DELETE /seller/listings/:id` |
| `getSellerOrders(vendorId)` / `getSellerOrder(vendorId, id)` | `Order[]` / `Order \| undefined` | `GET /seller/orders` / `GET /seller/orders/:id` |
| `advanceSellerOrderStatus(orderId)` | `Order \| undefined` | `POST /seller/orders/:id/advance` — **shape change**: the mock took a bare `orderId`; the real endpoint is owner-scoped by the caller's JWT, no vendor id needed on the call at all. |
| `getSellerDashboard(seller)` | `SellerDashboardSnapshot` | `GET /seller/dashboard` |
| `getSellerPayouts(sellerId)` / `getSellerEarningsSummary(sellerId)` | `Payout[]` / `SellerEarningsSummary` | Merged into one call: `GET /seller/payouts` → `{ items, summary, pendingBalance }`. |
| `requestSellerPayout(sellerId, amount)` | `Payout` | `POST /seller/payouts/request` — **shape change**: no `amount` param anymore, the real endpoint computes it server-side (never trust a client-submitted payout amount). |
| `getSellerReviews(vendorId)` | `Review[]` | `GET /seller/reviews` |
| `replySellerReview(reviewId, body)` | `Review \| undefined` | `POST /seller/reviews/:id/reply` |
| `updateSellerSpecialties(specialties)` | `SellerSpecialty[] \| undefined` | `PATCH /seller/specialties` — **M33.** What the signed-in HomeKrafter makes, rewritten from `/seller/profile`. |
| `updateSellerStorefront(vendorId, input)` | `Vendor \| undefined` | `PATCH /seller/storefront` — **fixes a flagged mock limitation**: the mock's doc comment noted a storefront edit never reached the server-rendered `/storefront/[vendor]` page because both sides mutated separate in-memory module instances; the real endpoint writes the DB row every render reads from, so this is now a real fix, not just documented as one. |
| `getPartnerBookings(partnerId)` / `getPartnerBooking(partnerId, id)` | `LaundryBooking[]` / `LaundryBooking \| undefined` | `GET /seller/bookings` / `GET /seller/bookings/:id` |
| `advancePartnerBookingStatus(bookingId)` | `LaundryBooking \| undefined` | `POST /seller/bookings/:id/advance` |
| `updatePartnerBookingSlots(bookingId, input)` | `LaundryBooking \| undefined` | Not built in M8.3b (not in the brief's scope) — still mock-only. |
| `getPartnerDashboard(seller)` | `PartnerDashboardSnapshot` | `GET /seller/dashboard` (laundry-type shape) |
| `getSellerMenu(sellerId)` / `getSellerMenuItem(sellerId, id)` | `Snack[]` / `Snack \| undefined` | `GET /seller/menu` / `GET /seller/menu/:id` |
| `createSellerMenuItem(sellerId, input)` | `Snack` | `POST /seller/menu` |
| `updateSellerMenuItem(sellerId, id, input)` | `Snack \| undefined` | `PATCH /seller/menu/:id` |
| `deleteSellerMenuItem(sellerId, id)` | `void` | `DELETE /seller/menu/:id` |
| `getSnackOrders(sellerId)` / `getSnackOrder(sellerId, id)` | `SnackOrder[]` / `SnackOrder \| undefined` | `GET /seller/snack-orders` / `GET /seller/snack-orders/:id` |
| `getAllSnackOrders()` | `SnackOrder[]` | Admin-only, unscoped — stays mock until **M8.3c**. |
| `advanceSnackOrderStatus(orderId)` | `SnackOrder \| undefined` | `POST /seller/snack-orders/:id/advance` |
| `getSnackDashboard(seller)` | `SnackDashboardSnapshot` | `GET /seller/dashboard` (snack-type shape) |

Every `SellerShell`/seller-screen call site in `client/app/seller/**` and
`client/components/seller/**` swaps its `lib/api/seller.ts` import target
at **M8.4** — the function names above are kept 1:1 so call sites mostly
just drop the now-unnecessary `vendorId`/`sellerId` first argument (it
comes from the authenticated session instead).

## Wallet — `lib/api/wallet.ts`

**Real as of M8.2** — see "Wallet & Payments (M8.2)" above for the actual
endpoint contract (auto-top-up, admin adjust, and — deliberately — no bare
top-up/pay/refund endpoint; those route through the Razorpay order+webhook
flow or `POST /orders/:id/pay`/`:id/refund` instead).

| Function | Returns | Real endpoint |
|---|---|---|
| `getWallet()` | `Wallet` | `GET /api/v1/wallet` |
| `getTransactions(cursor?)` | `{ items: WalletTransaction[], nextCursor: string \| null }` | `GET /api/v1/wallet/transactions` |
| `getTopupOptions()` | `number[]` | Still static client-side config (`client/lib/data/wallet.ts`'s `topupOptions`) — just amount-picker tiles for `POST /payments/razorpay/order`'s `amount` field, not itself a money-moving call, so it didn't need a real endpoint. |

`WalletContext`'s `topUp`/`pay`/`earnCashback`/`refund` client methods swap
at **M8.4** to: `topUp` → `POST /payments/razorpay/order` (`purpose:
"topup"`) + the Razorpay Checkout SDK; `pay` (at marketplace checkout) →
`POST /orders/:id/pay`; `earnCashback`/`refund` have no direct client
call anymore — both only ever happen server-side (webhook capture, admin
refund) and just show up in the next `GET /wallet/transactions` poll.

## Site chrome & misc — `lib/api/site.ts`

| Function | Returns | Notes |
|---|---|---|
| `getHamperBoxes()` | `HamperBox[]` | `GET /api/v1/hamper/boxes` — **real as of M8.1** (`server/src/catalog/hamper-boxes.controller.ts`) |
| `getMealPromo()` | `MealPromo` | Static promo content; likely stays a config object, not an endpoint |
| `getPrimaryNav()` | `NavLink[]` | Site chrome config, not domain data — may just stay client-side content |
| `getFooterColumns()` | `FooterColumn[]` | Same as above |
| `getBrandBlurb()` | `string` | Same as above |
| `getHomePromoBands()` | `HomePromoBandContent[]` | Site chrome config, admin-editable via `/admin/collections` |
| `getCart()` | `Cart` | `GET /api/v1/cart` — **real as of M8.1**, see "Commerce (M8.1)" above for the actual (richer) response shape |
| `getCartCount()` | `number` | Derived client-side from `getCart()` once real; kept separate today only for the header badge |
| `getCurrentUser()` | `User` | `GET /api/v1/users/me` — **real as of M8.0**, see "Users & addresses" above; swaps at M8.4 |
| `getDefaultAddress()` | `Address` | `GET /api/v1/users/me/addresses` (filter `isDefault`) — **real as of M8.0** |

## Referrals, loyalty, notifications, support, corporate — `lib/api/{referrals,notifications,support,corporate}.ts`

**Real as of M8.3a** — see "Services (M8.3a)" above for the full contract.

| Function | Returns | Real endpoint |
|---|---|---|
| `getReferralCode()` | `string` | `GET /api/v1/referrals/code` |
| `getReferrals()` | `Referral[]` | `GET /api/v1/referrals` |
| `getLoyaltyAccount()` | `LoyaltyAccount` | `GET /api/v1/loyalty` |
| `applyReferralCredit()` | `ApplyReferralCreditResult \| null` | `POST /api/v1/referrals/:id/apply-credit` — **shape change**: the real endpoint targets one referral id (owner-scoped, once-only) rather than auto-picking; the call site needs updating at M8.4 (flagged above). |
| `getNotificationPreferences()` | `NotificationPreference[]` | `GET /api/v1/notifications/preferences` |
| `updateNotificationPreference(category, patch)` | `NotificationPreference` | `PATCH /api/v1/notifications/preferences/:category` |
| `getNotifications()` | `Notification[]` | `GET /api/v1/notifications` |
| `setNotificationRead(id, read)` | `Notification \| undefined` | `PATCH /api/v1/notifications/:id/read` |
| `createSupportTicket(input)` | `SupportTicket` | `POST /api/v1/support/tickets` |
| `getSupportTickets()` | `SupportTicket[]` | `GET /api/v1/support/tickets` |
| `createCorporateInquiry(input)` | `CorporateInquiry` | `POST /api/v1/corporate-inquiries` (`@Public()`) |
| `getCorporateInquiries()` | `CorporateInquiry[]` | Still mock-only — no list endpoint yet (seamed for M11 admin panel). |

## Client integration (M8.4a — `client/lib/api/*` swapped to real calls)

The consumer side of `client/` now points at this API for real
(`NEXT_PUBLIC_API_URL`, `client/.env.local`) — `NEXT_PUBLIC_USE_MOCK=true`
still falls back to the pre-M8.4a mock layer for frontend-only work.
Seller/admin (`lib/api/seller.ts`, `lib/api/admin.ts`) were mock through
M8.4a — **now real as of M8.4b**, see the next section. Notes for anyone
touching either side of this integration:

- **Token storage**: this API never sets a cookie (confirmed —
  `AuthController` always returns `{accessToken, refreshToken, ...}` in
  the JSON body). The client persists both tokens + the `PublicUser`
  snapshot to `localStorage` and mirrors the access token into a plain
  (non-httpOnly) `hk_access` cookie purely so a Next.js Server Component
  can attach a token during SSR — same not-a-security-boundary caveat
  the pre-existing `hk_role` cookie already carries. Every genuinely
  owner-scoped read (cart, wallet, wishlist, orders, addresses,
  referrals, notifications, support) is fetched from a Client Component
  on mount instead, specifically to always use the live, refreshable
  token rather than a possibly-stale SSR cookie snapshot.
- **Known server bug (found live during M8.4a, not fixed — out of
  scope)**: `POST /auth/refresh` (`server/src/auth/auth.service.ts`)
  hashes the newly-signed JWT itself as `RefreshToken.tokenHash`. Two
  refresh calls for the same user inside the same wall-clock second
  mint byte-identical tokens (same `sub`/`role`/`iat`/`exp` to the
  second) — the second `refreshToken.create()` throws a Prisma
  unique-constraint violation, surfaced as a `500 INTERNAL_ERROR`.
  Reproduced live via two back-to-back `curl` calls. A real fix
  belongs in `auth.service.ts#refresh` (e.g. add sub-second entropy to
  the token, or catch-and-retry the create on a `tokenHash` clash) —
  flagged for whichever milestone next touches `server/src/auth/`. The
  client mitigates by only calling refresh when the stored access token
  is actually stale (`lib/auth/session.ts#isAccessTokenStale`), which
  cuts real-world refresh frequency from "every page navigation" to
  "roughly once per `JWT_ACCESS_TTL`."
- **COD orders never leave `pending-payment`** — every order (including
  `paymentMethod: "cod"`) starts `pending-payment` per the M8.2 seam
  above, but there is still no endpoint that transitions a COD order
  forward (only `"wallet"` has `POST /orders/:id/pay`; `"razorpay"` has
  the webhook). A future milestone needs either a COD-specific
  confirmation endpoint or a driver-side "collected" event — flagged
  here again since M8.4a's real checkout surfaced it in practice, not
  just in theory.
- **Cart line resolution**: `client/lib/cart/CartContext.tsx` now reads
  `GET /cart`'s resolved `ServerCartLine` fields (`name`/`unitPrice`/
  `lineTotal`/etc.) directly instead of computing them from a
  separately-fetched product catalog — the "recommended" option this
  doc's response-shape notes called out above.
- **Verified live** (headless browser, seeded Postgres): sign-in (auto +
  demo + email), browse, add-to-cart, cart, checkout with a real
  wallet-paid order (`POST /orders` → `POST /orders/:id/pay`, wallet
  debited + cashback credited), laundry booking (atomic wallet debit),
  referral apply-credit (wallet refreshed), unified order history — zero
  console errors across the loop, at 360/768/1180.

## Client integration (M8.4b — `lib/api/seller.ts`/`lib/api/admin.ts` swapped to real calls)

Completes the M8.4 client swap: every seller-portal and admin-panel
`lib/api` function now calls its real M8.3b/M8.3c endpoint (see those
sections above), following the exact same `if (isMockMode()) {...mock...}
return http.<method>(...)` pattern M8.4a established. `signInAsAdmin`
(`client/lib/auth/AuthContext.tsx`) also swapped to a real `POST
/auth/login` against the seeded admin account — admin sign-in, session
restore-on-reload, and sign-out now all go through the exact same real-auth
path consumer/seller sessions already used, no more special-cased local
flip.

- **Signature stability, not endpoint parity**: every seller/admin
  function kept its mock-era `vendorId`/`sellerId` first argument even
  though the real endpoints ignore it (owner-scoped server-side from the
  JWT) — every call site in `app/seller/**`/`app/admin/**`/
  `components/seller/**`/`components/admin/**` needed zero changes.
- **`describeSellerOrderItems` fix**: this pure helper used to resolve
  "which of a mixed-vendor order's lines are mine" via `lib/data`'s mock
  product table — real orders carry Postgres-generated `productId`s that
  never match a mock seed id, so every real-mode order would have shown
  "—" instead of its item list. Fixed with a small per-vendor id cache
  (`myProductIdsCache` in `lib/api/seller.ts`) warmed by
  `getSellerListings`/`getSellerOrders`, falling back to describing every
  line if the cache isn't warm yet on first render.
- **Two functions still have no real backend and stay mock-only** (each
  flagged with a doc comment at its definition, not silently half-working):
  `lib/api/seller.ts#updatePartnerBookingSlots` (not built in M8.3b), and
  `lib/api/admin.ts#updateProductAdmin` (no generic full-record admin edit
  endpoint exists — only the 7 moderate-action toggles;
  `PATCH /seller/listings/:id` is `@Roles('seller')` and owner-scoped, so an
  admin token can't reach it either), and `lib/api/admin.ts#updateHomePromoBand`/
  `getHomePromoBands` (no server table for the home page's promo bands).
  `lib/api/sell.ts#createSellerApplication` (the public `/sell` form) **is
  real as of M9** — `POST /seller-applications` — closing the gap this
  bullet used to flag; see "Seller applications (M9)" above.
- **Wallet mutation shape gap — closed in M9**: `POST /admin/wallet/:userId/refund`
  and `POST /admin/wallet/:userId/adjust` now both respond `{wallet,
  balanceAfter, transactionId}` — the created `WalletTransaction` row's
  real id is returned instead of discarded. `lib/api/admin.ts`'s
  `issueRefund`/`adjustWallet` use `result.transactionId` directly; only
  `createdAt` is still a client-side stand-in (cosmetic — the next
  `getUserWallet` fetch shows the row's exact timestamp).
- **`getAllSnackOrders`** (M11a's admin-only unscoped snack-order read,
  defined in `lib/api/seller.ts`) is superseded by `lib/api/admin.ts`'s own
  real `getAllOrdersUnified` (`GET /admin/orders`, unified server-side) and
  now stays mock-only — only `admin.ts`'s own mock branch still calls it.
- ~~**`GET /admin/audit` has no frontend screen**~~ — **fixed in M27.**
  `/admin/audit` exists, with a nav entry, entity/actor filters served by
  the endpoint itself, and pagination. It had been recording every admin
  mutation since M8 with no way to read one short of a psql prompt, while
  this document listed an audit log among the admin panel's features.
- **Verified live** (headless browser, seeded Postgres, all 3 roles in one
  session): seller sign-in as each demo type (maker/laundry/snack) — real
  `POST /auth/login`, no seller-portal network calls in mock mode when
  `NEXT_PUBLIC_USE_MOCK=true`; maker dashboard/listings CRUD (create +
  storefront-visible)/order-advance (placed→confirmed)/storefront edit
  (bio change visible on the server-rendered `/storefront/[vendor]` page —
  the mock-era cross-module-graph limitation is now actually fixed, not
  just documented as one)/payouts/review-reply; laundry-partner
  dashboard/pickup-advance (scheduled→picked-up); snack-seller
  dashboard/menu/order-advance (received→accepted); the shop⇄sell dual-mode
  switch (role-gated middleware correctly redirects an admin session away
  from `/seller/*`); admin sign-in, approve a seller application (seller
  immediately active in "All sellers", dashboard's "Active makers" count
  incremented), take down a product (instantly gone from public `/shop`,
  restored after "Approve"), issue a refund from both the wallet detail
  screen and an order's detail screen (wallet balance updated, survives a
  hard reload), analytics (real GMV/wallet-flow aggregates reflecting the
  session's own test refunds), audit log (verified via `curl`, see above).
  Zero console errors across the whole loop, at 360/768/1180.

## Not yet stubbed (arrives with their milestone)

Cart mutations, checkout/order placement, hamper creation, wishlist
mutations and reviews are **real as of M8.1**. Wallet ledger writes,
pay-with-wallet-at-checkout and Razorpay payment capture are **real as of
M8.2**. Laundry (services/availability/bookings/subscriptions), snacks
(menu read), referrals/loyalty, notifications (read/preferences), support
tickets and corporate inquiry submission are **real as of M8.3a**. The
seller portal — maker listings/orders/storefront/reviews, laundry-partner
bookings, snack-seller menu/orders, and payouts for all 3 types — is
**real as of M8.3b**; see "Seller portal (M8.3b)" above. Admin-unscoped
views (every seller/order/payout across all sellers, seller-application
approval, account suspend/reactivate) are **real as of M8.3c**. WhatsApp
Cloud API (outbound status sends + the verified inbound webhook), real
per-preference notification delivery (SMS/WhatsApp/email, real OTP SMS
delivery), and the public seller-application create endpoint are **real
as of M9** — see "WhatsApp Cloud API (M9)" / "Notification delivery
(M9)" / "Seller applications (M9)" above. **This closes every module
planned through M9** — remaining seams (support-ticket/corporate-inquiry
admin review queues; real Google/Apple OAuth token verification instead
of the trusted-payload stub) are explicitly out of scope for the planned
milestone list, not gaps in it. Add the real endpoint in the matching
future module, following the pattern above (DTO-validated, owner-scoped
where relevant, server-authoritative pricing/ledger math never trusted
from the client).
