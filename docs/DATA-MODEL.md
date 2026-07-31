# Data model

The entities below (`lib/types/`) are the schema contract. **As of M8.0
this is no longer aspirational** — `server/prisma/schema.prisma` mirrors
every entity below field-for-field (see "M8.0 Prisma mapping" at the
bottom of this doc for the full model list, notable relations, and every
place the Prisma model deviates from the literal TS shape). All ids are
`ID` (opaque string — `cuid()` in Prisma); all dates are `ISODateString`
(→ Prisma `DateTime`).

## Shared (`lib/types/shared.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `User` | name, email?, phone?, authProviders[], referralCode, role (`consumer`\|`seller`\|`admin`), suspended? (M11a) | 1:1 `Wallet` (`walletId`), 1:1 `LoyaltyAccount` (`loyaltyAccountId`) |
| `Address` | label, recipientName, phone, line1/2, city, state, pincode, isDefault | belongs to `User` (`userId`) |
| `Review` | targetType (`product`\|`vendor`\|`service`), targetId, rating 1–5, body, verifiedPurchase, flagged? (M11b), hidden? (M11b) | belongs to `User`; polymorphic target; **unique on `(userId, targetType, targetId)`** (M15 — one review per person per thing) |
| `Notification` | channel (`sms`\|`whatsapp`\|`email`\|`inapp`), category, read | belongs to `User`; optional polymorphic ref (`refType`/`refId`) |
| `NotificationPreference` | one row per (user, category): sms/whatsapp/email/inapp booleans | belongs to `User` |
| `Referral` | code, refereeName?, status (`pending`\|`joined`\|`rewarded`), rewardAmount? | belongs to referrer `User` |
| `LoyaltyAccount` | tier (`bronze`\|`silver`\|`gold`\|`platinum`), points, lifetimePoints | belongs to `User` |
| `SupportTicket` (+`SupportMessage`) | subject, channel (`chat`\|`call`\|`email`), status, messages[] | belongs to `User` |
| `CorporateInquiry` | companyName, contactName, estimatedQuantity, status | standalone (no user FK — inquiry may predate an account) |
| `SellerApplication` (M7b; lifecycle extended M11a) | businessName, contactName, category (`maker`\|`baker`\|`artist`\|`other`), city, description, status (`new`\|`reviewing`\|`waitlisted`\|`approved`\|`rejected`) | standalone (no user FK — an application may predate an account); `/admin/sellers`' approval queue treats every non-terminal status as "pending" — see notes below |

## Wallet (`lib/types/wallet.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Wallet` | balance, pendingCashback, lifetimeSaved, payWithWalletDefault | belongs to `User` |
| `WalletTransaction` | direction (`credit`\|`debit`), category (`topup`\|`cashback`\|`refund`\|`payment`\|`referral`\|`loyalty`\|`adjustment` (M11b)), amount, **balanceAfter** (server-authoritative running total), refType/refId | belongs to `Wallet` |
| `AutoTopupRule` | enabled, trigger (`below-threshold`\|`scheduled`), thresholdAmount?, topupAmount | belongs to `Wallet` |

