# API contract

Today (M0–M7) "the API" is `lib/api/` — typed, `async` functions that
resolve mock data from `lib/data/`. Every function already returns a
`Promise`, so **M8 (secure backend) only changes function bodies** to real
`fetch()` calls against Next.js route handlers under `app/api/` — no
calling component should need to change.

This doc is the current contract (what exists, what it returns) plus the
intended real-endpoint shape for M8, so the swap is mechanical.

## Conventions (to carry into M8)

- Base path: `/api/v1`.
- Auth: session cookie (Auth.js), phone OTP / email / social login.
  Unauthenticated requests to user-scoped endpoints (`wallet`, `orders`,
  `wishlist`, etc.) return `401`.
- Errors: `{ error: { code: string, message: string } }` with a matching
  HTTP status (`400` validation, `401` auth, `403` forbidden, `404` not
  found, `409` conflict, `500` server).
- Mutations (top-up, place order, create booking, send snack list) are
  `POST`; the wallet ledger is server-authoritative — the client never
  computes or sends `balanceAfter`.
- Pagination (products, orders): `?page=&pageSize=` query params, response
  shape `{ items: T[], page, pageSize, total }` once real data volume
  needs it — M0's mock lists are small enough to return whole.

## Products & catalog — `lib/api/products.ts`, `lib/api/catalog.ts`

| Function | Returns | Future endpoint |
|---|---|---|
| `getProducts()` | `Product[]` | `GET /api/v1/products` |
| `getProduct(slug)` | `Product \| undefined` | `GET /api/v1/products/:slug` |
| `getFeatured()` | `Product[]` | `GET /api/v1/products?featured=true` |
| `getProductsByCategory(categoryId)` | `Product[]` | `GET /api/v1/products?category=:id` |
| `getProductsByOccasion(occasionId)` | `Product[]` | `GET /api/v1/products?occasion=:id` |
| `getProductsByVendor(vendorId)` | `Product[]` | `GET /api/v1/vendors/:id/products` |
| `getCategories()` | `Category[]` | `GET /api/v1/categories` |
| `getCategory(slug)` | `Category \| undefined` | `GET /api/v1/categories/:slug` |
| `getOccasions()` | `Occasion[]` | `GET /api/v1/occasions` |
| `getOccasion(slug)` | `Occasion \| undefined` | `GET /api/v1/occasions/:slug` |
| `getCollections()` | `Collection[]` | `GET /api/v1/collections` |
| `getCollection(slug)` | `Collection \| undefined` | `GET /api/v1/collections/:slug` |

## Vendors — `lib/api/vendors.ts`

| Function | Returns | Future endpoint |
|---|---|---|
| `getVendors()` | `Vendor[]` | `GET /api/v1/vendors` |
| `getVendor(slug)` | `Vendor \| undefined` | `GET /api/v1/vendors/:slug` |

## Snacks — `lib/api/snacks.ts`

| Function | Returns | Future endpoint |
|---|---|---|
| `getSnacks()` | `Snack[]` | `GET /api/v1/snacks` |
| `getSnack(slug)` | `Snack \| undefined` | `GET /api/v1/snacks/:slug` |
| `getSnackList()` | `SnackList` | `POST /api/v1/snack-lists` (creates + returns the list that becomes the WhatsApp payload — no checkout, see `lib/channel.ts`) |

## Laundry — `lib/api/laundry.ts`

| Function | Returns | Future endpoint |
|---|---|---|
| `getLaundryServices()` | `LaundryService[]` | `GET /api/v1/laundry/services` |
| `getLaundryService(slug)` | `LaundryService \| undefined` | `GET /api/v1/laundry/services/:slug` |
| `getLaundryDays()` | `LaundryDay[]` | `GET /api/v1/laundry/availability/days` |
| `getLaundrySlots()` | `LaundrySlot[]` | `GET /api/v1/laundry/availability/slots` |
| `getLaundryHowItWorks()` | `LaundryHowItWorksStep[]` | static copy — likely stays client-side content, not an endpoint |
| `getLaundrySubscriptionPlanOptions()` | `LaundrySubscriptionPlanOption[]` | static copy (weekly/biweekly/monthly labels+hints) — likely stays client-side content, not an endpoint |
| `createBooking(input)` (M4) | `LaundryBooking` (mock, in-memory) | `POST /api/v1/laundry/bookings` — computes the estimate from the service's quantity dimension (kg/item/hr), generates a `bookingNumber` ("LB..."), starts `status: "scheduled"` |
| `createSubscription(input)` (M4) | `LaundrySubscription` (mock, in-memory) | `POST /api/v1/laundry/subscriptions` |

Both mutations run client-side (called from `LaundryBookingClient`), same
in-memory/reset-on-reload caveat as `lib/api/orders.ts`'s `createOrder` —
swap for real endpoints in M8 without touching the call site.

## Wallet — `lib/api/wallet.ts`

| Function | Returns | Future endpoint |
|---|---|---|
| `getWallet()` | `Wallet` | `GET /api/v1/wallet` (authed user's wallet) |
| `getTransactions()` | `WalletTransaction[]` | `GET /api/v1/wallet/transactions` |
| `getTopupOptions()` | `number[]` | `GET /api/v1/wallet/topup-options` (or static config) |

Top-up (`POST /api/v1/wallet/topup`), auto-top-up rule
(`PUT /api/v1/wallet/auto-topup`) and pay-with-wallet at checkout are M6 +
M8 — the ledger write path is server-authoritative from day one; no client
stub computes `balanceAfter` even as a mock.

## Site chrome & misc — `lib/api/site.ts`

| Function | Returns | Notes |
|---|---|---|
| `getHamperBoxes()` | `HamperBox[]` | `GET /api/v1/hamper/boxes` |
| `getMealPromo()` | `MealPromo` | Static promo content; likely stays a config object, not an endpoint |
| `getPrimaryNav()` | `NavLink[]` | Site chrome config, not domain data — may just stay client-side content |
| `getAnnouncementItems()` | `AnnouncementItem[]` | Same as above |
| `getFooterColumns()` | `FooterColumn[]` | Same as above |
| `getBrandBlurb()` | `string` | Same as above |
| `getTrustStats()` | `TrustStat[]` | Same as above |
| `getCart()` | `Cart` | `GET /api/v1/cart` (authed) — full cart mutation endpoints land with the Cart page in M3 |
| `getCartCount()` | `number` | Derived client-side from `getCart()` once real; kept separate today only for the header badge |
| `getCurrentUser()` | `User` | `GET /api/v1/me` (M8, Auth.js session) |
| `getDefaultAddress()` | `Address` | `GET /api/v1/addresses?default=true` |

## Not yet stubbed (arrives with their milestone)

Cart mutations, checkout/order placement, hamper creation, wishlist
mutations, reviews, notifications, referrals, support tickets, corporate
inquiry submission, laundry booking creation — these all involve a write
path and/or don't have a UI consuming them yet in M0. Add the stub
function in `lib/api/` in the same milestone that builds the screen using
it, following the pattern above (typed params/return matching `lib/types`,
`async`, thin wrapper over `lib/data` until M8).
