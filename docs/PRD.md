# Homekrafted — Product Requirements

Source of truth for scope is
`~/.claude/plans/read-the-handoff-i-jolly-hennessy.md` — this document
mirrors its coverage tables plus a short user-flow stub per module so the
product surface is legible without opening the plan file. If this ever
disagrees with the plan, **the plan wins**.

Homekrafted is a multi-service home-craft platform — **Gifting
Marketplace**, **Laundry / Cleaning / Ironing**, **Snacks + Food
Delivery** — unified by one **Wallet** and one shared account layer.
Every bullet below is mandatory and in-scope; nothing is phased out.

## Coverage tables

### Shared Platform

| Feature | Web surface |
|---|---|
| Login (phone / email / social) | `/login` — OTP + email + social (Auth.js, M8) |
| Address book | `/account/addresses` — CRUD, default flag |
| Order history (Marketplace + Laundry) | `/account/orders` — unified list + detail, basic status |
| Support (chat + call) | `/support` — chat widget + call CTA + ticket form |
| Notifications (SMS / WhatsApp / email) | `/account/notifications` — prefs per channel + inbox |
| Ratings & reviews | Review UI on product, maker, service |
| Referral & loyalty | `/account/referrals` — code/share, tier + points → wallet |

### Wallet (single, cross-module)

| Feature | Web surface |
|---|---|
| Add money / auto top-up | `/wallet` — amount picker + auto-top-up rule |
| Cashback & loyalty credits | Ledger entries; cashback line on product/checkout |
| One balance (Marketplace+Laundry+Snacks) | Header wallet chip + pay-with-wallet |
| Instant refunds to wallet | Ledger `refund` entries; order refund state |
| Balance & transaction history | `/wallet` balance card + full transactions |

### Gifting Marketplace

| Feature | Web surface |
|---|---|
| Multi-vendor | Vendor model; products carry `vendorId` |
| Artist & maker storefronts | `/storefront/[vendor]` — banner, avatar, rating, follow |
| Home bakers / edible sellers | Vendor `type` (artist/baker/maker) |
| Packaged food listings | Product `isPackaged` + filter |
| Hamper builder (note/wrap/ribbon/card) | `/hamper` — box→fill→message→checkout |
| Gift-to-recipient (hide price) | Checkout variant — recipient + hide-price toggle |
| Occasion-based collections | `/collections/[occasion]` + home band |
| Corporate/bulk gifting inquiry | `/corporate` form |
| Wishlist | `/account/wishlist` + heart on cards |
| Cart, multi-address checkout, delivery-date | `/cart`, `/checkout` — split by address, per-address date |
| Basic order status (no live tracking) | Status stepper, no map/rider |
| Seller onboarding *(future)* | `/sell` info + form (flagged) |

### Laundry, Cleaning & Ironing

| Feature | Web surface |
|---|---|
| Wash&fold / dry clean / ironing / deep cleaning | `/laundry` service picker |
| Per-kg / per-item / per-hour | Per-service pricing model |
| Two-slot scheduling (pickup+delivery) | Separate pickup **and** delivery pickers |
| Item count / photo upload (dry-clean) | Upload tile + counter |
| Special instructions | Textarea |
| Recurring subscriptions | Subscription toggle + plan picker |
| Pay online or on delivery | online / wallet / COD |
| Basic status line on site | Booking status line |
| Real-time tracking (app only) | "Track on app" band + badges |

### Food Delivery

| Feature | Web surface |
|---|---|
| Full meals — promo only | `/app-promo` (no menu/cart) |
| Snacks — browsable menu | `/snacks` grid |
| Order via WhatsApp | "Send list on WhatsApp" (`wa.me`) |
| WA status received→accepted→out for delivery | WA status timeline |
| App Store / Play badges | Promo + footer |
| QR for app install | QR tile |
| Full meals ordering & tracking in-app | Promo + "get the app" CTA |

## Channel matrix (single source of truth for what's buildable where)

| Module | Browse web | Checkout web | Live tracking | Notes |
|---|:---:|:---:|:---:|---|
| Marketplace | Yes | Yes | No (status only) | multi-vendor, multi-address |
| Laundry | Yes | Yes (or COD) | App only | 2-slot, subscriptions |
| Snacks | Yes | WhatsApp | WhatsApp text | no on-site checkout |
| Full meals | Promo only | App | App | web is marketing only |