## Marketplace (`lib/types/marketplace.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Vendor` | type (`maker`\|`baker`\|`artist`\|`homekrafted`), rating, followerCount | has many `Product`, has one `VendorProfile`, has many `VendorPhoto` |
| `VendorProfile` (M16) | 1:1 with `Vendor`, PK is `vendorId`. tagline, story, knownFor[], languages[], prepTimeMins, responseTimeMins, capacityPerDay, minOrderValue, workingDays[] (0 = Sun), opensAt/closesAt (`HH:MM` strings), cancellationPolicy, returnPolicy, customOrderPolicy, acceptsCustomOrders, packagingNote, hygieneNote, **fssaiNumber, fssaiExpiry, fssaiVerified, identityVerified, addressVerified, verifiedAt, verificationNote**, four social URLs | belongs to `Vendor` (cascade delete) |
| `VendorPhoto` (M16) | vendorId, url, caption?, kind (`kitchen`\|`process`\|`team`\|`award`), sortOrder | belongs to `Vendor` (cascade delete) |
| `Category` | name, productCount | referenced by `Product.categoryId` |
| `Occasion` | name, initial | referenced by `Product.occasionIds[]`, `Collection.occasionId` |
| `Collection` | title, productIds[] | many-to-many with `Product` (by id list, not a join table yet) |
| `Product` | vendorId, categoryId, occasionIds[], dietary[], images[], weightOptions[{sku,price,mrp,stock}], defaultWeightSku, tags[], isPackaged, cashbackPct, moderationStatus? (`active`\|`hidden`\|`flagged`, M11b), featured? (M11b) | belongs to `Vendor` |
| `Cart` (+`CartItem`) | items[{productId?, sku?, hamperId?, quantity, giftWrap?, addressId?}] | belongs to `User`; a line is *either* a product (`productId`+`sku`) *or* an assembled hamper (`hamperId`), never both — see "Polymorphic cart/order lines" below; `CartItem.addressId` enables multi-address checkout |
| `Wishlist` | items[{productId, addedAt}] | belongs to `User` |
| `HamperBox` | name, maxItems, price | referenced by `Hamper.boxId` |
| `Hamper` | boxId, items[{productId,quantity}], giftNote?, wrap?, ribbon?, nameCard?, recipientAddressId?, hidePrice | belongs to `User`; optional `Address` (recipient) — **M3 note:** the recipient/hide-price fields exist on this type but aren't set by the Hamper builder UI; gift-to-recipient is Checkout's order-wide `Order.gift`, not per-hamper (see CHANGELOG M3) |
| `Order` (+`OrderItem`, +`OrderShipment`) | status (7-state), shippingAddressIds[], shipments[{addressId, deliveryDate?}], gift? {isGift, recipientAddressId?, hidePrice, message?}, walletApplied, cashbackEarned, refundStatus, **refundReason?/refundRequestedAt?/cancelledAt?/deliveredAt? (M15)**, paymentMethod (`wallet`\|`razorpay`\|`cod`) | belongs to `User`; `OrderItem` is the same product-or-hamper polymorphism as `CartItem`; `OrderItem.addressId` ties each line to one of `shippingAddressIds`; `shipments` carries that address's own delivery date (M3 — replaces a single order-wide `deliveryDate`) |

## Laundry (`lib/types/laundry.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `LaundryService` | pricingModel (`per-kg`\|`per-item`\|`per-hour`), price, unitLabel | referenced by `LaundryBooking.lines[].serviceId`, `LaundrySubscription.serviceId` |
| `LaundryDay` / `LaundrySlot` | day/date/isoDate; label | availability data, not booking state |
| `LaundryBooking` | bookingNumber ("LB1042", same id/number split as `Order`), lines[], pickupSlot, deliverySlot (separate — two-slot scheduling), addressId, photos[], specialInstructions?, subscriptionId?, paymentMethod, status (6-state), partnerId? (M10b) | belongs to `User`; optional `LaundrySubscription`; `partnerId` (M10b) assigns it to a `Seller` (`type: "laundry"`) for `/seller/pickups` — optional since M0–M7's booking flow predates partner assignment |
| `LaundrySubscription` | plan (`weekly`\|`biweekly`\|`monthly`), slot, active, nextPickup | belongs to `User`; references `LaundryService` |

## Food (`lib/types/food.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Snack` | category (`savoury`\|`sweet`\|`baked`\|`namkeen`), diet (`veg`\|`non-veg`), price, available, sellerId? (M10b) | standalone catalog item; `sellerId` scopes it to a `Seller` (`type: "snack"`) for `/seller/menu` CRUD — optional since the consumer `/snacks` grid predates seller-scoping and doesn't filter by it |
| `SnackList` (+`SnackListItem`) | items[], estimateTotal, whatsappPayload, status (6-state incl. WA timeline states) | optionally belongs to `User`; **never becomes an `Order`** — Snacks has no on-site checkout (`lib/channel.ts`) |
| `SnackOrder` (M10b) | sellerId, customerName, customerPhone, items (`SnackListItem[]`), total, channel (`"whatsapp"`, one-value union), status (`received`\|`accepted`\|`out-for-delivery`\|`delivered`) | belongs to a `Seller` (`type: "snack"`); **not** a real consumer-placed entity — see notes below |
| `MealPromo` | title, description, appStoreUrl, playStoreUrl | standalone; single promo record, no user relationship |

## Seller portal (`lib/types/seller.ts`, M10a; extended M10b)

