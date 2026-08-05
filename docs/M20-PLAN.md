# M20 — Client rework, the gifts vertical, and finishing the loops

The M19 plan (`~/.claude/plans/apply-for-seller-account-graceful-brooks.md`)
covered the wallet fix, the apply form, withdrawing laundry and holding
subscriptions. This picks up from there: the client's change document, the
vertical it implies, and the two loops still open.

## Where this stands

Shipped and live on homekrafted.in:

| | |
|---|---|
| **WS0** `f2ba252` | Auto top-up no longer mints unpaid balance. Three intake forms stopped swallowing errors. |
| **WS1** `f2ba252` | Apply form: home-chef category, optional radius, waitlist for out-of-area, approval area guard. |
| **WS2** `78c7d5d` | Laundry withdrawn — route 404s, write endpoints 410, history preserved. |
| **WS5a–c** `78c7d5d` | Meal subscriptions: model, API, 30-minute brackets, 30 tests. Verified live end to end. |
| **Seeder** `7588c25` | Three demo meal plans on production. |

**Closed 2026-08-05:** `scripts/audit-uncollected-topups.sql` ran against
production and came back empty on all three result sets — no uncollected
credits, no affected wallets, no `AutoTopupRule` still enabled. WS0 stopped
the mint before anybody used it. See `docs/LAUNCH-READINESS.md` §0.0.

---

## The client document, read carefully

Twelve pages. Most is copy and layout. Two items are not, and those decide
the schema.

### Just copy

| Where | From | To |
|---|---|---|
| Hero | "Real home food, cooked near you." | **"Everything homemade"** + two CTAs: Order homemade food · Order Handkrafted Gifts |
| Occasions | "Shop by occasion" | **"Thoughtful Handkrafted Gifts for Every Occasion"** |
| Categories | "Shop by category" | **"Explore Homemade Favourites"** |
| Reels | "Straight from the kitchen" | **"Homemade on Your Feed"** |
| Hamper band | "Gift hampers, made by the maker" | **"Gifts that feel personal"**, eyebrow MADE FOR GIFTING |
| Nav | Shop · Gift Hampers · Snacks · About | **Homemade Food · Handcrafted Gifts · Gift Hampers · Occasions · About** |

### A rebuild, not a rename

**1. "This week's small batches" → "Meet the Hands Behind the Flavours."**
Four maker cards: photo, name, one-line story, their bestseller, a link to
the storefront. This swaps a *product* rail for a *vendor* rail. Everything
it needs exists — `VendorProfile.story` and `tagline` (M16) — and the
bestseller is the vendor's top-rated available product. `getFeatured` stays
for `/shop`.

**2. The wallet band comes out; a two-up goes in.** Left: gifting. Right:
**"Ghar Ka Khana, Every Day"** → **Explore Meal Plans**. That CTA is the
subscription work becoming visible, and it must not ship pointing at a
route that does not exist — so Phase 1 and Phase 3 land together or the
band waits.

**3. "Homemade, Your Way"** — a new four-card section: Bulk Orders (→
`/corporate`), Order Food (→ `/shop`), WhatsApp (→ `wa.me`), Get the App.
Replaces today's two-card services grid and absorbs the app panel.

**4. "Backed by"** — CUNA, ISB AIC, CGC. Data-driven from
`lib/data/site.ts`. **These are claims about real organisations.** Build
it; do not publish until somebody confirms each relationship is real and
the marks may be used. That is the client's call, not the build's — but an
unverified affiliation claim on a public site is a legal exposure, not a
copy nit, so it gets said out loud.

### The two that change the schema

**A. "Shop Handcrafted Gifts" is a non-food vertical.** Handmade décor,
candles, art, jewellery, personalised gifts. Today `Product` is food-shaped
throughout: `dietary`, `ingredients`, `shelfLife`, `storageInstructions`,
`isPackaged`, `defaultWeightSku`, and FSSAI verification on the vendor.

> **Decision: `Product.kind: food | craft`. One column, not a second
> model.** Same reasoning M18 applied to hampers — a craft is still a
> Product with a vendor, photos, price tiers, availability, moderation,
> reviews, cart, checkout and search. A parallel `CraftProduct` re-derives
> every one of those and then drifts. Food-only fields become conditional
> in the UI; the only schema change they need is `defaultWeightSku`
> becoming nullable.

**B. "Handcrafted Gifts → Pan-India" contradicts the radius filter.** Every
listing query gates on `distanceKm <= vendor.deliveryRadiusKm`. A candle
sent by post has no such limit.

> **Decision: `Product.shippingScope: local | national`.** An explicit
> column rather than deriving it from `kind`, because a kitchen shipping
> pickles nationally is a real case and deriving would forbid it. The
> location filter skips `national` rows entirely — they show with or
> without coords. This *extends* the M12 rule rather than breaking it:
> location was never a gate, and now some products are not even
> radius-eligible.

**C. Categories need a group.** The document carries two different lists —
a nav split food/gifts, and twelve homepage tiles. Add `Category.group:
food | gift` and `Category.sortOrder`. Tiles are categories ordered; nav is
categories grouped.

---

## Build order

Each phase is independently shippable and deployed before the next starts.

### Phase 1 — copy, nav, homepage structure
No migration. All of "just copy", plus the makers rail, the two-up,
"Homemade, Your Way" and "Backed by".

**Watch:** `app/page.tsx` reads its two promo bands from
`getHomePromoBands`, which is admin-editable via `/admin/collections`.
Replacing the wallet band means editing the **data**, not hardcoding JSX,
or an admin's edit silently stops reaching the page.

### Phase 2 — the gifts vertical
Migration: `Product.kind`, `Product.shippingScope`, `defaultWeightSku`
nullable, `Category.group`, `Category.sortOrder`. Twelve categories seeded.
`/gifts` filters `kind: craft`. The seller product form branches on kind —
a candle is not asked for its shelf life.

**Watch:** the FSSAI badge is food-specific. A jeweller must not be told
they are missing a food licence.

### Phase 3 — subscriptions become visible
`/meal-plans`, `/meal-plans/[slug]` (subscribe), `/account/subscriptions`
(pause, resume, skip, cancel). Seller portal gets plan CRUD and a delivery
queue — without those a kitchen cannot create a plan or see what it owes,
and the loop is buyer-only.

The API is built, deployed and verified live. This is UI over endpoints
that already work.

### Phase 4 — corporate
Admin queue, notification on inbound, quote → accept.

**The narrowing from the M19 review still stands: accepting a quote does
not create `Order`s.** `Order.userId` and `OrderItem.addressId` are
required, `OrderItem` has no `snackId`, and `paymentMethod` is
`wallet|razorpay|cod` with nothing meaning invoice terms. An admin places
the orders once an address and payment terms exist.

---

## Rules this work must not break

- **Location is never a gate.** No coords → full catalogue.
- The kitchen's switch (`isAvailable`/`isActive`) and the admin's
  (`moderationStatus`) stay separate; both must pass.
- `--hk-gold` is decorative-only: ≥16px bold, or pure decoration.
- Every image goes through `<ImageSlot>` with a real `alt`. Never
  AI-generate product photography.
- No `loading.tsx` over a route that can `notFound()` — that is a soft 404.
- A `"use client"` route file cannot export `metadata`; split a server
  wrapper.
- Anything keyed on the current time is client-only, or takes `now` as a
  parameter.
- Docs update in the same commit as the change (see CLAUDE.md's table).