Wallet spans Marketplace + Laundry + Snacks. Enforced in code via
`lib/channel.ts` (`CHANNEL_RULES`) — see `docs/DESIGN-SYSTEM.md` and
`CLAUDE.md` for how screens must consult it.

## Primary user flows (stub — detailed flows land per-module milestone)

**Marketplace (M2–M3).** Home/Shop browse → filter by category, dietary,
occasion, price → Product detail (weight, cashback line, gift options) →
Add to cart *or* Add to hamper → Cart (multi-line, multi-address) →
Checkout (per-address delivery date, gift-to-recipient with hide-price,
wallet/Razorpay/COD not applicable here — Marketplace is wallet/Razorpay
only) → Order confirmation → `/account/orders` status stepper (placed →
confirmed → packed → shipped → delivered; no live map).

*M3 status (buy flow, shipped):* `lib/cart/CartContext.tsx` — the first
real cross-page client state, `localStorage`-persisted, wired into
`ProductPurchasePanel`/`ProductGridCard`'s add-to-cart and the header
cart badge. `/hamper` (box → fill → message wizard, capacity-capped,
hands the assembled hamper to the cart as one line and routes into
checkout), `/cart` (line items, qty edit, remove, order summary, empty
state), `/checkout` (multi-address split with a per-address delivery
date, a single order-wide gift-to-recipient toggle with hide-price +
message, wallet/Razorpay payment, mock `createOrder` → in-place order
confirmation, cart cleared). Order history / detail is still
`/account/orders` in M7.

*M2 status (browse surfaces, shipped):* `/` (Home — hero, shop by
occasion/category, featured rail, hamper + wallet promo bands, "one home
three crafts" services band, app-install panel), `/shop` (filter sidebar —
category/dietary/occasion + price range, sort, removable active-filter
chips, pagination; `?category=`/`?occasion=` seed the initial filter from
a Home tile click), `/product/[slug]` (gallery, weight selector, wallet
cashback, quantity + add-to-cart as a local no-op pending M3, add-to-
hamper, gift block, description/spec tabs, Reviews), `/storefront/[vendor]`
(banner/avatar/rating/follow header, that maker's product grid, their
reviews) and `/collections/[occasion]` (occasion hero, curated collection
when one exists — Diwali/Corporate — else a plain occasion filter, product
grid). Add-to-cart on these screens is real as of M3 (see below) — it
was an inert local no-op only during M2.

**Hamper builder (M3, shipped).** `/hamper` → choose box size (Petite/
Signature/Grand) → fill with products up to the box's item cap (capacity
meter) → add gift note / wrap style / ribbon / name card → hands off to
`/checkout` as one cart line. Recipient address + hide-price live on
Checkout's order-wide gift toggle, not as a per-hamper field — see
`CHANGELOG.md`'s M3 entry for why.

**Laundry (M4).** `/laundry` → pick a service (pricing model per-kg/
per-item/per-hour) → pickup day + slot → delivery day + slot (separate
picker) → item count or photo upload for dry-clean estimate → special
instructions → optional subscription plan → pay online/wallet or COD →
booking confirmation → status line (scheduled → picked-up → in-progress →
out-for-delivery → delivered); "track live on the app" band, no in-browser
map.

**Snacks (M5, shipped).** `/snacks` → category chips filter a `SnackCard`
grid → "+ Add" toggles a snack into an on-page "your snack list" (a
client-local `SnackList`, quantity editable per line, never a cart/order
entity) → "Send list on WhatsApp" builds a `wa.me` deep link
(`buildSnackListMessage` + `buildWhatsAppLink`) prefilled with the line
items and the real computed estimate total → status communicated back
over WhatsApp text (received → accepted → out for delivery), mirrored as
a read-only `StatusTimeline` on-site. No cart, no checkout — `useCart` is
never imported on this page.

**Full meals (M5, shipped).** `/app-promo` → dark hero (channel badge,
headline, `StoreBadges`), a "why the app" value-prop grid, and a "get the
app" panel (`QRTile` + `StoreBadges`). No menu, no cart, no checkout —
ordering and live tracking happen entirely inside the Homekrafted app.

