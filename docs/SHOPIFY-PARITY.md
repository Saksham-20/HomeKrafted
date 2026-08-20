# Homekrafted — Shopify parity & admin RBAC backlog

**Compiled:** 2026-08-15, against `main` @ `8df3624` (post-M35).
**Scope:** consumer commerce surface, admin surface + RBAC, notification/email
system.

This is the **queue**. It ranks what is missing against a Shopify-class
storefront, plus the admin role model the platform does not yet have.
It is a companion to `docs/PRODUCTION-AUDIT.md`, not a replacement — that
document ranks *launch* gaps and its Phases 2–4 are still the standing
backlog. Where the two overlap, the audit wins on launch sequencing and
this document wins on commerce-primitive detail.

Read `CLAUDE.md` first. Several "gaps" below are **deliberate product
decisions** and are marked as such — do not close them.

---

## 0. Executive summary

The build is not a thin storefront. It is **ahead of Shopify** on the
things a hyper-local homemade-goods marketplace actually needs — delivery
radius availability, a wallet + cashback ledger with server-authoritative
balances, per-listing admin moderation, computed seller trust profiles,
meal subscriptions, a WhatsApp ordering channel, idempotent money
mutations, and a unified multi-module order history.

It is **behind on five generic commerce primitives**, none of which exist
in any form:

1. **Product variants / options** — one axis only (`WeightOption`)
2. **Discounts / coupons / promotions** — no model, no code field
3. **Tax / GST** — nothing in the consumer flow at all
4. **Shipping rates / zones** — two hardcoded constants
5. **Gift cards**

And it has **one all-or-nothing admin role**. Thirteen admin tabs, every
one of them reachable by every admin token: settling payouts, adjusting
wallets, suspending users, changing platform settings.

---

## 1. Priority queue

Ranked by (risk × reach) ÷ effort. **P0 items are defects**, not features —
each is a small diff against code that already exists.

| # | Item | Type | Why now |
|---|---|---|---|
| **P0.1** ✅ | `RolesGuard` fails open | Defect | **Fixed 2026-08-15.** Under `/admin` an undecorated handler is now refused rather than admitted; the consumer default is unchanged, because most consumer controllers legitimately carry no `@Roles`. Pinned by `server/test/unit/roles-guard.spec.ts`. |
| **P0.2** ✅ | Two admin **mutations** wrote no audit row | Defect | **Fixed 2026-08-15.** `POST /orders/:id/refund` and `POST /wallet/adjust` now log. `AdminModule` imports `WalletModule`/`OrdersModule`, so neither could import the writer back — `AdminAuditModule` (`src/admin/audit.module.ts`) breaks the cycle by providing `AdminAuditLogService` alone. Both log **after commit** and only on the pass that moves money, so an idempotent retry logs nothing. `GET /users/:id` is a read and stays unlogged — the contract is *every mutation*, not every request. |
| **P0.3** | `OrdersService.refundOrder` notifies nobody | Defect | Credits the wallet, sets `refundStatus: 'refunded'`, sends nothing. The admin-issued path does notify. |
| **P0.4** | Money/lifecycle events are in-app only | Defect | Payout paid, support reply, verification, seller-approval welcome all use `notify()` (inbox row) not `deliver()` (fan-out). The approval welcome lands in an inbox **behind a login they may not have**. |
| **P0.5** | Notification-preference default race | Defect | Opening `/account/notifications` first creates rows with email/WhatsApp **off**; receiving a notification first creates them **on**. |
| **P1** | **Admin staff roles** | Feature | Explicitly requested. Design in §3. |
| **P2.1** | Discount codes | Feature | Highest revenue lever absent. No promo field exists anywhere. |
| **P2.2** | GST / tax | Compliance | Indian marketplace with **zero** tax modelling in the consumer flow. |
| **P2.3** | Product variants (multi-axis) | Feature | A craft in three colours cannot be expressed except by abusing the weight label. |
| **P3.1** | Shipping rates / zones | Feature | Flat ₹49, free at ₹999, hardcoded. |
| **P3.2** | Commission collection | Business | Modelled, never deducted. `Payout.amount` is gross. Already in `CLAUDE.md` as a standing blocker. |
| **P3.3** | Related products / upsell | Growth | A product page ends at reviews. |
| **P4** | Lifecycle email + templates | Feature | **Deferred by owner (2026-08-15).** See §5. |
| **P4.1** | Gift cards | Feature | No model. Wallet is the nearest analogue but is self-top-up only. |
| **P4.2** | Abandoned cart recovery | Growth | Needs a scheduler, which does not exist. |

