# Data model

The entities below (`lib/types/`) are the schema contract — Prisma models
in M8 mirror these 1:1, field for field. An ERD (generated via the
`/diagram` skill) lands alongside M8 once the model is finalized against
real screens; this doc is the reference until then. All ids are `ID`
(opaque string — cuid/uuid once Prisma lands); all dates are
`ISODateString`.

## Shared (`lib/types/shared.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `User` | name, email?, phone?, authProviders[], referralCode | 1:1 `Wallet` (`walletId`), 1:1 `LoyaltyAccount` (`loyaltyAccountId`) |
| `Address` | label, recipientName, phone, line1/2, city, state, pincode, isDefault | belongs to `User` (`userId`) |
| `Review` | targetType (`product`\|`vendor`\|`service`), targetId, rating 1–5, body, verifiedPurchase | belongs to `User`; polymorphic target |
| `Notification` | channel (`sms`\|`whatsapp`\|`email`\|`inapp`), category, read | belongs to `User`; optional polymorphic ref (`refType`/`refId`) |
| `NotificationPreference` | one row per (user, category): sms/whatsapp/email/inapp booleans | belongs to `User` |
| `Referral` | code, refereeName?, status (`pending`\|`joined`\|`rewarded`), rewardAmount? | belongs to referrer `User` |
| `LoyaltyAccount` | tier (`bronze`\|`silver`\|`gold`\|`platinum`), points, lifetimePoints | belongs to `User` |
| `SupportTicket` (+`SupportMessage`) | subject, channel (`chat`\|`call`\|`email`), status, messages[] | belongs to `User` |
| `CorporateInquiry` | companyName, contactName, estimatedQuantity, status | standalone (no user FK — inquiry may predate an account) |

## Wallet (`lib/types/wallet.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Wallet` | balance, pendingCashback, lifetimeSaved, payWithWalletDefault | belongs to `User` |
| `WalletTransaction` | direction (`credit`\|`debit`), category (`topup`\|`cashback`\|`refund`\|`payment`\|`referral`\|`loyalty`), amount, **balanceAfter** (server-authoritative running total), refType/refId | belongs to `Wallet` |
| `AutoTopupRule` | enabled, trigger (`below-threshold`\|`scheduled`), thresholdAmount?, topupAmount | belongs to `Wallet` |

## Marketplace (`lib/types/marketplace.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Vendor` | type (`maker`\|`baker`\|`artist`\|`homekrafted`), rating, followerCount | has many `Product` |
| `Category` | name, productCount | referenced by `Product.categoryId` |
| `Occasion` | name, initial | referenced by `Product.occasionIds[]`, `Collection.occasionId` |
| `Collection` | title, productIds[] | many-to-many with `Product` (by id list, not a join table yet) |
| `Product` | vendorId, categoryId, occasionIds[], dietary[], images[], weightOptions[{sku,price,mrp,stock}], defaultWeightSku, tags[], isPackaged, cashbackPct | belongs to `Vendor` |
| `Cart` (+`CartItem`) | items[{productId?, sku?, hamperId?, quantity, giftWrap?, addressId?}] | belongs to `User`; a line is *either* a product (`productId`+`sku`) *or* an assembled hamper (`hamperId`), never both — see "Polymorphic cart/order lines" below; `CartItem.addressId` enables multi-address checkout |
| `Wishlist` | items[{productId, addedAt}] | belongs to `User` |
| `HamperBox` | name, maxItems, price | referenced by `Hamper.boxId` |
| `Hamper` | boxId, items[{productId,quantity}], giftNote?, wrap?, ribbon?, nameCard?, recipientAddressId?, hidePrice | belongs to `User`; optional `Address` (recipient) — **M3 note:** the recipient/hide-price fields exist on this type but aren't set by the Hamper builder UI; gift-to-recipient is Checkout's order-wide `Order.gift`, not per-hamper (see CHANGELOG M3) |
| `Order` (+`OrderItem`, +`OrderShipment`) | status (7-state), shippingAddressIds[], shipments[{addressId, deliveryDate?}], gift? {isGift, recipientAddressId?, hidePrice, message?}, walletApplied, cashbackEarned, refundStatus, paymentMethod (`wallet`\|`razorpay`\|`cod`) | belongs to `User`; `OrderItem` is the same product-or-hamper polymorphism as `CartItem`; `OrderItem.addressId` ties each line to one of `shippingAddressIds`; `shipments` carries that address's own delivery date (M3 — replaces a single order-wide `deliveryDate`) |

## Laundry (`lib/types/laundry.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `LaundryService` | pricingModel (`per-kg`\|`per-item`\|`per-hour`), price, unitLabel | referenced by `LaundryBooking.lines[].serviceId`, `LaundrySubscription.serviceId` |
| `LaundryDay` / `LaundrySlot` | day/date/isoDate; label | availability data, not booking state |
| `LaundryBooking` | bookingNumber ("LB1042", same id/number split as `Order`), lines[], pickupSlot, deliverySlot (separate — two-slot scheduling), addressId, photos[], specialInstructions?, subscriptionId?, paymentMethod, status (6-state) | belongs to `User`; optional `LaundrySubscription` |
| `LaundrySubscription` | plan (`weekly`\|`biweekly`\|`monthly`), slot, active, nextPickup | belongs to `User`; references `LaundryService` |

## Food (`lib/types/food.ts`)

| Entity | Key fields | Relationships |
|---|---|---|
| `Snack` | category (`savoury`\|`sweet`\|`baked`\|`namkeen`), diet (`veg`\|`non-veg`), price, available | standalone catalog item |
| `SnackList` (+`SnackListItem`) | items[], estimateTotal, whatsappPayload, status (6-state incl. WA timeline states) | optionally belongs to `User`; **never becomes an `Order`** — Snacks has no on-site checkout (`lib/channel.ts`) |
| `MealPromo` | title, description, appStoreUrl, playStoreUrl | standalone; single promo record, no user relationship |

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