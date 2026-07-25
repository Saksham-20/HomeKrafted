# Changelog

All notable changes to the Homekrafted build are logged here, one entry
per milestone. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [M7a] — Account core — 2026-07-25

Auth UI, the account shell, unified order history, address book,
profile, and the wishlist store. M7b (referrals, notifications, support,
corporate, sell) is a separate later milestone, not built here.

### Added

- `lib/wishlist/WishlistContext.tsx` — the third real cross-page client
  store after `CartContext`/`WalletContext`, `localStorage`-persisted,
  hydration-guarded the same way, exposing `useWishlist()`: `productIds`,
  `has(id)`, `toggle(id)`, `remove(id)`, `count`. Wired into
  `ProductGridCard` and `ProductPurchasePanel`'s hearts (previously
  local-only `useState`) and the header wishlist icon's badge
  (`HeaderClient`/`MobileDrawer`), matching the wallet-chip/cart-badge
  pattern.
- `lib/auth/AuthContext.tsx` — mock auth store: a `localStorage`-persisted
  `isSignedIn` flag over the single seeded `currentUser` (M0), exposing
  `useAuth()`: `user`, `isSignedIn`, `ready`, `signIn(provider?)`,
  `signOut()`. Defaults to signed-in on both server and pre-hydration
  client render (per the brief, "account pages assume the demo user is
  signed in") — only `signOut()` (Profile) flips it. No real credential
  check; every sign-in path converges on the one demo user until Auth.js
  lands in M8.
- `app/login/page.tsx` + `components/auth/LoginClient.tsx` — phone-OTP
  (number → send → enter code → verify), email, and social (Google/Apple,
  inline SVG glyphs) tabs, plus a "sign in as demo user" shortcut. All
  mock — every path calls `useAuth().signIn()` and redirects to
  `/account`. Shows an "already signed in" state with a sign-out option
  when revisited while signed in.
- `app/account/layout.tsx` + `components/account/AccountShell.tsx` — the
  account section nav (Overview/Orders/Addresses/Wishlist/Profile, a
  plain array — `ACCOUNT_NAV_ITEMS` — so M7b can append Referrals/
  Notifications without restructuring). Sidebar on desktop, sticky;
  collapses to a horizontally-scrollable tab strip below 780px via a CSS
  layout swap (same technique `Header.module.css` uses for its own
  desktop/mobile split — no conditional-JS hydration risk). Gates on
  `useAuth()`: signed-out shows a "sign in" prompt instead of a broken
  tree.
- `app/account/page.tsx` + `components/account/AccountOverviewClient.tsx`
  — greeting, a live wallet-balance snapshot (`useWallet()`), and
  quick-link tiles into Orders/Addresses/Wishlist/Profile with counts
  (order/address counts server-fetched from the seeded history; wishlist
  count and wallet balance read live).
- `lib/api/history.ts` — unified order-history read layer.
  `OrderHistoryEntry` normalizes a Marketplace `Order` or Laundry
  `LaundryBooking` into one shape (`kind`, `number`, `date`, `statusLabel`,
  `steps`, `total`, `summary`). `getOrderHistory()` merges
  `lib/data/orders.ts`'s new `seedOrders` + `lib/data/laundry.ts`'s new
  `seedLaundryBookings` (6 orders + 4 bookings spanning the full status
  range, three order numbers — HK1987/HK2031/HK2043 — deliberately
  matching `lib/data/wallet.ts`'s existing ledger references) with
  whatever `createOrder`/`createBooking` placed live this session
  (`getPlacedOrders()`/`getPlacedBookings()`, new exports on
  `lib/api/orders.ts`/`lib/api/laundry.ts`), sorted newest-first.
  `getOrderStatusSteps`/`getLaundryStatusSteps` reuse the exact
  Placed→Confirmed→Packed→Shipped→Delivered /
  Scheduled→Picked up→In progress→Out for delivery→Delivered pipelines
  `OrderConfirmation`/`LaundryBookingConfirmation` (M3/M4) already port;
  `cancelled`/`returned` collapse to a short two-step line.
- `app/account/orders/page.tsx` + `components/account/OrdersListClient.tsx`
  — unified list, filterable (All/Marketplace/Laundry via `Chip`), each
  row tagged by kind with its status and total. Fetches
  `getOrderHistory()` client-side on mount (not a server prop) so a live
  order/booking placed earlier in the session surfaces on top of the
  seeded history when reached by client-side navigation — see
  `docs/DESIGN-SYSTEM.md`'s M7a section for why.
- `app/account/orders/[id]/page.tsx` +
  `components/account/OrderDetailClient.tsx` — basic status
  `<StatusTimeline>` (no live tracking), items/booking-line summary,
  shipping/pickup-delivery address, payment method, cashback line, and
  `<AppTrackingBand>` for laundry bookings still in flight (per
  `lib/channel.ts`'s `liveTracking: "app-only"`).
- `lib/api/addresses.ts` — full address-book CRUD
  (`createAddress`/`updateAddress`/`deleteAddress`/`setDefaultAddress`,
  plus `getAddressById`), mutating the same in-memory `addresses` array
  `lib/api/site.ts#getAddresses` already reads (and Checkout's
  `initialAddresses` seeds from) — same session-scoped mock-mutation
  pattern as `createOrder`/`createBooking`, not a new `localStorage`
  store. `deleteAddress`/`setDefaultAddress` enforce exactly one default
  address at all times.
- `app/account/addresses/page.tsx` +
  `components/account/AddressBookClient.tsx` — full CRUD UI: add, edit,
  delete, set-default, over the M3-seeded address book. Deleting the
  current default promotes the first remaining address automatically.
- `lib/api/site.ts#updateUser` — mock profile-edit mutation
  (`Object.assign` onto the shared `currentUser` record). `app/account/
  profile/page.tsx` + `components/account/ProfileClient.tsx` — view/edit
  name/email/phone, member-since/referral-code meta, sign-out (→
  `/login`).
- `app/account/wishlist/page.tsx` +
  `components/account/WishlistPageClient.tsx` — grid of wishlisted
  products (filters the catalog by `useWishlist().productIds`), remove
  (unwishlist), "move to cart" (adds to the real cart via `useCart()` and
  removes from the wishlist in one action).

### Changed

- `app/layout.tsx` — wraps the app in `<AuthProvider>` (outermost) and
  `<WishlistProvider>` (innermost, alongside `CartProvider`), joining the
  existing `WalletProvider`/`CartProvider`.
- `components/product/ProductGridCard.tsx`,
  `components/product/ProductPurchasePanel.tsx` — wishlist hearts now
  read/write `useWishlist()` instead of local `useState` no-ops.
- `components/layout/HeaderClient.tsx`,
  `components/layout/MobileDrawer.tsx` — wishlist icon now shows a live
  count badge (desktop header pill; mobile drawer's utility row), same
  pattern as the existing cart badge/wallet chip.
- `lib/api/orders.ts`, `lib/api/laundry.ts` — added `getPlacedOrders()`/
  `getPlacedBookings()` (read the existing in-memory `orders`/`bookings`
  arrays `createOrder`/`createBooking` already wrote to — no behavior
  change to either mutation).

### Notes / decisions for Opus to confirm

- **Address CRUD stays a separate mock-mutation layer from Checkout's
  own inline "add address" flow**, not unified into one shared client
  store this milestone. Both ultimately read/write the same
  `lib/data/user.ts#addresses` array, but Checkout's `CheckoutClient`
  keeps its own local `addressList` state (unchanged from M3) rather than
  calling `lib/api/addresses.ts`'s mutations — verified this still works
  end-to-end (checkout still shows the seeded 3-address book and places
  orders correctly). Worth unifying once a real backend makes "the
  address book" a single source of truth everywhere, but forcing that now
  would mean touching M3's checkout flow inside an M7a brief.
- **Order/booking history fetched client-side, not via a server prop** —
  necessary (not just a style choice) for live-session orders/bookings to
  ever be visible on `/account/orders`, since `createOrder`/`createBooking`
  have no server boundary yet. This means a *server-rendered first paint*
  of `/account/orders` (e.g. a hard reload, or an SEO crawler) only ever
  sees the seeded history — acceptable for a pre-M8 account screen, but
  flagging it as a real limitation of the mock layer, not just this
  milestone's implementation choice.
- **Icon-button tap targets in new M7a components standardized on 44px**
  (address book row actions), diverging from a few pre-existing ~36-38px
  icon buttons elsewhere (`Header`, `MobileDrawer`) that this milestone
  didn't touch — flagged rather than silently drifting the convention;
  worth a follow-up pass to align the older ones if that bar matters
  platform-wide.

### Verified

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean from
`client/`. Live browser QA (`browse` skill) at 360/768/1180px: wishlist
round-trip (shop card heart → header badge → product-detail heart →
wishlist page → move-to-cart → cart), mock login (phone OTP happy path,
demo-user shortcut, sign-out → signed-out gate on `/account`), account
shell (sidebar at 1180, tab strip at 360/768, no horizontal overflow at
any width), unified orders list + detail (all 10 seeded entries, status
colors, stepper, `<AppTrackingBand>` on in-flight laundry bookings),
address CRUD (add/edit/set-default/delete, exactly one default enforced
throughout), profile edit + sign-out, and a live order placed through
Checkout mid-session correctly surfacing on `/account/orders` (client-side
navigation) with a working detail page. Re-verified M2 product/shop
hearts and M3 checkout's saved-address-book usage still work unchanged.
No console errors on any account route.

## [M6] — Wallet — 2026-07-25

The single cross-module wallet: a real (mock) ledger store
(`lib/wallet/WalletContext.tsx`, `localStorage`-persisted, mirrors
`CartContext`'s pattern exactly) backing a new `/wallet` screen, and the
back-wiring of M3 Checkout's and M4 Laundry's previously display-only
wallet-pay into real balance debits + cashback credits. New route
`/wallet` under `app/`; new feature component under `components/wallet/`
(see `docs/DESIGN-SYSTEM.md` → "M6 feature components").

### Added

- `lib/wallet/WalletContext.tsx` — `WalletProvider` + `useWallet()`:
  `balance`, `pendingCashback`, `lifetimeSaved`, `transactions`,
  `autoTopup`, `ready`, and `topUp`/`pay`/`earnCashback`/`refund`/
  `setAutoTopup`. Every ledger-mutating op appends a `WalletTransaction`
  with the correct `direction`/`category`/`balanceAfter`/`refType`/
  `refId`. `pay(amount, ref)` returns `{ ok: false }` without mutating
  state when the balance can't cover `amount`; a successful `pay` that
  drops the balance under the configured `AutoTopupRule.thresholdAmount`
  (when `enabled` + `trigger: "below-threshold"`) auto-appends a second
  `topup` credit for `topupAmount` — reactive only, it never rescues an
  insufficient payment. `topUp(amount)` above `TOPUP_BONUS_THRESHOLD`
  (₹2,000) also appends a 3% bonus credit (`category: "cashback"`),
  actually wiring the prototype's "Get 3% extra..." copy instead of
  leaving it decorative. Wrapped around the app in `app/layout.tsx`
  alongside `CartProvider`. Hydrates post-mount from `localStorage`,
  falling back to `lib/api/wallet`'s seeded mock wallet/ledger/rule on
  first-ever load — same SSR/client markup-mismatch guard `CartContext`
  established in M3, same "deliberate pre-backend client exception"
  status.
- `app/wallet/page.tsx` + `components/wallet/WalletClient.tsx` (+ CSS) —
  ported from the prototype's `isWallet` block: `WalletBalanceCard`
  (live balance, pending cashback, lifetime saved), an "Add money" card
  (`AmountPicker` presets + custom amount input → `topUp`, bonus note),
  an auto-top-up rule editor (enable checkbox + threshold + amount inputs
  — genuine M6 addition, the prototype never shows one), a pay-with-
  wallet info card (default-on messaging, no toggle), and a transaction
  history (`TransactionRow` list, all 6 categories, "View full history"
  expand with month grouping).
- Back-wired wallet-pay into `CheckoutClient.handlePlaceOrder` and
  `LaundryBookingClient.handleConfirm`: both now call `useWallet().pay()`
  when `paymentMethod === "wallet"` (referencing the created order/
  booking's number as `refId`), then `earnCashback()` — Checkout
  unconditionally (matches its pre-existing `cashbackEarned`, earned
  regardless of payment method), Laundry only when the booking's
  `walletCashback` is set (matches M4's existing wallet-only scoping).
  Both components now read `useWallet().balance` live for the
  `walletSufficient` gate and the payment-tile hint text, instead of the
  server-fetched `wallet` prop's point-in-time balance — the prop is
  still used to seed the *initial* payment-method preference (see
  "Decisions" below).
- `HeaderClient`/`MobileDrawer` — the wallet chip now reads
  `useWallet().balance` live instead of a `walletBalance` prop `Header.tsx`
  fetched once server-side (same upgrade M3 gave the cart badge). Shows
  "…" instead of a misleading ₹0 while the wallet store is still
  hydrating.
- `lib/data/wallet.ts` — added a `refund` and a `loyalty` ledger row (the
  prototype's 6 sample rows only covered `topup`/`cashback`/`payment`/
  `referral`) so the seeded history exercises all 6
  `WalletTransactionCategory` values; `balanceAfter` reconciled backwards
  from the unchanged ₹1,250 current balance across all 8 rows. Added
  `defaultAutoTopupRule` (off by default, `below-threshold`, ₹300/₹1,000).
  `lib/api/wallet.ts` — added `getAutoTopupRule()`.

### Decisions for Opus to confirm

- **`preferredPaymentMethod`'s initial value is seeded from the
  server-fetched `wallet` prop, not the live `useWallet().balance`** —
  found during QA: `WalletContext` hydrates from `localStorage`
  *after* mount (same as `CartContext`), so on a hard navigation/reload
  the live balance briefly reads 0, which would wrongly default this
  one-time preference to Razorpay even when `payWithWalletDefault` is on
  and the real balance is healthy. The prop is only ever a starting
  guess; `walletSufficient` (live) still gates the *effective*
  `paymentMethod` on every render, so this can never let an actually-
  insufficient wallet get selected — just avoids a wrong default.
- **Cashback timing: earned immediately into `balance` + `lifetimeSaved`
  at order/booking placement**, not held in `pendingCashback` until some
  later "clearance" event — no clearance flow is scoped for M6, and this
  matches the pre-existing UI copy ("Earn ₹X cashback on this order")
  and the seed ledger's own cashback rows, which were always direct
  balance credits. `pendingCashback` stays a separate, currently-static
  display figure (not touched by any M6 op) — flagging as a gap a real
  clearance-window feature would need to fill in later (M7/M8).
- **`refund()` credits `balance` but not `lifetimeSaved`** — a refund
  returns the shopper's own money rather than saving them anything, so it
  shouldn't inflate the "lifetime saved" figure the way cashback does. No
  order-level "request a refund" UI exists yet (out of scope per the
  brief — "a full order-level UI can live in M7"); `refund()` and the
  `refund` ledger category are exercised today only via the seed data.
- **Auto-top-up editor has no UI for the `scheduled` trigger** — only
  `below-threshold` (enable + threshold + amount), matching the DoD's
  "auto-top-up fires on low balance." `AutoTopupRule.trigger` stays a
  2-value union on the type; a scheduled/recurring top-up UI is a fair
  future add if wanted.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/wallet` prerenders statically alongside every other
  route; `/checkout`/`/product/[slug]`/`/shop`/`/storefront/[vendor]`/
  `/collections/[occasion]` still build as before (dynamic/static
  unchanged).
- Live QA via headless browser at 360/768/1180px: `/wallet` — selected a
  preset tile then a custom amount (₹3,000, above the ₹2,000 bonus
  threshold) and confirmed both `topUp` calls updated the balance card,
  the header chip, and prepended the correct ledger rows (a "Top-up bonus
  (3%)" row above its "Wallet top-up" row, exact 3% amount); toggled
  auto-top-up on with a threshold above the live balance; expanded "View
  full history" (11 rows, correctly month-grouped) and collapsed it back.
  Full wallet-paid checkout loop: added a product to cart, `/checkout`
  defaulted to Wallet (live balance/cashback shown), placed the order —
  balance debited the order total, then auto-top-up fired (balance had
  dropped under the configured threshold), then cashback credited; header
  chip and `/wallet`'s ledger reflected all three new rows in the correct
  order with correct signs/colors. Repeated for a full wallet-paid
  Laundry booking (`/laundry` → Confirm pickup) with the same result,
  confirming cashback was correctly gated to the wallet-paid case only.
  Forced an insufficient-balance state (₹50) via `localStorage` and
  reloaded both `/checkout` and `/laundry`: the Wallet tile correctly
  showed `disabled` + "insufficient for this order/estimate" and the
  effective payment method fell back to Razorpay on both screens; placed
  a Razorpay order from that state and confirmed cashback still credited
  (Checkout's "earned on every order" rule) with no wallet debit. Zero
  console errors at any width, zero horizontal overflow
  (`document.documentElement.scrollWidth === clientWidth` verified at
  360px), auto-top-up-rule fields and toggle measured — the toggle
  row initially measured 21px tall (a real gap found during QA, same
  category as M3's under-44px text-link fix); padded its hit area to 45px
  without changing the visible checkbox/label size.
- Colors verified: pine primary (balance card gradient, buttons), gold
  decorative-only (`ADD MONEY`/`AUTO TOP-UP` eyebrows, bonus note at
  small size via `--hk-gold-text-sm`, "Last 30 days"/"All time" meta),
  terracotta on debit rows (`↑ − ₹560` etc.) — matching `TransactionRow`'s
  existing credit-green/debit-terracotta convention. Wallet gold-tint
  surfaces (`--hk-gold-tint`/`--hk-gold-border` on the pay-with-wallet
  info card) match the prototype's own `#FBF1D6`/`#E4CF8F` panel exactly.

### Notes for M7/M8

- **M7 (Account)** owns a real order-level "request a refund" UI —
  `refund()` and the `refund` ledger category exist and work today, just
  with no UI trigger beyond the seed data.
- **`pendingCashback` has no clearance flow** — it's a static seeded
  figure M6 displays but never mutates; a real "cashback pending N days
  before it clears into balance" feature is unbuilt (see "Decisions"
  above). Whoever builds it should decide whether `earnCashback` moves to
  crediting `pendingCashback` first, with a separate "release" op moving
  it into `balance` once real clearance timing exists.
- **M8 (backend)** must make the ledger **server-authoritative and
  idempotent** — today's entire implementation
  (`lib/wallet/WalletContext.tsx`) computes `balanceAfter` client-side and
  trusts its own `localStorage`, exactly the anti-pattern
  `docs/DATA-MODEL.md` already flags as unacceptable long-term. M8 needs:
  a real `/api/wallet` ledger table where the server (not the client)
  computes and writes `balanceAfter` inside the same transaction that
  mutates `Wallet.balance`; idempotency keys on `pay`/`topUp` calls (so a
  retried request from a flaky connection can't double-charge or
  double-credit); and the order-placement + wallet-debit sequence in
  `CheckoutClient`/`LaundryBookingClient` becoming one atomic transaction
  server-side (today `createOrder`/`createBooking` and the wallet `pay()`
  are two separate, non-rollback-able mock calls — a `pay()` failure after
  a successful mock `createOrder` leaves an inconsistent local order with
  no wallet debit, a known mock-layer gap called out inline in both
  components).

## [M5] — Snacks + Food Delivery promo — 2026-07-25

Snacks' browsable menu + WhatsApp-only ordering, and a new `/app-promo`
page for full meals. Channel-critical milestone: Snacks carries no
on-site cart/checkout (`lib/channel.ts` — `hasCartOnWeb`/
`hasCheckoutOnWeb` both `false`), and full meals carries no menu
(`hasMenuOnWeb: false`) — both pages assert their channel rule in code
and throw if it's ever relaxed without a deliberate redesign. Snacks is
ported from the prototype's `isSnacks` block
(`handoff/prototype/Homekrafted.dc.html`); `/app-promo` has no prototype
screen and is new M5 content. New routes `/snacks`, `/app-promo` under
`app/`; new feature components under `components/snacks/` (see
`docs/DESIGN-SYSTEM.md` → "M5 feature components").

### Added

- `app/snacks/page.tsx` (+ `Snacks.module.css`) — server wrapper: fetches
  snacks + category filters via `lib/api`, renders the hero (`ChannelBadge
  channel="snacks"`, "No checkout — we reply on chat" pill, title, copy),
  asserts `getChannelRule("snacks")` still has `hasCartOnWeb`/
  `hasCheckoutOnWeb` both `false`, hands data to `SnacksClient`.
- `components/snacks/SnacksClient.tsx` (+ CSS, `"use client"`) — category
  `Chip` row filtering a `SnackCard` grid; a local snack-list selection
  (`Record<snackId, quantity>` state, never `useCart`) rendered through
  `StickySummary` (`stickyOnMobile`) with a `QuantityStepper` + remove per
  line and a real computed estimate total; "Send list on WhatsApp"
  (`Button variant="whatsapp"`) opens a `wa.me` link built from
  `buildSnackListMessage` + `buildWhatsAppLink`; a second card below shows
  the informational WA order-status `StatusTimeline` (`tone="whatsapp"`:
  received → accepted → out for delivery) and a "full meals & live
  tracking are on the app" note.
- `app/app-promo/page.tsx` (+ `AppPromo.module.css`) — full-meals promo:
  dark-gradient hero (`ChannelBadge channel="full-meals"`, headline,
  `mealPromo.description`, `StoreBadges`, hero `ImageSlot`), a "why the
  app" 4-card value-prop grid (fresh copy — live rider tracking, full
  meal menus, faster reordering, app-only offers), and a "get the app"
  section reusing `components/home/AppInstallPanel` as-is. Asserts
  `getChannelRule("full-meals").hasMenuOnWeb` is still `false`.
- `lib/snacks/message.ts` — `buildSnackListMessage(items, estimateTotal)`,
  formats the WhatsApp order text from a live selection, matching
  `sampleSnackList.whatsappPayload`'s wording so a real list and the mock
  fixture read identically in chat.
- `lib/messaging.ts` — exported `HOMEKRAFTED_WHATSAPP_NUMBER` (was a
  private literal inside `ClickToChatMessaging`) so `SnacksClient` can
  build its own outbound `wa.me` link via `buildWhatsAppLink` directly
  (the customer messages the business here, not the reverse, so it
  doesn't go through `Messaging.sendStatus`) without re-hardcoding the
  number.
- `lib/data/snacks.ts` — `SnackCategoryFilter` type + `snackCategoryFilters`
  ("All" + the 4 `SnackCategory` values, ported from the prototype's
  `snackCats`), typed locally like `NavItem` rather than joining
  `lib/types/food.ts` (it's a UI filter option, not a schema entity).
  `lib/api/snacks.ts` — `getSnackCategoryFilters()` getter, re-exports the
  `SnackCategoryFilter` type.

### Decisions for Opus to confirm

- **`SnackCard`'s add/added toggle sets quantity 1; a `QuantityStepper`
  in the sticky list adjusts it from there** — the prototype's snack list
  only ever renders a static "×1", no interactivity. `SnackListItem`
  already had a `quantity` field, so this uses the schema as designed
  rather than leaving every line permanently at 1.
- **`ChannelBadge` replaces the prototype's plain mono-text eyebrow** on
  both pages (same substitution `CraftCard` made on Home in M2) — badge
  copy now sources from `lib/channel.ts` instead of being hand-typed per
  screen.
- **`/app-promo`'s "why the app" value props are new copy**, not a port —
  the prototype has no dedicated Food Delivery screen (only the dark
  "Coming soon" card on Home, already ported as `CraftCard` in M2).
- **WA status timeline is static/illustrative** (received done, the rest
  pending) exactly like the prototype's fixed `waSteps` — not wired to
  the actual send action. A real per-order status feed is an M9 (WhatsApp
  Cloud API) concern, noted below.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — both `/snacks` and `/app-promo` prerender statically.
- Live QA via headless browser at 360/768/1180px on both routes: zero
  console errors, zero horizontal overflow at any width. On `/snacks`:
  category chips filter the grid without clearing the snack list;
  clicking "+ Add"/"✓ Added" toggles list membership; the
  `QuantityStepper` recomputes the estimate live (verified 2× Masala
  Mathri (₹120) + 1× Chakli Spirals (₹110) → Estimate ₹350); "Send list on
  WhatsApp" is disabled with an empty list and opens
  `https://wa.me/919999999999?text=Hi%20Homekrafted!%20I'd%20like%20to%20order%3A%0A2x%20Masala%20Mathri%0A1x%20Chakli%20Spirals%0A%0AEstimated%20total%3A%20%E2%82%B9350`
  once populated; the sticky list's CTA bar confirmed `position: fixed`
  to the viewport bottom below 640px (`stickyOnMobile`, same M3
  mechanism). On `/app-promo`: hero/value-props/install panel all render,
  no menu/cart/checkout markup present at any width.
- Tap targets: `QuantityStepper` buttons and `SnackCard`'s "+ Add"/quantity
  controls measured; the snack-list row's remove "✕" is 24×24px, matching
  `HamperBasket`'s already-reviewed M3 remove-button precedent exactly
  (not a new gap introduced here) — flagging since it's under the 44px
  guideline, same as that established pattern.
- Colors verified: WhatsApp green (`--hk-whatsapp`/`-deep`/`-tint`/
  `-border`) confined to `/snacks` and the Snacks-related Home surfaces
  only; `/app-promo` reuses the existing dark-gradient/gold-bright
  "app-only" palette, no WhatsApp green on that page.

### Notes for M9

- **WA status timeline is display-only** — `StatusTimeline`'s three steps
  (received/accepted/out-for-delivery) don't reflect a real per-order
  state today. M9's WhatsApp Cloud API integration is the natural hook to
  make this live: a real `SnackList.status` transition (already modeled
  in `lib/types/food.ts`) driving which step shows `done`/`current`,
  pushed via `Messaging.sendStatus` (the `Messaging` interface in
  `lib/messaging.ts` is already implementation-swappable — see its
  `CloudApiMessaging` stub) instead of the current click-to-chat-only
  flow where a human replies manually in WhatsApp.
- **`buildSnackListMessage`/`buildWhatsAppLink` stay the "compose" half**
  of ordering even after M9 — Cloud API automation would consume the same
  formatted list server-side (e.g. to auto-acknowledge an inbound
  message) rather than replacing how the message is built.

## [M4] — Laundry booking flow — 2026-07-24

The Laundry, Cleaning & Ironing bookable flow: service picker (all 3
pricing models), two-slot pickup/delivery scheduling, dry-clean item
count + photo estimate, special instructions, a recurring-subscription
toggle, wallet/online/COD payment, and a mock booking confirmation with a
basic status line + an app-tracking band. Ported from the prototype's
Laundry screen (`handoff/prototype/Homekrafted.dc.html`, `isLaundry`
block: hero, service picker, pickup slot, how-it-works, booking summary,
app-tracking band), extended with the pieces the prototype doesn't have
(separate delivery slot, item photos, special instructions, subscription,
COD, real confirmation state). New route `/laundry` under `app/`; new
feature components under `components/laundry/` (see
`docs/DESIGN-SYSTEM.md` → "M4 feature components").

### Added

- `app/laundry/page.tsx` — server wrapper: fetches services, pickup/
  delivery availability, "how it works" steps, subscription plan
  options, the wallet, and the default address via `lib/api`, hands them
  to `LaundryBookingClient`.
- `components/laundry/LaundryBookingClient.tsx` (+ CSS) — the full
  booking form: `ServiceCard` grid (Wash & Fold `per-kg`, Dry Clean
  `per-item`, Steam Ironing `per-item`, Home Cleaning `per-hour`, all
  three pricing models exercised), a shared `QuantityStepper` relabeled
  per pricing model (weight/items/hours) driving the live estimate,
  `PhotoUpload` shown only for the item-priced services, two independent
  `SlotPicker` pairs (pickup day+time, delivery day+time — the prototype
  only had one pickup picker), `Textarea` for special instructions, a
  recurring-subscription toggle + weekly/biweekly/monthly `Chip` picker,
  wallet/online(Razorpay-stub)/COD payment tiles (wallet defaults on when
  `wallet.payWithWalletDefault && balance > 0`, auto-falls-back to
  Razorpay if the balance can't cover the estimate — same derived-value
  pattern as `CheckoutClient`'s bugfix), and a `StickySummary`
  (`stickyOnMobile`) booking summary whose CTA calls the mock
  `createBooking` (+ `createSubscription` when the toggle is on) and
  swaps in `LaundryBookingConfirmation`. Validates the delivery date
  isn't before the pickup date before submitting.
- `components/laundry/LaundryBookingConfirmation.tsx` (+ CSS) — post-
  booking state (not a separate route, mirrors `OrderConfirmation`):
  booking number, `StatusTimeline` (scheduled → picked-up → in-progress →
  out-for-delivery → delivered, first step done, no live tracking), line-
  item summary, cashback line when paid by wallet, "Book another pickup"
  CTA that resets the form.
- `components/laundry/AppTrackingBand.tsx` (+ CSS) — the closing "Live
  rider tracking is on the app" band, ported from the prototype's dark
  gradient card (same `#2B241C→#3a3025` recipe as Home's food-delivery
  `CraftCard`). Composes `<ChannelBadge channel="full-meals">` (reusing
  its "On the app · Coming soon" gold-dark pill for this app-only
  feature) and `<StoreBadges variant="outline">` (real store links,
  replacing the prototype's static "Notify me →" pill). Rendered
  whether or not a booking has been placed yet, enforcing
  `lib/channel.ts`'s `liveTracking: "app-only"` rule in the UI itself —
  no map/rider tracking is ever rendered on web.
- `lib/api/laundry.ts` — `createBooking(input)` and
  `createSubscription(input)` mock mutations (in-memory arrays, same
  reset-on-reload caveat as `lib/api/orders.ts`'s `createOrder`), plus
  `getLaundrySubscriptionPlanOptions()`. `lib/data/laundry.ts` —
  `laundrySubscriptionPlanOptions` (weekly/biweekly/monthly labels+
  hints) and `nextBookingNumber()` (an "LB"-prefixed sequence, kept
  visually distinct from `Order.orderNumber`'s "HK" prefix for the M7
  unified order-history list).
- `lib/types/laundry.ts` — `LaundryBooking.bookingNumber: string`, the
  same id/human-number split `Order` already has. Every other M4 field
  (`pickupSlot`/`deliverySlot`, `photos`, `specialInstructions`,
  `subscriptionId`, `paymentMethod`) was already on the type from M0.

### Decisions for Opus to confirm

- **`LaundryBooking.bookingNumber` is a new field**, added because the
  confirmation screen needed a short human-readable number ("Booking
  #LB1042") the same way `Order.orderNumber` backs Checkout's
  confirmation — `id` alone (`lb-<timestamp>`) isn't customer-facing.
- **`AppTrackingBand` reuses the `full-meals` channel badge** ("On the
  app · Coming soon") rather than adding a fourth `ChannelBadgeVariant` —
  the band's message is specifically about live tracking being an
  app-only feature, which is exactly what that badge already says;
  flagging in case a dedicated "tracking" badge variant is wanted later.
- **Booking form keeps the last-picked service selection across "Book
  another pickup"** (only the booking/photos/instructions reset) —
  matches a real re-order flow better than snapping back to Wash & Fold
  every time, but flagging since nothing in the brief specified this
  either way.
- **No address picker on `/laundry`** — bookings post to the account's
  single default address (`getDefaultAddress()`), same simplification
  Checkout's M3 build didn't have this problem for (it has full
  multi-address). Full address selection here is a fair M7 add once
  address-book CRUD exists, not required by this milestone's brief.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/laundry` prerenders statically.
- Live QA via headless browser at 360/768/1180px: service picker cycles
  through all 4 services (photo upload confirmed appearing only for Dry
  Clean/Steam Ironing, disappearing for Wash & Fold/Home Cleaning),
  independent pickup + delivery day/slot selection, item photo add/
  remove, subscription toggle + plan chip selection, all three payment
  tiles (wallet auto-shows cashback, wallet tile disables when balance
  is insufficient), delivery-before-pickup validation confirmed blocking
  submission with an inline error, successful booking → confirmation
  screen (booking number, status timeline, summary, no cashback line
  when paid COD, app-tracking band) → "Book another pickup" resets and
  returns to the form. Zero console errors, zero horizontal overflow at
  any width, sticky summary's CTA correctly bottom-anchors below ~640px
  (clears via the same `stickyOnMobile` pattern M3 established), all
  M4-specific tap targets (`ServiceCard`, photo tile, payment tiles,
  "Confirm pickup") measured ≥44px.
- Colors verified: pine primary/headings, gold decorative-only (eyebrows,
  "choose a service"/"how it works" labels), terracotta on service prices
  (matches the M1-documented laundry-price-uses-terracotta port), the
  prototype's laundry green tint reused via `--hk-pine-tint` for the hero
  gradient and `AppTrackingBand`'s dark gradient reusing the exact
  `CraftCard` food-variant recipe.

### Notes for M6/M7/M8

- **M6 (Wallet)** owns the real wallet-debit ledger entry — `createBooking`
  currently only records `walletCashback` on the `LaundryBooking` without
  writing a `WalletTransaction` or decrementing `Wallet.balance`, same gap
  M3's `createOrder` has.
- **M7 (Account)** unifies Marketplace `Order`s and `LaundryBooking`s into
  one `/account/orders` list (per `docs/PRD.md`) — the "LB"/"HK" number
  prefixes are deliberately distinct so that list can visually
  disambiguate the two without a separate "type" column. No address
  picker exists on `/laundry` yet (bookings use the single default
  address) — worth adding once address-book CRUD lands.
- **M8 (backend)** swaps `lib/api/laundry.ts`'s in-memory `bookings`/
  `subscriptions` arrays and `nextBookingNumber()` sequence for real
  Postgres tables/endpoints (`POST /api/v1/laundry/bookings` +
  `/subscriptions`, per `docs/API.md`) — same call-site-stable swap
  `lib/api/orders.ts` is already set up for.

## [M3] — Buy flow — 2026-07-24

The Gifting Marketplace's buy flow: Hamper builder, Cart, and
multi-address Checkout with gift-to-recipient — the first milestone with
real cross-page client state. `lib/cart/CartContext.tsx` is a
`localStorage`-persisted React context (no backend yet); every
add-to-cart control from M2 (`ProductPurchasePanel`, `ProductGridCard`)
and the header cart badge now read/write it for real. New routes
`/hamper`, `/cart`, `/checkout` under `app/`; new feature components
under `components/{hamper,cart,checkout}/` (see `docs/DESIGN-SYSTEM.md` →
"M3 feature components").

### Added

- `lib/cart/CartContext.tsx` — `CartProvider` + `useCart()`: `items`,
  `hampers` (assembled `Hamper` records handed off from `/hamper`),
  `addItem`/`updateQty`/`removeItem`/`assignAddress`/`addHamperItem`/
  `clear`, derived `count`/`subtotal`, and `lineInfo()` (resolves a
  product-or-hamper line to display data). Hydrates from `localStorage`
  after mount (avoids an SSR/client markup mismatch) and loads the
  product/hamper-box catalog once via `lib/api` for price resolution.
  Wrapped around the whole app in `app/layout.tsx`. Documented as the
  deliberate pre-backend exception to "components only read via
  `lib/api`" — M8 swaps its internals for server-backed calls without
  changing any `useCart()` call site.
- `lib/cart/pricing.ts` — shared shipping/cashback math
  (`computeShipping`, `computeCashback`, `SHIPPING_FEE`,
  `FREE_SHIPPING_THRESHOLD`, `CASHBACK_RATE` — flat 5%, matching the
  existing product/home copy) so Cart, Checkout, and the mock
  `createOrder` never compute different numbers for the same cart.
- `app/hamper/page.tsx` + `components/hamper/HamperBuilderClient.tsx` (+
  `HamperFillTile`, `HamperBasket`) — the hamper builder, ported from the
  prototype's combined Box+Fill screen but split into a real 3-step
  wizard (Box → Fill → Message; `StepPills`' 4th "Checkout" pill is
  reached by navigating away, not rendered locally): box-size picker,
  capacity-capped fill grid, gift note/wrap/ribbon/name-card message
  step. Finishing calls `useCart().addHamperItem` (assigns the hamper an
  id, stores it, adds one `hamperId` cart line) and routes into
  `/checkout`.
- `app/cart/page.tsx` (+ CSS) — line items (`CartLineRow`: image, name,
  weight/hamper label, unit price, `QuantityStepper`, remove), order
  summary (subtotal, shipping, wallet-cashback preview, total), empty
  state, "Proceed to checkout" CTA. Client component directly (no
  server/client split) — there's no unique server fetch, the cart store
  already resolves its own pricing.
- `app/checkout/page.tsx` + `components/checkout/CheckoutClient.tsx` (+
  `AddressForm`, `OrderConfirmation`) — multi-address split (group cart
  lines by assigned address, per-group `SlotPicker` delivery date, inline
  "add address"), a single order-wide gift-to-recipient toggle (recipient
  address + hide-price + message — ships the *whole* order to one
  recipient rather than mixing with per-item multi-address splitting),
  wallet/Razorpay payment (wallet auto-falls-back to Razorpay when
  balance can't cover the total), and an in-place order-confirmation
  state (order number, basic status stepper, no live tracking) on
  successful `createOrder`.
- `lib/api/orders.ts` — `getDeliveryDateOptions()`, `createOrder(input)`
  (mock mutation: computes subtotal/shipping/cashback from
  `lib/cart/pricing`, generates an id + order number, "persists" to an
  in-memory array). `lib/data/orders.ts` — `deliveryDateOptions` (4
  real-2026-weekday options) + `nextOrderNumber()` sequence continuing
  from the wallet ledger's existing `HK2043` sample. Both mutation and
  sequence run in the browser tab (called from a client component, no
  "use server" boundary) — they reset on a hard reload/new tab, not a
  server restart; same caveat as the cart itself would have without
  `CartContext`'s `localStorage` persistence.
- `lib/data/user.ts` — `addresses[]` (3 seeded addresses: Home/Office/
  Amma's place) replacing the single M0 `demoAddress`, + `getAddressById`.
  `lib/api/site.ts` — `getAddresses()`.
- `lib/api/products.ts` / `lib/data/products.ts` — `getProductById`
  (cart/hamper lines only persist `productId`, need this to resolve a
  line's product record).
- `components/ui/StickySummary` gained two additive props —
  `beforeLines?` (slots a `<CapacityMeter>` between the title and line
  items, keeping the Hamper basket one bordered card) and
  `stickyOnMobile?` (pins the CTA to a fixed bottom bar below ~640px so
  a long scrollable list never buries the primary action). Both
  off-by-default; every existing call site renders unchanged.
- `lib/types/marketplace.ts` — `CartItem`/`OrderItem` are now
  polymorphic (`productId`+`sku` *or* `hamperId`, optional instead of a
  required `productId`) to model a hamper as a real cart/order line;
  `Order.deliveryDate` (single, order-wide) replaced by `Order.shipments:
  OrderShipment[]` (`{addressId, deliveryDate?}`, one per shipping
  address) for real per-address delivery dates.

### Decisions for Opus to confirm

- **Gift-to-recipient ships the whole order to one recipient**, rather
  than being combinable with per-item multi-address splitting — you're
  either shipping your cart across your own saved addresses, or sending
  the entire order to someone else as a gift, not both at once. Simpler
  mental model, matches how gifting actually works; flag if a mixed
  "some items to me, one item to a gift recipient" flow turns out to be
  wanted.
- **Hamper's recipient/hide-price fields go unused by the builder UI** —
  `Hamper.recipientAddressId`/`hidePrice` exist on the type (from M0) but
  the Message step only sets `giftNote`/`wrap`/`ribbon`/`nameCard`;
  gift-to-recipient is Checkout's order-wide `Order.gift`, applied
  uniformly whether the cart holds products, a hamper, or both.
- **Hamper builder is 3 real wizard steps, not the prototype's one
  combined Box+Fill screen** — `StepPills` implies a genuine wizard, so
  Box and Fill were split into their own screens (box picker only, then
  fill grid only) rather than reproducing the prototype's single static
  view with both visible at once.
- **Checkout's inline "add address" and the gift-recipient form share
  one `AddressForm` field-set component** rather than each rolling their
  own inputs — same fields (name/phone/line1/line2/city/state/pincode),
  no existing `ui/` text-input primitive to reuse.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/hamper`, `/cart`, `/checkout` all statically prerender.
- Live QA via headless browser at 360/768/1180px: full flow exercised
  end-to-end — add from Product detail *and* a Shop grid card → header
  badge updates on both → Cart (qty edit, remove, merge-on-re-add
  confirmed) → Checkout (multi-address reassignment, per-address
  delivery date, gift-to-recipient with hide-price + validation on an
  incomplete recipient form, wallet vs. Razorpay) → place order → order
  confirmation → cart cleared (`localStorage` verified empty) — twice,
  once as a plain product order and once as a hamper (Box→Fill,
  capacity-capped at 5/5 for Signature confirmed disabling further
  "+ Add"s →Message→ hand-off into Checkout as one line). Reloaded mid-
  cart to confirm `localStorage` persistence survives a refresh.
  Zero console errors, zero horizontal overflow at any width, tap
  targets re-checked ≥44px on mobile (two found under 44px during QA —
  Cart's "Remove"/"Continue shopping" text links — padded to a 44px hit
  area without growing the visible text).
- Colors verified: pine primary/headings, gold decorative-only (eyebrows,
  capacity fraction, cashback lines), terracotta on marketplace prices/
  remove — the Hamper fill-grid/basket item prices intentionally stay
  pine (not terracotta), matching the prototype's own hamper screen
  exactly (only the box-tier price is terracotta there).
- Found and fixed one real bug during QA: the wallet payment tile could
  end up simultaneously `disabled` (insufficient balance) and visually
  "selected" when a hamper hand-off grew the cart total after Checkout
  had already picked a default payment method — `paymentMethod` is now a
  *derived* value (`walletSufficient ? preferredPaymentMethod :
  "razorpay"`) instead of state that could go stale, so it can never
  under-report `walletApplied` at order time.
- Found and fixed one design gap during QA: the initial mobile "sticky
  aside" (`position: sticky; bottom: 0` on the whole card) never
  actually stuck — a long fill grid or address list scrolls the aside's
  normal-flow position far below the fold before sticky has anything to
  pin against. Replaced with `StickySummary`'s new `stickyOnMobile` prop
  (fixed-position CTA bar only, card stays in flow) — verified by
  scrolling a long Hamper fill grid and confirming the CTA stays pinned.

### Notes for M4/M6/M8

- **M4 (Laundry)** can reuse `StickySummary`'s new `beforeLines`/
  `stickyOnMobile` props for its own booking summary if useful — both
  are additive and off by default.
- **M6 (Wallet)** owns the real wallet-debit ledger entry on order
  placement — `createOrder` currently just records `walletApplied` on
  the `Order` without writing a `WalletTransaction` or decrementing
  `Wallet.balance`; M6 should wire that ledger write in.
- **M7 (Account)** owns full address-book CRUD — Checkout's inline "add
  address" only appends to an in-session list (`lib/data/user.ts`'s
  `addresses[]` isn't mutated); order history/detail (`/account/orders`)
  reads the `Order`s `createOrder` produces.
- **M8 (backend)** swaps `lib/cart/CartContext`'s `localStorage`
  read/write for server-backed calls (same `useCart()` shape), and
  `lib/api/orders.ts`'s in-memory array/sequence for a real Postgres
  `Order` table — both currently run client-side with no persistence
  beyond a browser tab/session, called out inline in each file's
  comments.

## [M2] — Marketplace browse — 2026-07-24

The Gifting Marketplace's read/browse surfaces: Home, Shop listing,
Product detail, Maker storefront, Occasion collections, and a new
Reviews UI — all ported from `handoff/prototype/Homekrafted.dc.html`
(Home/Shop/Product) or built from the same design language for the two
screens the prototype doesn't cover (Storefront, Collections — both
spec'd in `handoff/specs/screens.md` under "To build"). Composes the 26
M1 primitives; adds feature components under `components/{home,product,
storefront,review}/` (see `docs/DESIGN-SYSTEM.md` → "M2 feature
components"). Cart/checkout/hamper stays out of scope — M3.

### Added

- `app/page.tsx` (+ `page.module.css`) — full Home, replacing the M0
  placeholder: hero (`components/home/Hero.tsx`), shop-by-occasion
  (`OccasionTileLink` → `/collections/[occasion]`), shop-by-category
  (`CategoryTileLink` → `/shop?category=`), "this week's small batches"
  featured rail, hamper + wallet `PromoBand`s, "One home, three crafts"
  services band (`CraftCard` × 3 — Laundry/Food Delivery/Snacks, each
  sourcing its badge from `lib/channel.ts`), and the app-install panel
  (`AppInstallPanel`).
- `app/shop/page.tsx` + `ShopClient.tsx` (+ CSS) — filter sidebar
  (category/dietary/occasion checkboxes + `PriceRange`), sort (most
  loved/price asc/desc), removable active-filter chips, `ProductGridCard`
  grid, pagination (6/page). All filter/sort/pagination state is
  client-side over the mock catalog. `?category=`/`?occasion=` query
  params (set by Home's tiles) seed the initial selection. Sidebar
  collapses to a "Filters" toggle below 900px.
- `app/product/[slug]/page.tsx` (+ CSS, `notFound()` on a bad slug) —
  gallery (`ProductGallery`), maker eyebrow linking to the storefront,
  title, rating, `ProductPurchasePanel` (weight chips, quantity, wallet
  cashback line recomputed per selected weight, add-to-cart as a local
  no-op + inline toast — M3 owns real cart, add-to-hamper CTA, gift
  block), and `ProductTabs` (Description + spec table / Reviews).
- `app/storefront/[vendor]/page.tsx` (+ CSS, `notFound()` on a bad slug)
  — `StoreHeader` (banner, avatar, name, rating, `FollowButton`, bio,
  location), that vendor's `ProductGridCard` grid, and their reviews.
- `app/collections/[occasion]/page.tsx` (+ CSS, `notFound()` on a bad
  slug) — occasion hero + `ProductGridCard` grid. Uses the curated
  `Collection` (title/description/hand-picked order) when one exists for
  the occasion (Diwali, Corporate), else falls back to a plain
  `getProductsByOccasion` filter so every occasion slug still resolves.
- `components/review/ReviewCard.tsx` + `ReviewList.tsx` (+ CSS) — star
  row, author + `formatDate`, verified-purchase badge, body; reused on
  Product detail and Storefront.
- `components/product/ProductGridCard.tsx` — thin client wrapper around
  `ProductCard` (navigate on click, local wishlist/"added" state); the
  one shared piece every product grid in M2 reuses.
- `lib/data/reviews.ts` + `lib/api/reviews.ts` — 27 seeded reviews across
  products and vendors (`getReviewsForProduct`/`getReviewsForVendor` data
  helpers, `getProductReviews`/`getVendorReviews` API functions).
- Small `lib/data`/`lib/api` additions needed for the new lookups:
  `getCategoryById`, `getVendorById`, `getCollectionByOccasionId` (data)
  and their `lib/api` counterparts — all following the existing
  by-slug getter pattern.

### Decisions for Opus to confirm

- **Home's occasion tiles now link to `/collections/[occasion]`** rather
  than the prototype's undifferentiated `goShop()` — a deliberate M2
  extension now that Collections is a real route, not a demo screen
  switch. Category tiles link to `/shop?category=[slug]` for the same
  reason (real filtering vs. the prototype's flat click-through).
- **Shop's price-range bounds are computed from the live product set**
  (`Math.min`/`Math.max` over each product's default-weight price)
  rather than the prototype's hardcoded ₹120–₹1,500 — ties the filter to
  real data instead of a demo constant that would silently go stale.
- **Reviews tab on Product detail is a genuine M2 addition** — the
  prototype never shows reviews anywhere; built to spec via
  `handoff/specs/screens.md`'s "Ratings & reviews" line item and the
  `Review` type that was already in `lib/types/shared.ts` from M0.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — all 6 new/changed routes compile (`/`, `/shop`,
  `/product/[slug]`, `/storefront/[vendor]`, `/collections/[occasion]`
  dynamic; `/` static).
- Live QA via headless browser at 360/768/1180px across all 6 surfaces
  plus `?category=`/`?occasion=` query variants: zero console errors,
  zero horizontal overflow, two-column sections collapse to one column
  on mobile, Shop's sidebar collapses to a working "Filters" toggle,
  weight-selector price/cashback recompute live, Reviews tab renders,
  `notFound()` confirmed on bad `/product`, `/storefront`, `/collections`
  slugs. Fixed one bug found in QA: `StoreHeader`'s vendor name/rating/
  follow button were overlapping the banner image at all three widths
  (the banner-overlap negative margin was applied to the whole header row
  instead of just the avatar) — moved the `-40px` overlap onto `.avatar`
  alone so only the avatar pokes over the banner, matching the intended
  profile-header look.
- Colors verified: pine primary, gold decorative-only (eyebrows, "view
  all"), terracotta on prices, WhatsApp green confined to the Snacks
  `CraftCard` and its `ChannelBadge`.
- Channel correctness on Home confirmed against `lib/channel.ts`:
  Laundry badge is "Book online now" (pine) linking to `/laundry`, Food
  Delivery is "On the app · Coming soon" (gold-dark) with no web
  order path, Snacks is "Order on WhatsApp" (whatsapp) linking to
  `/snacks`.

### Notes for M3

- Add-to-cart in `ProductPurchasePanel` is a local no-op (`added` state +
  inline toast, no cart mutation) — M3 should wire it to a real
  `lib/api` cart mutation, using `selectedSku` + `quantity` (already
  tracked in that component's local state) as the payload shape.
- `ProductGridCard`'s wishlist toggle is local-only (no persistence) —
  M3/M7 should lift this to a real wishlist mutation once one exists;
  the prop shape (`wishlisted`/`onToggleWishlist`) is already what
  `ProductCard` expects.
- `Product.weightOptions` (sku/label/price/mrp/stock) is the shape M3's
  cart line items should key off — `ProductPurchasePanel` already
  resolves the selected `WeightOption` by `sku`, so a cart item is just
  `{ productId, sku, quantity }` plus whatever `giftWrap`/`addressId`
  checkout adds.

## [M1] — UI primitives — 2026-07-24

26 `components/ui/` primitives ported from `handoff/design-system/components.md`
into CSS Modules over `tokens.css`, plus the dev-only gallery used to QA them.
Built against the now-monorepo layout (`client/` holds all web source;
`server/` and root `app/` are M8+/future placeholders).

### Added

- `client/components/ui/` — all 26 primitives from the component inventory:
  `Button`, `QuantityStepper`, `Chip`, `ChannelBadge`, `Tag`, `DietDot`,
  `Card`, `ProductCard`, `CategoryTile`, `OccasionTile`, `SnackCard`,
  `ServiceCard`, `PromoBand`, `WalletBalanceCard`, `StickySummary`,
  `SearchField`, `SlotPicker`, `AmountPicker`, `PriceRange`, `PhotoUpload`,
  `Textarea`, `StepPills`, `CapacityMeter`, `StatusTimeline`,
  `TransactionRow`, `QRTile`, `StoreBadges`. Named exports, `Thing.tsx` +
  `Thing.module.css` co-located, every image area routed through
  `<ImageSlot>`, every color a `var(--hk-...)` token reference.
- `client/styles/tokens.extend.css` — centralizes the M0-flagged token
  gaps (on-pine copy, small-size gold text, the footer's on-pine-deep
  ramp, the scrollbar tint) as real custom properties instead of
  hardcoded-per-component hex; imported once in `app/layout.tsx` right
  after `globals.css`. `tokens.css` itself stays untouched. See
  `CLAUDE.md` → "Known token gaps" and `docs/DESIGN-SYSTEM.md` for the
  full var list.
- `client/app/gallery/` (`page.tsx` + `GalleryClient.tsx` +
  `gallery.module.css`) — dev-only gallery rendering every primitive in
  every documented state against real `lib/api` mock data. Guarded with
  `notFound()` when `NODE_ENV === "production"` (verified: the production
  build emits a 404 response for `/gallery`); unlinked from any nav.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` (cleared `.next` first to rule out stale-cache errors).
- Live QA via headless browser at 360 / 768 / 1180px: every primitive +
  documented state renders, zero console errors, zero horizontal scroll
  (`document.documentElement.scrollWidth === clientWidth` at all three
  widths), colors correct — pine primary, gold decorative-only (eyebrows/
  labels, never small regular-weight body text), terracotta on
  prices/remove/ServiceCard pricing, WhatsApp green confined to the
  `whatsapp` Button variant and the `snacks` ChannelBadge.
- Icon-button `sm` size (36px) is intentionally below the general 44px
  tap-target guideline — `components.md` itself documents the icon-button
  range as "30–52px", so this is spec-compliant, not a gap.

### Notes / decisions for Opus to confirm

- A small set of intentional deviations from the prototype are documented
  inline in the affected component and summarized in
  `docs/DESIGN-SYSTEM.md` → "Documented deviations from the prototype":
  `ProductCard`'s filled-heart wishlisted state (prototype never shows
  one), `StatusTimeline`'s `current` (in-progress) step, `PriceRange`
  built as two real range inputs instead of the prototype's static bar,
  and a few near-identical prototype hex values normalized to the nearest
  existing token (`#C9A24a` → `--hk-gold-border`, `#EEEDE9` →
  `--hk-border`).
- `ServiceCard`'s per-unit price uses `--hk-terracotta` — `design-system.md`'s
  color table scopes terracotta to "Marketplace prices... remove ✕", but
  the prototype's own laundry service cards render `s.price` in the
  identical `#B65D3C` (confirmed in `Homekrafted.dc.html` line 248), so
  this is a faithful port, not a scope violation — the doc's wording is
  just narrower than the prototype's actual usage.

## [M0] — Foundation — 2026-07-23

Greenfield scaffold. No feature screens yet (those start M2) — this
milestone is tokens, types, mock data, the app shell, and living docs.

### Added

- Next.js app scaffolded at the project root (App Router, TypeScript,
  ESLint, npm), `@/*` path alias, git repo initialized (no commits made).
  `handoff/` left untouched alongside it.
- `lucide-react` + `clsx` added as dependencies. Prisma/Auth.js/Razorpay
  intentionally **not** added (M8).
- `styles/tokens.css` — verbatim copy of
  `handoff/design-system/tokens.css` (single source of truth).
  `styles/globals.css` — reset, base body, `::selection`, scrollbar,
  `hkfade` keyframe, next/font-to-token variable bridge, `.container`
  layout utility.
- `lib/tokens.ts` — typed mirror of `tokens.json`.
- Fonts wired via `next/font/google` in `app/layout.tsx`: Fraunces
  (400–700 + italic), IBM Plex Sans (400/500/600), IBM Plex Mono
  (400/500) — exposed as CSS vars that `--hk-font-*` tokens consume.
- `lib/types/` — full domain model (schema contract for the M8 Prisma
  pass): `shared.ts`, `wallet.ts`, `marketplace.ts`, `laundry.ts`,
  `food.ts`, barreled via `index.ts`. Every entity from the plan's domain
  model section is present with precise union types for every enum-like
  field (order/booking status, payment method, transaction category,
  pricing model, etc.).
- `lib/data/` — mock data seeded from the prototype's real sample data:
  8 products (+ featured subset), 8 vendors, 8 categories, 8 occasions, 2
  collections, 6 snacks (+ a sample snack list), 4 laundry services + 4
  pickup days + 3 slots + 4 how-it-works steps, 1 wallet + 6 reconciled
  ledger transactions, 3 hamper boxes, 4 top-up options, footer columns,
  trust stats, announcement items, a demo user + address + cart.
- `lib/format/` — `formatCurrency` (₹, `en-IN` grouping,
  optional signed ledger format) and date helpers (`formatDate`,
  `formatShortDate`, `formatDayLabel`).
- `lib/channel.ts` — `CHANNEL_RULES` encoding the plan's channel matrix
  (Marketplace/Laundry web-checkout, Snacks WhatsApp-only-no-cart, full
  meals promo-only-no-menu) as data, plus channel badge config.
- `lib/messaging.ts` — `Messaging` interface, `buildWhatsAppLink`
  (`wa.me` deep link), `ClickToChatMessaging` implementation, documented
  stub for the M9 WhatsApp Cloud API implementation.
- `lib/api/` — typed `async` client-stub functions over `lib/data`
  (products, vendors, catalog, snacks, laundry, wallet, site chrome) —
  the only data-access boundary components should use; swapping to real
  endpoints in M8 only touches this layer.
- App shell (`components/layout/`): `AnnouncementBar`, `Header` (server
  data-fetch wrapper) + `HeaderClient` (interactive), `MobileDrawer`,
  `Footer` — wired into `app/layout.tsx`. Header collapses to a hamburger
  + slide-in drawer below ~840px; wallet chip and cart badge stay visible
  at all widths.
- `components/placeholder/ImageSlot.tsx` — labelled diagonal-hatch
  placeholder (ratio/label/size/shape props), the only sanctioned way to
  render an image slot until real photography exists.
- `app/page.tsx` — minimal, token-styled Home placeholder (real Home is
  M2).
- Root `CLAUDE.md`, `docs/{PRD,API,ARCHITECTURE,DATA-MODEL,
  DESIGN-SYSTEM}.md`, `docs/adr/0001-stack.md`, this `CHANGELOG.md`.

### Notes / decisions for Opus to confirm

See "Decisions made in M0 that Opus should confirm" in `CLAUDE.md` —
covers the `/about` nav target, Wishlist added to `MobileDrawer`,
`LoyaltyTier` naming, laundry `pricingModel` assignment, corrected
laundry day-picker calendar labels, the recomputed snack-list estimate,
and seeding all 8 vendors rather than a subset. Also see "Known token
gaps" — a handful of prototype colors (on-solid-pine text, small-size
gold-family text, the footer's on-pine-deep ramp) aren't in `tokens.css`
yet; hardcoded locally with comments rather than invented or left
under-contrasted.

### Verified

`npm run build`, `npx tsc --noEmit`, and `npm run lint` all clean.
Dev server boots with no console/runtime errors; shell + minimal Home
render correctly. Compiled CSS confirmed to carry the 840/780/640/480/
420/400px responsive rules; no horizontal-overflow-prone fixed widths
found.