---

## 2. Shopify parity table

### 2.1 At or above par — do not "fix"

Delivery-radius availability · wallet + cashback ledger · per-listing
moderation queue · computed seller trust profiles · occasion/guide
merchandising with live countdowns · reorder with explicit `skipped`
reasons · unified multi-module order history · idempotent
server-authoritative money math · URL-round-tripped filters · WhatsApp
channel · meal subscriptions.

### 2.2 Present but thinner than Shopify

| Area | What exists | What Shopify has |
|---|---|---|
| Search | `ILIKE contains`, client fans out to 3 endpoints | Full-text, typo tolerance, facets, autocomplete |
| Sort | 3 keys (`most-loved`, price asc/desc) + server `nearest` | Newest, best-selling, manual merchandised order |
| Tracking | Status timeline, 8 states | Carrier, AWB, tracking URL, shipment events |
| Refunds | Admin-only, wallet-only, whole-order | Partial, to original payment method |
| Categories | `?category=` filter on `/shop` | Dedicated collection routes |
| Inventory | Single `stock` int on `WeightOption` | Reservations, multi-location, backorder, thresholds |
| Guest checkout | **None** — cart requires sign-in | Standard |

### 2.3 Absent entirely

| Missing | Nearest existing thing | Notes |
|---|---|---|
| `ProductVariant` / `ProductOption` | `WeightOption` (sku, label, price, mrp, stock) | Single axis. `Product` has no SKU of its own. |
| `Discount` / `Coupon` / `PriceRule` | `WeightOption.mrp` strike-through; `cashbackPct` | `PromoBand`/`MealPromo` are **CMS banners**. `NotificationCategory.promo` is a notification bucket. Neither is a promotion. |
| `TaxRate` / HSN | `CorporateQuote.taxAmount` (admin-typed, B2B only) | No tax line in cart or checkout. |
| `ShippingRate` / `ShippingZone` | `SHIPPING_FEE = 49`, `FREE_SHIPPING_THRESHOLD = 999` | In `server/src/common/pricing/pricing.util.ts`. |
| `GiftCard` | Wallet | Wallet is non-transferable, self-top-up only. |
| `Return` / RMA | `Order.refundStatus` + `refundReason` | No labels, no restocking on return. |
| Invoices | — | No model, no PDF, no route. |
| Recommendations / upsell / recently viewed | — | Zero occurrences client-wide. |
| Multi-currency | — | INR only. |

### 2.4 Deliberate — not gaps

Per `CLAUDE.md` and `lib/channel.ts`:

- **Snacks has no cart or checkout.** WhatsApp is the only ordering
  channel. Do not "fix" it.
- **Full meals are promo-only on web.** App-only checkout.
- **Live tracking is app-only.** Status-only on web is correct.
- **Location is never a gate.** No coords returns the *full* catalogue.
- **A return moves no money.** An admin resolves it, deliberately —
  auto-refund would make the most abusable path the most frictionless.
- **Laundry is withdrawn (M19).** Models stay so history renders.

---

## 3. P1 — Admin staff roles

### 3.1 Where we are

`UserRole` is flat: `consumer | seller | admin`. There is no
`StaffRole`, `Permission`, or scope model anywhere in the 65-model
schema. `AdminShell.tsx` states it outright: *"admin is one role,
unscoped, no variants to switch on."*

### 3.2 The three constraints that shape the design

1. **`client/middleware.ts` is chrome, not authorization** — it reads
   `hk_role`, a plain client-settable cookie, and says so in its own
   header. Staff scoping **must** be enforced server-side. Nav filtering
   is cosmetic and must never be the only gate.
2. **`JwtAuthGuard` already does a per-request `User` lookup** for
   `suspended` / `mustChangePassword`. Adding `staffRole` to that
   existing `select` costs **zero extra queries** — and means a demotion
   takes effect immediately rather than after a 15-minute token expiry.
   **Do not put the staff role in the JWT.** A claim goes stale exactly
   when it matters most.
3. **`RolesGuard` fails open** (P0.1). Fix that first or a new admin
   endpoint that forgets its decorator is open to every signed-in
   customer.

### 3.3 Proposed roles

The 13 existing tabs map onto four roles without redesigning anything.