| Entity | Key fields | Relationships |
|---|---|---|
| `Seller` | userId, type (`maker`\|`laundry`\|`snack`), vendorId? (maker only), displayName, status (`pending`\|`approved`\|`suspended`), rating?/reviewCount? (M10b, laundry/snack only) | belongs to a `User` (role `"seller"`, a separate demo account per type — not a permission flag on the consumer `User`); a maker additionally owns a `Vendor` via `vendorId` — laundry/snack have no `Vendor`, so their rating lives directly on `Seller` instead |
| `Payout` | sellerId, amount, periodStart/End, status (`pending`\|`paid`\|**`rejected`** — M15), paidAt?, **reference?/note?/decidedById?/decidedAt? (M15)** | belongs to a `Seller` — `/seller/payouts` and `SellerPayoutsClient` are specialty-agnostic. `reference` is the bank/UPI id the transfer actually moved under: settlement happens **outside this system**, so it is the only link between a row marked paid and a real transfer |

## Notes for the M8 Prisma pass

- `WalletTransaction.balanceAfter` must only ever be written server-side
  inside the same transaction that mutates `Wallet.balance` — never
  trust a client-submitted value.
- `Order.paymentMethod` and `LaundryBooking.paymentMethod` share the
  `PaymentMethod` union (`wallet`\|`razorpay`\|`cod`) — one Prisma enum,
  reused.
- `Collection.productIds` and `Cart`/`Wishlist` item lists are modeled as
  id arrays in the mock layer for simplicity; Prisma will likely want real
  join tables (`CollectionProduct`, `CartItem` as its own table — already
  modeled that way, `WishlistItem` similarly).
- Polymorphic refs (`Review.targetType`/`targetId`,
  `Notification.refType`/`refId`, `WalletTransaction.refType`/`refId`)
  are not FK-enforced at the type level — decide in M8 whether Prisma
  models these as loosely-typed columns (as here) or split into
  per-target tables.
- **Polymorphic cart/order lines (M3):** `CartItem`/`OrderItem` now have
  optional `productId`/`sku` *or* `hamperId` instead of a required
  `productId` — a line is one or the other, app-level XOR, same pattern
  as the polymorphic refs above. Prisma will want two nullable FKs
  (`productId Int?`, `hamperId Int?`) with a `CHECK` constraint (or
  application-level enforcement) that exactly one is set, rather than a
  NOT NULL `productId`.
- **`Order.shipments` (M3)** replaced a single order-wide `deliveryDate?`
  — multi-address checkout needs one delivery date per address, not one
  per order. `shippingAddressIds` stays as a denormalized convenience
  list; `shipments` is the source of truth for per-address dates. In
  Prisma this is naturally an `OrderShipment` join table
  (`orderId`, `addressId`, `deliveryDate`).
- **Address book (M3):** `lib/data/user.ts` now seeds 3 addresses
  (`addresses[]`) instead of the single M0 `demoAddress`, enough for
  Checkout's multi-address split to be real. Checkout's inline "add
  address" only appends to this in-memory list for the session — full
  address-book CRUD (edit/delete, persistence) is M7.