**Wallet (M6, shipped).** `/wallet` → balance card (pending cashback,
lifetime saved) → add money (fixed amount tiles or custom, +3% bonus
above ₹2,000) → auto-top-up rule (below-threshold, enable + threshold +
amount) → pay-with-wallet info card (on by default at Marketplace/Laundry
checkout) → transaction history (credit: topup/cashback/refund/referral/
loyalty; debit: payment) with a "view full history" month-grouped expand.

*M6 status (wallet, shipped):* `lib/wallet/WalletContext.tsx` — the
second real cross-page client store after `CartContext`, `localStorage`-
persisted, exposing `useWallet()` (`topUp`/`pay`/`earnCashback`/`refund`/
`setAutoTopup`). Every op appends a `WalletTransaction` with the correct
`direction`/`category`/`balanceAfter`/`refType`/`refId`; `pay` returns
`{ ok: false }` without mutating state when the balance can't cover the
amount, and auto-fires the configured `below-threshold` top-up rule when
a successful debit drops the balance under it. Back-wired into M3
Checkout and M4 Laundry (both previously display-only stubs — `pay` +
`earnCashback` now run on order/booking placement; Checkout earns
cashback on every order regardless of payment method, Laundry only on
wallet-paid bookings, matching each milestone's original cashback rule)
and the header wallet chip (`HeaderClient`/`MobileDrawer` now read
`useWallet().balance` instead of a static server-fetched prop).

**Shared/Account (M7).** `/login` (phone OTP + email + social, M8 for
real auth) → `/account/profile`, `/account/addresses` (CRUD + default),
`/account/orders` (unified Marketplace + Laundry), `/account/wishlist`,
`/account/referrals` (code/share → wallet credit on conversion),
`/account/notifications` (per-category channel prefs + inbox), `/support`
(chat widget + call CTA + ticket form), `/corporate` (bulk gifting inquiry
form), `/sell` (seller onboarding, future-flagged, wired but disabled).

*M7a status (account core, shipped):* `/login` (`LoginClient` —
phone-OTP/email/social tabs, all mock: every path converges on
`useAuth().signIn()`; "sign in as demo user" shortcut; no real credential
check, Auth.js lands in M8), the account shell (`app/account/layout.tsx` →
`AccountShell` — sidebar on desktop, horizontal scroll tab strip below
780px, gated on `useAuth()` so a signed-out visit shows a "sign in" prompt
instead of a broken tree), `/account` overview (greeting, live wallet-
balance snapshot, quick-link tiles with order/address/wishlist counts),
`/account/orders` (unified list merging Marketplace `Order`s + Laundry
`LaundryBooking`s, filterable, sorted newest-first, tagged by kind) +
`/account/orders/[id]` detail (basic status stepper reusing the exact
Placed→Confirmed→Packed→Shipped→Delivered / Scheduled→Picked
up→In progress→Out for delivery→Delivered pipelines `OrderConfirmation`/
`LaundryBookingConfirmation` already port, no live tracking —
`<AppTrackingBand>` for active laundry bookings per the channel rule),
`/account/addresses` (full CRUD + default-enforcement over the M3-seeded
address book), `/account/profile` (edit name/email/phone, sign-out), and
`/account/wishlist` (grid of wishlisted products, remove, "move to cart").
`/account/referrals`, `/account/notifications`, `/support`, `/corporate`,
`/sell` are **M7b**, not yet built — the account shell's nav array
(`ACCOUNT_NAV_ITEMS`) is structured so M7b appends to it rather than
restructuring the shell.

*M7a status (wishlist store, shipped):* `lib/wishlist/WishlistContext.tsx`
— the third real cross-page client store after `CartContext`/
`WalletContext`, `localStorage`-persisted, exposing `useWishlist()`
(`productIds`/`has`/`toggle`/`remove`/`count`). Wired into
`ProductGridCard` and `ProductPurchasePanel`'s hearts (previously
local-only `useState` no-ops) and the header wishlist badge
(`HeaderClient`/`MobileDrawer`), the same pattern the wallet chip and cart
badge already established.
