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
| Seller portal — maker dashboard | `/seller/*` — listings, orders, storefront, payouts, reviews |
| Seller portal — laundry partner | `/seller/*` — pickups (assigned bookings + status), payouts |
| Seller portal — snack seller | `/seller/*` — menu CRUD, incoming WhatsApp orders, payouts |

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

### Admin panel (internal staff, M11a + M11b)

| Feature | Web surface |
|---|---|
| Staff-only sign-in (no public sign-up) | `/admin/login` — email/password mock + "continue as demo admin" |
| Platform KPI dashboard (unscoped) | `/admin` — GMV, orders today/total, active sellers by type, users, pending applications, pending payouts, wallet liability, orders-by-module bar chart |
| User directory + suspend/reactivate | `/admin/users` + `/admin/users/[id]` — search/filter by role+status, mock suspend flag |
| Seller directory + suspend/reactivate | `/admin/sellers` — all sellers (maker/laundry/snack), type filter |
| Seller onboarding approval queue | `/admin/sellers` approval-queue tab — approve (`SellerApplication` → active `Seller` + `Vendor`) / reject |
| Unified orders oversight + refunds | `/admin/orders` + `/admin/orders/[type]/[id]` — Marketplace `Order` + `LaundryBooking` + `SnackOrder`, unscoped, type-filterable; refund wired to the wallet ledger for marketplace/laundry (M11b); status overrides still M8 |
| Catalog moderation + listing edit | `/admin/catalog` + `/admin/catalog/[id]` (M11b) — every `Product` across every vendor, search/filter by vendor/category/status; approve/hide/flag/feature actions; full edit via the shared `ListingForm` |
| Review moderation | `/admin/catalog/reviews` (M11b) — every `Review` (product + vendor), flagged queue, hide/unhide |
| Wallet oversight + refunds/adjustments | `/admin/wallet` + `/admin/wallet/[userId]` (M11b) — platform-wide liability, per-user balance + ledger, issue a refund or a manual credit/debit with a reason |
| Collections & CMS | `/admin/collections` + `/admin/collections/[id]`/`new` (M11b) — occasion `Collection` create/edit (title, occasion, product membership + reorder); `/admin/collections/promo` edits the home page's two promo bands |
| Analytics | `/admin/analytics` (M11b) — GMV over time, orders by module, top sellers/products, new users, wallet flow; no chart library, CSS/inline-SVG only |

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