| Role | Tabs | Can |
|---|---|---|
| `support` | Support, Corporate, Orders (read), Users (read) | Reply to tickets, resolve, read orders. **No** refunds, **no** payouts, **no** settings. |
| `finance` | Payouts, Wallet, Orders (+refund), Analytics | Settle payouts, adjust wallets, refund. **No** catalogue, **no** user suspension. |
| `catalog` | Catalog, Collections, HomeKrafters | Moderate listings/reviews, curate, approve applications, grant verification. **No** money. |
| `superadmin` | All 13 + Settings, Users (write), Audit | Everything, including managing staff roles. |

`superadmin` is the migration default so **no existing admin loses
access** on deploy.

### 3.4 Shape

- `enum StaffRole { support finance catalog superadmin }`
- `User.staffRole StaffRole?` — null for non-admins. Nullable so the
  migration is additive and no backfill can fail.
- `@RequireStaff(...roles)` decorator + `StaffGuard`, running **after**
  `RolesGuard`. Composes with `@Roles('admin')` rather than replacing it.
- `RequestUser.staffRole`, populated from the existing `JwtAuthGuard`
  lookup.
- `GET /admin/me` returns the caller's staff role; `AdminShell` filters
  `NAV` from it. **Cosmetic only.**
- Changing a staff role is itself an audited action
  (`staff_role.update`) and is `superadmin`-only.

### 3.5 Rules

- **Server-side or it does not exist.** Nav filtering is not a gate.
- **Re-read the role per request.** Never a JWT claim.
- **Every scoped mutation stays audited.** Close P0.2 in the same change
  or a scoped role is unaccountable.
- **A read-only role must 403, not 404.** Cross-*seller* access 404s
  deliberately (it hides existence); staff scoping is different — a
  support agent knows payouts exist, they just may not settle them.
- **Default deny on a new tab.** A tab nobody has been granted shows to
  `superadmin` only.

---

## 4. P2 — commerce primitives

Sequenced so each lands on top of the last without rework.

**P2.1 Discounts.** `Discount { code, type (percent|fixed|free_shipping),
value, minSubtotal, startsAt, endsAt, usageLimit, perUserLimit,
appliesTo }` + `DiscountRedemption` for enforcement. Applied
**server-side in the cart pricing path**
(`server/src/common/pricing/pricing.util.ts`), never client-computed —
same rule as every other price. Needs a code field in cart and checkout,
and a discount line in the summary.

**P2.2 GST.** `TaxRate` keyed by HSN + category, with `Order.taxAmount`
and `OrderItem.taxAmount` snapshotted at order time like `price` already
is. Decide first whether listed prices are tax-inclusive — that is a
business decision, not a schema one, and it changes every displayed
price.

**P2.3 Variants.** `ProductOption` + `ProductOptionValue` +
`ProductVariant`, with `WeightOption` migrated to a single-option
product so nothing breaks. `sku` moves to `ProductVariant`. This is the
largest of the three — it touches cart lines, order items, stock
decrement and the seller listing form.

---

## 5. P4 — Email (deferred)

**Deferred by the owner on 2026-08-15.** Recorded so the next session
does not re-derive it.

28 notification triggers exist. The architecture is real. What is
missing:

- **No HTML is possible.** `email.provider.ts` hard-codes `text/plain`.
  No template engine of any kind.
- **The order confirmation is not a receipt** — it reuses the short
  string sent to SMS. No line items, totals, address or invoice.
- **No scheduler exists** (no `@nestjs/schedule`, no BullMQ), so
  review-request follow-ups and abandoned-cart recovery are currently
  *inexpressible*, not merely unbuilt.
- **No buyer welcome email, no email-verification link, no
  payment-failed email.**
- **Three preference categories have zero senders** — `promo`,
  `laundry`, `snacks` are toggles nothing can fire.
- `SENDGRID_API_KEY` is a placeholder, so every send is a logged stub.

P0.3, P0.4 and P0.5 above are the parts of this that are **defects
rather than deferred features**, and are queued accordingly.

---

## 6. Guardrails

Carried from `docs/PRODUCTION-AUDIT.md` §8, still binding:

- The channel matrix is a product decision. Snacks having no cart is
  **correct**.
- Location must never become a gate.
- `Product.isAvailable` and `moderationStatus` stay separate.
- `handoff/` is read-only. `styles/tokens.css` is law.
- Every change updates its docs in the same commit.