- **`LaundryBooking.bookingNumber` (M4)** — added the same id/human-number
  split `Order` already had (`id` internal, `orderNumber` display), since
  the booking confirmation screen needs something short and human-
  readable ("Booking #LB1042") the way Checkout's confirmation shows
  "Order #HK2043". Sequenced independently from `Order.orderNumber`
  (`lib/data/laundry.ts`'s `nextBookingNumber()`, "LB" prefix) so the two
  never collide once M7 unifies both into one order-history list. Every
  other M4 booking field (`pickupSlot`/`deliverySlot`, `photos`,
  `specialInstructions`, `subscriptionId`, `paymentMethod`) was already
  present on the type from M0, ahead of this milestone's build.
- **Wallet ledger wired (M6):** `lib/wallet/WalletContext.tsx` is the
  first real read/write implementation of the `WalletTransaction` ledger
  described above — client-side and `localStorage`-persisted only (no
  backend yet, same caveat as `CartContext`), but every op
  (`topUp`/`pay`/`earnCashback`/`refund`) appends a row shaped exactly
  like the `WalletTransaction` interface, computing `balanceAfter`
  client-side for now. **This is the one thing that must change at M8:**
  the note two bullets up ("`balanceAfter` must only ever be written
  server-side... never trust a client-submitted value") is not yet true
  of this milestone's implementation — it's the explicit target M8 must
  hit, not a description of M6. `lib/data/wallet.ts` also gained a
  `defaultAutoTopupRule` seed (`AutoTopupRule`, off by default,
  `below-threshold` trigger) and two new ledger rows (a `refund` and a
  `loyalty` transaction) so the seeded history exercises all 6
  `WalletTransactionCategory` values, not just the original 4.
- **Account core wired (M7a):** no type changes — `User`, `Address`, and
  `Wishlist`/`WishlistItem` were already fully modeled in M0. Three new
  implementations sit on top of the existing shapes: (1)
  `lib/wishlist/WishlistContext.tsx` — the third real `localStorage`-
  persisted client store after `CartContext`/`WalletContext`, dealing only
  in `WishlistItem[]` (no client-side `Wishlist.id`/`userId` wrapper — that's
  a server concern once M8 lands); (2) `lib/api/addresses.ts` — full CRUD
  (`createAddress`/`updateAddress`/`deleteAddress`/`setDefaultAddress`)
  over the same in-memory `addresses` array `lib/api/site.ts#getAddresses`
  already read, mutated in place — same session/module-instance-scoped
  mock-mutation pattern as `createOrder`/`createBooking`, now extended to
  address book edits; (3) `lib/auth/AuthContext.tsx` — a `localStorage`-
  persisted `isSignedIn` flag over the single seeded `currentUser` (no
  real session/credential model yet, Auth.js lands in M8) and
  `lib/api/site.ts#updateUser` — a mock `Object.assign` mutation of that
  same `currentUser` record for Profile edits. `lib/api/history.ts`
  introduces a **query-only, non-persisted** `OrderHistoryEntry` shape
  (union of `Order`/`LaundryBooking` fields, not itself a new domain
  entity) that merges `lib/data/orders.ts#seedOrders` +
  `lib/data/laundry.ts#seedLaundryBookings` with whatever
  `createOrder`/`createBooking` placed live in the current session —
  `/account/orders`'s single read model for the unified history list.
- **HomeKrafter portal:** `Seller`/`Payout` model the single supply-side
  account layer — one `Seller` row per signed-in HomeKrafter, always with a
  `vendorId` (storefront). **`Seller.type` was removed in M12**; it gated
  module access and is replaced by `Seller.specialties: SellerSpecialty[]`,
  which is discovery/display only and must never decide access. No portal
  screen branches on it. Related additions are id-reference
  fields on *existing* domain types rather than new join tables:
  `LaundryBooking.partnerId` and `Snack.sellerId`/`SnackOrder.sellerId`
  all point at `Seller.id` directly — no separate "laundry partner
  profile" or "vendor" entity was introduced, since `Seller` itself
  already carries `displayName`/`status`/(now) `rating` and a maker's
  analogous per-type profile (`Vendor`) is the one exception, not the
  pattern to replicate. **`SnackOrder` is the one new M10b entity**,
  and it's a deliberate stand-in, not a real consumer-facing type: Snacks
  has no on-site checkout (`lib/channel.ts`), so a real order only ever
  exists as a WhatsApp message today — M9's WhatsApp Cloud API
  integration is expected to create real `SnackOrder` rows from inbound
  messages and push `status` changes back out as WhatsApp replies,
  without changing this shape. Owner-scoping (`vendorId`/`partnerId`/
  `sellerId` trusted from the client) is simulated exactly like every
  other M10a mock mutation — M8 must re-derive all three from a verified
  server session.
- **Admin panel (M11a):** no new `lib/types` file — two targeted
  extensions to existing shared types instead of a parallel "admin"
  schema. (1) `SellerApplicationStatus` gained two terminal values,
  `approved`/`rejected`, alongside `/sell`'s pre-existing
  `new`/`reviewing`/`waitlisted` — `lib/api/admin.ts#getPendingSellerApplications`
  treats all three pre-existing values as one "pending" bucket, so no
  data migration was needed for `/sell`'s existing seed/live
  applications. (2) `User.suspended?: boolean` — a mock flag
  `/admin/users` sets/clears; it does not yet block sign-in (no real
  session to gate one against until M8). **`SellerApplication` lifecycle:**
  submitted via `/sell` (status `waitlisted`) or seeded directly
  (`lib/data/sell.ts#seedSellerApplications`, M11a — 3 pending across
  the 3 pre-decision statuses + 1 pre-seeded `rejected`, so the admin
  queue and its decided-history aren't empty on first load) → admin
  approves (`lib/api/admin.ts#approveSellerApplication`: status →
  `approved`, mints a new `Vendor` from the application's business
  details — `SellerApplicationCategory` maps onto `VendorType` 1:1
  except `"other"`, which becomes a plain `"maker"` storefront — plus a
  new `approved`-status `Seller`, `type: "maker"`, pointing at that
  `Vendor`) or rejects (status → `rejected`, terminal, no `Seller`
  created). The new `Seller.userId` is a synthetic placeholder id (no
  real account exists yet for an application-origin seller) — flagged in
  code rather than silently wrong; M8's real onboarding must create the
  `User` (invite/verification) before the `Seller` row, not synthesize an
  id after it. **Orders oversight is a display-only aggregation, not a
  new entity:** `lib/api/admin.ts#AdminOrderSummary` unifies `Order` +
  `LaundryBooking` + `SnackOrder` into one list/detail shape for
  `/admin/orders`, keyed `${type}:${id}` to stay unique across the 3
  source tables — same "read-model, not a domain type" pattern
  `lib/api/history.ts`'s `OrderHistoryEntry` already established for
  `/account/orders` in M7a. Every admin query reads every row
  unscoped (no `vendorId`/`sellerId`/`userId` filter) — trusted purely by
  which screens call it (`AdminShell`'s client-side role gate) exactly
  like every other mock data layer in this codebase; **M8 must enforce
  real admin-role RBAC server-side and audit-log every unscoped
  read/write** `lib/api/admin.ts` makes today.
- **Admin panel completed (M11b: moderation, wallet/refunds, CMS,
  analytics):** four targeted type extensions, no new `lib/types` file.
  (1) `Product.moderationStatus?` (`active`\|`hidden`\|`flagged`, absent
  reads as `active`) + `Product.featured?` — `/admin/catalog`'s
  approve/hide/flag/feature actions (`lib/api/admin.ts#moderateProduct`).
  `lib/api/products.ts`'s browse/listing getters (`getProducts`,
  `getProductsByCategory/Occasion/Vendor`, `getFeatured`) filter out
  `"hidden"` products and `getFeatured` now derives from `.featured`
  instead of a hardcoded id list. (2) `Review.flagged?`/`Review.hidden?`
  — `/admin/catalog/reviews`' moderation queue
  (`lib/api/admin.ts#moderateReview`); `lib/api/reviews.ts#getProductReviews`/
  `getVendorReviews` filter out `hidden` reviews. (3)
  `WalletTransactionCategory` gained `"adjustment"`, distinct from
  `"refund"` — an admin manual credit/debit needs its own audit category
  separate from an order-tied refund. (4) No type change for Collections:
  `upsertCollection` (`lib/api/admin.ts`) creates/edits a `Collection`
  in place (title, occasionId, `productIds[]` — array order is the
  collection's real display order, so reordering is just resubmitting the
  array); the home page's two promo bands became a real (if
  small) config type, `HomePromoBandContent` (`lib/data/site.ts`,
  **not** a `lib/types` entity — site-chrome copy, same tier as
  `AnnouncementItem`/`FooterColumn`), editable via
  `/admin/collections/promo` → `lib/api/admin.ts#updateHomePromoBand`.
  **Wallet oversight introduces one new mock-only construct, not a schema
  change:** `adminWalletsByUser`/`adminWalletTransactionsByUser`
  (`lib/data/admin.ts`, `Record<userId, Wallet | WalletTransaction[]>`) —
  M0–M11a only ever modeled **one** `Wallet` (`user-demo`'s); `/admin/wallet`
  needs a wallet per account to show real per-user balances, so M11b
  seeds one `Wallet` + a short ledger for every account in `users[]`
  (reusing the existing `user-demo` wallet/ledger verbatim, not
  duplicating it). **This is explicitly a separate ledger from the
  consumer's own `WalletContext`** (client `localStorage`, M6) — the two
  can drift within one mock session since there's no shared server yet;
  M8's real wallet ledger is the one table both surfaces read/write
  through, closing that gap. `issueRefund`/`adjustWallet` append a new
  `WalletTransaction` (`category: "refund"`/`"adjustment"`) and update
  `Wallet.balance` — same shape `WalletContext.refund` already writes
  client-side, just on this separate admin-side ledger. `OrderDetailClient`'s
  (M11a) previously-stubbed refund button is now wired for marketplace
  and laundry orders (`AdminOrderSummary.customerUserId`, newly added —
  `undefined` for `SnackOrder`s, which have no registered account/wallet
  to refund, being WhatsApp-only). **Analytics is 100% a read-model, no
  new entity:** `lib/api/admin.ts#getAnalytics` derives GMV-by-day,
  orders-by-module, top sellers (by `Vendor` revenue for makers, by
  `Seller` revenue for laundry/snack), top products, new-users-by-month,
  and wallet-flow-by-category entirely from existing arrays — same
  "display-layer aggregation" status as `AdminOrderSummary`/
  `AdminDashboardSnapshot`. **Known mock-architecture limit (not new to
  M11b, but newly hit by it):** `/admin/catalog`, `/admin/catalog/reviews`,
  and `/admin/collections/promo` are `"use client"` screens mutating
  `lib/data` arrays in the *browser's* module graph; the consumer pages
  reading those same arrays (`/shop`, `/`, `/product/[slug]`,
  `/storefront/[vendor]`, `/collections/[occasion]`) are Server
  Components that fetch in the *Next.js server's* module graph — a
  separate JS runtime. A moderation/feature/CMS action is instantly
  visible to every other admin client component in the same browser tab
  (same pattern `setUserSuspended`/`setSellerStatus` already document),
  but never reaches a server-rendered consumer page without a real
  backend round-trip. M8's real API removes this gap entirely.
- **Admin panel made real (M8.3c, `server/src/admin/`):** every gap the
  two bullets above flagged is now closed server-side. Real
  `@Roles('admin')` RBAC (not a client-side screen gate) backs every
  `/admin/*` route; `Product.moderationStatus`/`featured` and
  `Review.hidden`/`flagged` writes land in Postgres, so a hide/feature/
  flag is visible to every surface (server-rendered consumer pages
  included) on its next read, not just the same browser tab. Wallet
  oversight now reads the *one* real per-user `Wallet`/`WalletTransaction`
  table every other surface shares (no more parallel
  `adminWalletsByUser` mock ledger) — `adjust`/`issueRefund` funnel
  through `WalletService`'s row-locked ledger primitive. The seller
  approval flow mints a **real** `User` account (`Seller.userId` is a
  live FK in this schema) rather than a synthetic placeholder id. Every
  mutation writes a new `AdminAuditLog` row (see "Full model list" below)
  — the audit trail the M11a/M11b notes above called out as owed. Full
  endpoint contract: `docs/API.md`'s "Admin panel (M8.3c)" section.

## M8.0 Prisma mapping

`server/prisma/schema.prisma` is the real implementation of everything
above, `provider = postgresql`. Every model in the file traces back to one
of the tables in this doc; only auth infrastructure (below) has no
`lib/types` counterpart. An ERD is a reasonable follow-up via the
`/diagram` skill once the schema has real write traffic against it — this
section is the prose reference until then.

### Full model list (44 models)

**Auth infrastructure (no `lib/types` counterpart — server-only):**
`RefreshToken`, `PhoneOtp`, `SocialAccount`.

**Admin (M8.3c; no `lib/types` counterpart — server-only):** `AdminAuditLog`
— one row per admin mutation (`server/src/admin/audit-log.service.ts`),
loosely pointed (not FK-enforced) at whatever row it touched via
`targetType`/`targetId`, since one log table spans many unrelated target
tables.

**Shared/account:** `User`, `Address`, `Review`, `Notification`,
`NotificationPreference`, `Referral`, `LoyaltyAccount`, `SupportTicket`,
`SupportMessage`, `CorporateInquiry`, `SellerApplication`.

**Wallet:** `Wallet`, `WalletTransaction`, `AutoTopupRule`.

**Marketplace:** `Vendor`, `VendorProfile`, `VendorPhoto`,
`VendorFollow`, `Category`, `Occasion`,
`Collection`, `CollectionProduct`, `Product`, `ProductOccasion`,
`ProductImage`, `WeightOption`, `Cart`, `CartItem`, `Wishlist`,
`WishlistItem`, `HamperBox`, `Hamper`, `HamperItem`, `Order`, `OrderItem`,
`OrderShipment`.

**Laundry:** `LaundryDay`, `LaundrySlot`, `LaundryService`,
`LaundryBooking`, `LaundryBookingLine`, `LaundrySubscription`.

**Snacks/food:** `Snack`, `SnackList`, `SnackListItem`, `SnackOrder`,
`SnackOrderItem`, `MealPromo`.

**Seller portal:** `Seller`, `Payout`.

Enums mirror every TS union 1:1 (34 enums) — hyphenated literals
(`"per-kg"`, `"in-progress"`, `"below-threshold"`, `"non-veg"`, etc.)
use Prisma's `@map(...)` so the DB still round-trips the exact string the
frontend contract expects even though the Prisma enum *identifier* has to
be a valid symbol (underscored, e.g. `per_kg @map("per-kg")`).

### Modeling decisions made translating TS → Prisma

- **`User.walletId`/`User.loyaltyAccountId` collapsed.** The mock has
  `User` pointing "down" at `Wallet`/`LoyaltyAccount` by id, and those
  types also carry `userId` pointing back — a redundant bidirectional FK.
  Prisma models this as a single 1:1 relation declared from the
  `Wallet`/`LoyaltyAccount` side (`Wallet.userId @unique`); `User.wallet`/
  `User.loyaltyAccount` are back-relations, not stored columns.
- **`occasionIds`/`Collection.productIds` (id-array many-to-manys) became
  real join tables** (`ProductOccasion`, `CollectionProduct`) rather than
  Postgres array columns — these are genuine many-to-many relationships
  with real query patterns ("products for this occasion"), unlike
  `dietary`/`tags`, which stayed native Postgres enum arrays
  (`DietaryTag[]`, `ProductTag[]`) since they're small fixed tag sets, not
  full entities. `CollectionProduct.sortOrder` preserves the array's
  display order, per this doc's existing note on `Collection.productIds`.
- **`CartItem`/`OrderItem` polymorphism (product-or-hamper)** stayed
  exactly as this doc already recommended: two nullable FKs
  (`productId`/`hamperId`) with the XOR enforced at the application layer
  (M8.1's cart/order service), not a DB `CHECK` constraint yet — a
  reasonable follow-up once there's real write traffic to protect.
- **`Order.shipments`** became the `OrderShipment` join table this doc
  already anticipated (`orderId`, `addressId`, `deliveryDate`);
  `Order.shippingAddressIds` stayed a denormalized `String[]` convenience
  list, exactly as recommended.
- **`OrderGift` (embedded object) flattened onto `Order`** as
  `gift`-prefixed columns (`giftIsGift`, `giftRecipientName`,
  `giftRecipientAddressId`, `giftHidePrice`, `giftMessage`) — present
  together or not at all, mirroring the mock's `gift?: OrderGift`
  optionality (`giftIsGift: false` is the "no gift" state).
- **`LaundryBooking.pickupSlot`/`deliverySlot` (embedded `{date, slotId}`
  objects) flattened** to a `DateTime` column + a `LaundrySlot` FK each,
  named by relation (`"PickupSlot"`/`"DeliverySlot"`) since both point at
  the same `LaundrySlot` model.
- **Polymorphic refs stayed loosely-typed, not FK-enforced** — exactly as
  this doc already flagged as an open decision:
  `Review.targetType`/`targetId`, `Notification.refType`/`refId`,
  `WalletTransaction.refType`/`refId` are enum-typed "kind" columns plus a
  plain `String` id column, no `@relation`. `SnackOrder.channel` (a
  one-value TS union, `"whatsapp"`) became a one-value Prisma enum for
  the same reason its own doc comment gives — a future channel is a value
  addition, not a shape change.
- **One new model with no `lib/types` origin: `VendorFollow`.**
  `Vendor.isFollowing` is a per-viewer derived boolean in the mock with
  nothing backing it; a real "follow" feature needs a join table
  (`userId`, `vendorId`, unique together), added now since it's a
  one-line addition rather than a later migration.
- **`SnackOrderItem` is a distinct table from `SnackListItem`**, even
  though both share the same `{snackId, name, quantity, price}` shape in
  `lib/types` (`SnackListItem` reused by both `SnackList` and
  `SnackOrder`) — they belong to different parent tables (`SnackList` vs
  `SnackOrder`) with different lifecycles, so Prisma gets two tables with
  the same column shape rather than one polymorphic-parent table.
- **Money fields are `Decimal`** (`@db.Decimal(12,2)` for wallet/order
  totals, `@db.Decimal(10,2)` for line-item prices, `@db.Decimal(4,2)`
  for `cashbackPct`), not `Float` — avoids floating-point rounding on
  currency, standard practice `lib/types`' plain `number` didn't need to
  specify but a real column does.
- **Auth infrastructure (`RefreshToken`, `PhoneOtp`, `SocialAccount`) has
  no `lib/types` counterpart** — these are server-only implementation
  detail behind the auth flows the M8.0 milestone brief specified (JWT
  access+refresh, phone OTP, stub social), not part of the frontend's
  schema contract. `RefreshToken.tokenHash`/`PhoneOtp.codeHash` store only
  hashes, never raw tokens/codes.

### Notes for M8.1–M8.3

- **The wallet-write path landed in M8.2**, exactly as targeted earlier in
  this doc: `WalletService.postLedgerEntryTx` (`server/src/wallet/`) is
  the only code that ever writes `Wallet.balance`/
  `WalletTransaction.balanceAfter`, row-locking the wallet (`SELECT ...
  FOR UPDATE`) before computing the new balance server-side. M8.2 also
  adds three server-only tables with no `lib/types` counterpart (same
  "auth infrastructure" pattern as `RefreshToken`/`PhoneOtp` above — not
  part of the frontend schema contract):
  - `IdempotencyKey` — one row per `(userId, scope, key)` claim on a
    money-mutating op, see `docs/ARCHITECTURE.md`'s "Payment & ledger
    flow" for the exact mechanics.
  - `WebhookEvent` — dedup ledger for inbound Razorpay webhook deliveries
    (`(provider, eventId)` unique).
  - `RazorpayOrder` — one row per Razorpay order opened, tracking
    `purpose`/`amount`/`userId`/`orderId?`/`walletId?` so the webhook
    handler never has to trust anything in the webhook payload beyond the
    payment id itself.
- Every seller/admin-scoped query in M8.1–M8.3 must resolve its scoping id
  (`vendorId`/`sellerId`/`userId`) from the verified JWT
  (`RequestUser.sellerId`/`.userId`, `server/src/common/types/jwt-payload.type.ts`)
  via the helpers in `server/src/common/scoping/ownership.util.ts` — never
  from a client-submitted value, closing the gap this doc's M10/M11 notes
  above flag as still owed.
- `docs/API.md` has the endpoint-level contract (request/response shapes,
  error envelope, auth model) for what M8.0 actually implemented
  (auth + users/addresses) — this doc stays the entity/relationship
  reference.
### Notes for M16 — HomeKrafter profiles

- **`VendorProfile` is a separate table, not columns on `Vendor`.**
  `Vendor` is read by every product card, every distance filter and every
  follow check; none of those need a shop's story or its return policy.
  The 1:1 optional row also makes "has this kitchen filled anything in"
  answerable by the row's existence.
- **The three verification flags are admin-write-only.**
  `UpdateSellerProfileDto` does not declare them, and the global
  `ValidationPipe`'s `forbidNonWhitelisted` rejects an attempt with a
  `400` rather than dropping it silently.
  `PATCH /admin/sellers/:id/verification` is the only path, and it audits
  the before/after state. A seller who could set their own badge would
  make the badge worthless, which is the whole reason a buyer trusts a
  stranger's kitchen.
- **`fssaiNumber` never reaches the public payload.** A buyer needs the
  verified fact; the licence identifier belongs to the HomeKrafter.
  Submitting a *changed* number resets `fssaiVerified` to `false` —
  otherwise editing the thing being verified would preserve the badge
  that verified it.
- **Trust score, achievements and profile completion are computed on
  read** (`VendorProfileService`) from verification flags, review
  aggregates, delivered/cancelled order counts and tenure. Nothing is
  stored, for the same reason M15 recomputes rating aggregates rather
  than incrementing them: a stored score has no owner and quietly stops
  being true. `stats.cancellationRate` is `null` until something has
  closed — an unknown rate, not a perfect one.
- **`VendorPhoto` is a list, not columns**, because the count is
  open-ended and ordering matters — the same reasoning as `ProductImage`.
  Capped at 12 server-side. Deleting a row does not delete the file (M14,
  see `docs/DEPLOY.md`).