*M7b status (shared screens, shipped):* `/account/referrals` (referral
code with copy/share, an "apply referral credit (demo)" button that
advances the oldest un-rewarded `Referral` and posts a real `category:
"referral"` credit to the wallet ledger via `useWallet().earnReferralCredit()`,
a loyalty tier/points ladder over `LoyaltyAccount`, "how it works"),
`/account/notifications` (per-category SMS/WhatsApp/email/in-app
preference grid, mock-persisted via `updateNotificationPreference`; a
read/unread `Notification` inbox with an "All/Unread" filter, mock-marked
via `setNotificationRead`), `/support` (a local mock chat widget with
keyword-matched canned auto-replies, a `tel:` call CTA, and a
`SupportTicket` form → mock `createSupportTicket` → confirmation),
`/corporate` (`CorporateInquiry` form → mock `createCorporateInquiry` →
thank-you state), `/sell` (seller-onboarding benefits + steps, clearly
flagged "Coming soon", a `SellerApplication` form → mock
`createSellerApplication` → waitlist confirmation — un-flagging this is
explicit M8/M9 scope, see `CHANGELOG.md`'s M7b entry). `AccountShell`'s
nav array (`ACCOUNT_NAV_ITEMS`) gained Referrals + Notifications entries,
exactly the extension point M7a left for it — no restructuring.

**Seller portal (M10a maker; M10b laundry partner + snack seller,
shipped).** `/seller/login` → sign in as one of 3 demo sellers ("continue
as demo maker/laundry partner/snack seller") → `SellerShell` (pine-deep
topbar + a nav scoped to `seller.type`) → **maker:** Dashboard (today's
orders/revenue, pending payout, low stock, rating) → Listings (CRUD over
own `Product`s) / Orders (fulfilment status stepper: placed→confirmed→
packed→shipped→delivered) / Storefront (bio/banner edit) / Payouts
(earnings + request-payout) / Reviews (read + reply). **Laundry partner:**
Dashboard (today's pickups/deliveries, this week's earnings, pending
payout, rating) → Pickups (assigned `LaundryBooking`s; detail → status
stepper scheduled→picked-up→in-progress→out-for-delivery→delivered +
editable pickup/delivery day+slot) / Payouts. **Snack seller:** Dashboard
(incoming orders, menu size, earnings, pending payout) → Menu (CRUD over
own `Snack`s: name, category, diet, price, image, availability) / Orders
(incoming WhatsApp-origin `SnackOrder`s; status stepper received→
accepted→out-for-delivery→delivered — the same sequence the consumer
`/snacks` WhatsApp timeline shows) / Payouts. All three types share
`StatCard`/`SellerPageHeader`/`PayoutRow`/`StatusTimeline` and the
owner-scoped, session-mock `lib/api/seller.ts` data layer — no
cross-seller data leakage in the mock, but owner-scoping is
client-trusted until M8's real sessions land.

**Admin panel (M11a foundation, M11b moderation/wallet/CMS/analytics,
both shipped).** `/admin/login` (staff-only — no public sign-up
affordance anywhere on the screen, unlike `/seller/login`'s "apply to
sell" link; a mock email/password form plus "continue as demo admin")
→ `AdminShell` (its own pine-deep topbar + sidebar, same responsive
collapse recipe as `SellerShell` but not a reskin of it — see
`CLAUDE.md`'s "Three role surfaces" — all 8 nav items are live as of
M11b, the 4 M11a "Soon" slots now real routes) →
**Dashboard** (`lib/api/admin.ts#getAdminDashboard` — GMV, orders
today/total, active sellers by type, users, pending applications,
pending payouts, wallet liability summed across every seeded wallet
(M11b), a CSS-only orders-by-module bar chart, a pending-applications
callout linking to the queue). **Users** (`/admin/users` — the full
unscoped `User` directory across every role surface, search +
role/status filters, inline suspend/reactivate; `/admin/users/[id]`
detail repeats the action) — `User` gained an optional `suspended` flag
(M11a) for this, not yet a real sign-in block (no session to gate).
**Sellers** (`/admin/sellers` — "All sellers" tab, type-filterable,
suspend/reactivate; "Approval queue" tab closes the M7b `/sell` → M11a
loop: approving a pending `SellerApplication` mints a `Vendor`
storefront + an `approved` `Seller` in one action, immediately visible
in the "All sellers" tab). `SellerApplicationStatus` gained
`approved`/`rejected` terminal states (M11a) alongside `/sell`'s
pre-existing `new`/`reviewing`/`waitlisted`, which the queue treats as
one "pending" bucket. **Orders oversight + refunds** (`/admin/orders` +
`/admin/orders/[type]/[id]` — Marketplace `Order` + `LaundryBooking` +
`SnackOrder` unified into one list/detail shape, type-filterable +
searchable, full read visibility; **M11b wires the refund action** for
marketplace/laundry orders straight into the wallet ledger — snack
orders keep the "no account to refund" note instead, since WhatsApp
orders have no registered user; status overrides remain M8 scope).
**Catalog** (`/admin/catalog` + `/admin/catalog/[id]`, M11b — every
`Product` across every vendor, search/filter by vendor/category/
moderation-status; approve/hide/flag/feature actions
(`lib/api/admin.ts#moderateProduct`) plus a full edit screen reusing
`components/seller/ListingForm.tsx` verbatim; a "hidden" product is
filtered out of every consumer browse getter in `lib/api/products.ts`).
**Reviews** (`/admin/catalog/reviews`, M11b — every `Review` across
products + vendors, a flagged queue, hide/unhide — hiding filters it out
of `getProductReviews`/`getVendorReviews`). **Wallet** (`/admin/wallet`
+ `/admin/wallet/[userId]`, M11b — platform-wide liability and every
seeded account's balance + ledger; **issue a refund** appends a
`category: "refund"` `WalletTransaction`, same shape
`WalletContext.refund` writes client-side for the consumer; **manual
adjustment** appends `category: "adjustment"`, a new category
distinguishing an admin-initiated fix from an order-tied refund).
**Collections & CMS** (`/admin/collections` + `/admin/collections/[id]`/
`new`, M11b — occasion `Collection` create/edit: title, occasion,
product membership with move-up/move-down reordering;
`/admin/collections/promo` edits the home page's two promo bands, now a
real config record (`lib/data/site.ts#homePromoBands`) instead of
hardcoded JSX in `app/page.tsx`). **Analytics** (`/admin/analytics`,
M11b — GMV over a 14-day inline-SVG sparkline, orders by module, top
sellers/products, new users by month, wallet flow by category; every
number derived from existing mock arrays, no chart library, no new data
model). Every admin query/mutation across both milestones is unscoped
by design (no `vendorId`/`sellerId` filter, unlike `lib/api/seller.ts`)
and, like every other mock data layer in this codebase, trusts the
client-side role gate; **M8 must enforce real admin-role RBAC
server-side and audit-log every unscoped read/write** the mock
`lib/api/admin.ts` makes today. **Known limit carried into M11b:** the
moderation/CMS write paths are `"use client"` mutations in the browser's
module graph, while the consumer pages that read the same data
(`/shop`, `/`, `/product/[slug]`, etc.) are Server Components fetching
in the Next.js server's — a hide/feature/CMS edit is instantly visible
across every other admin screen in the same tab, but only reaches a
consumer page through a real backend round-trip, which M8 provides.

*M7a status (wishlist store, shipped):* `lib/wishlist/WishlistContext.tsx`
— the third real cross-page client store after `CartContext`/
`WalletContext`, `localStorage`-persisted, exposing `useWishlist()`
(`productIds`/`has`/`toggle`/`remove`/`count`). Wired into
`ProductGridCard` and `ProductPurchasePanel`'s hearts (previously
local-only `useState` no-ops) and the header wishlist badge
(`HeaderClient`/`MobileDrawer`), the same pattern the wallet chip and cart
badge already established.
