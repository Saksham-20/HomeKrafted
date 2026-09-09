# Client change list — September 2026

Source: the owner's Google Doc, tab **"Changes"**
(`docs.google.com/document/d/1O5C2brITKeaoaltv3bqLNV2r_VKllSEoBDUZonyuYVQ`,
tab `t.4t5qp48zjrdc`). The doc is ~40 lines of instruction wrapped around
**44 screenshots**, and the screenshots carry most of the meaning. They are
extracted to `.ux-shots/client-doc/NN.png` (gitignored — some of them show
real onboarded HomeKrafters by name and area, which is the
`screenshots-m36/` rule) and referenced below as **[NN]**.

Read this next to `DESIGN.md` (the approved visual direction, still
unshipped) and `docs/UX-REVIEW-2026-09.md` (the review these changes were
folded into).

## How to read the status column

| Status | Meaning |
|---|---|
| **NEW** | genuinely new work |
| **DONE** | already shipped; the doc's screenshot predates it |
| **PARTLY** | the data/mechanism exists, the surface does not |
| **CONFLICT** | collides with a rule in `CLAUDE.md` — needs an owner decision before it can be built, and the row says what the decision is |

**Nothing in the CONFLICT rows is a refusal.** Each is a place where doing
exactly what the doc shows would break a rule this codebase enforces with a
test, and each row gives the compliant way to get the same thing.

---

## A. Landing page

The doc rewrites most of the home page. Taken together these replace the
current section order, so they ship as one phase, not eleven commits.

| # | Ask | Ref | Status | Notes |
|---|---|---|---|---|
| A1 | Hero becomes a two-column band: mono eyebrow `HOME KITCHENS · CHANDIGARH, MOHALI & PANCHKULA`, Fraunces headline with a terracotta italic second line, body paragraph, two CTAs (solid pine "Order homemade food", outline "Order handcrafted gifts →"), photograph right | [15] [39] | NEW | Replaces the diagonal `SplitPanels` hero. That component's rules (`CLAUDE.md` § "The landing page is a split screen") retire with it — delete them in the same commit rather than leaving a spec for a component that is gone. |
| A2 | Headline wording | [15] [28] [39] [40] | **CONFLICT** | The doc gives three: "From home to the world", "Everything homemade", "Real *home food*, cooked near you." **Owner picks one.** A1 is buildable with any of them; do not ship a placeholder. |
| A3 | Tagline "From home to the world" under the logo | [16] [17] | NEW | Doc asks whether a font/colour is specified. Recommendation: Fraunces italic in `--hk-terracotta`, matching the existing italic accent word. Not Kalam — that is rationed to two decorative annotations per screen and this is a permanent brand line. |
| A4 | Stat strip: `200+ home chefs · 0 preservatives · 48 hr freshly made` | [28] [40] [43] [44] | **CONFLICT** | Production holds ~13 HomeKrafters. `CLAUDE.md` § "The rest of the landing page" states in terms that there is no "200+ home chefs" strip and that every number on the page is derived from the catalogue the page already fetched. Three compliant options: **(a)** render the real count from the catalogue and let it grow; **(b)** keep the strip and drop the chef stat, keeping "0 preservatives" and "48 hr"; **(c)** reword to a claim that is true at any size ("every dish cooked to order"). **Owner picks.** Shipping "200+" is a false statement about supply on the first screenful. |
| A5 | Remove the scrolling ticker | [14] | NEW | `components/home/Ticker.tsx`. It is also the home page's only horizontal-overflow offender at 390px (sweep: 3457px overhang). Deleting it closes both. |
| A6 | "This week's small batches" → **"Meet the Hands Behind the Flavours"**, four maker cards: photo, name, short story, their bestseller, `Explore ‹name› →` | [23] [32] | PARTLY | The section **already exists and already has this heading and shape** — but all four cards render the same stock portrait. That is the M28 defect (`Vendor.avatarSrc` on pre-M28 rows all pointing at one file). The real work is data, not layout: run `server/prisma/seed-avatars.ts` and give the demo kitchens distinct characters. See `CLAUDE.md` § "Vendor avatars". |
| A7 | Maker cards should carry a caricature | [24] [25] [26] [27] | PARTLY | Sixteen chef characters already ship (`lib/avatars/chef-characters.ts`, Open Peeps, CC0). The doc's illustrated cards are a *different* art style. Using the existing cast is free and compliant; commissioning the doc's style is a separate art brief. **Owner picks.** Note the doc's own caricatures are AI-generated — see § F. |
| A8 | "Straight from the kitchen" → **"Homemade on Your Feed"** | [33] | NEW | One string. The doc's screenshot also shows invented view counts ("1.2k · 18.4k views"); those are already gone — every seeded reel is `viewCount: 0` and `ReelViewer` gates on `> 0`. Screenshot is stale. |
| A9 | Gifting promo band → `MADE FOR GIFTING` / "Gifts that feel personal" (or "Thoughtfully Krafted, Beautifully Gifted") / "Explore Hampers →", with a photograph | [34] [36] | NEW | |
| A10 | Meal-plan promo band → `MEAL SUBSCRIPTIONS` / "Ghar Ka Khana, Every Day" / "Explore Meal Plans →", with a photograph | [36] | NEW | |
| A11 | Remove the wallet cashback band | [34] [35] | NEW + **bug** | Its copy reads "across the store **and laundry**". Laundry was withdrawn at M19. The same stale phrase survives twice more in `client/components/account/AddressBookClient.tsx` ("orders and laundry pickups", "checkout and laundry pickups") — fix all three whether or not the band goes. |
| A12 | New section **`MORE FROM HOMEKRAFTED` / "Homemade, Your Way"** — a 2×2 of numbered cards: 01 Celebrations & Events → `/corporate`, 02 Order Homemade Food → `/shop`, 03 Quick Order on WhatsApp → `/snacks`, 04 Homekrafted App → `/app-promo` | [37] | NEW | This is a promotion of `secondaryNav`, which today renders as the flat `QuickEntryRow`. Copy is given verbatim in the doc. |
| A13 | "Shop by category" → **"Explore Homemade Favourites"** with 12 tiles | [22] [30] | NEW + **bug** | Today it is 8 circles, so the last row is a single orphan tile [30]. Four of the twelve proposed tiles have **no image** and fall back to the labelled hatch placeholder [22] — that is the doc's "Icons are not visible" note. Needs four category photographs before the section can grow. |
| A14 | Occasion strip: replace the letter discs (A, B, B, C…) with real icons, one row | [19] [20] [21] [29] [41] [42] [43] [44] | PARTLY | The pine/gold line-icon set [21] is already drawn and in the brand's voice; the letter discs [41] are what still renders. Wire the icons and compact to a single row of 8. The doc also shows softer tinted-disc variants [29] and a script heading [43] [44] — those are style options, and the script face is not in the type system. |
| A15 | Occasion heading → **"Thoughtful Handkrafted Gifts for Every Occasion"** | [19] [29] | NEW | Note the doc spells it *Handkrafted*. The brand spells it **Handcrafted** everywhere else (`/gifts` is "Handcrafted Gifts"). Using the doc's spelling here would make the site inconsistent with itself. Recommend **"Thoughtful handcrafted gifts for every occasion"**. |
| A16 | **Home page does not look good on mobile** | — | NEW | The owner's words. This is the single largest item in the doc and it is not a copy change. It gets its own phase. |

## B. Navigation and taxonomy

| # | Ask | Ref | Status | Notes |
|---|---|---|---|---|
| B1 | Top nav → `Home \| Homemade Food \| Handcrafted Gifts \| Gift Hampers \| Occasions \| About` | — | **CONFLICT** | The current six tabs were set by the owner on 2026-09-05 (`Homemade Food · Handcrafted Gifts · Occasions · Subscription Plans · Bulk & Party Orders · About Us`) and the header was **split into two rows** to afford exactly that set. The doc's list drops Subscription Plans and Bulk & Party Orders and adds Gift Hampers — which M35 deliberately removed because `/hamper` listed one product and a top-slot has to carry a catalogue. Adopting it costs the two revenue surfaces their only top-level entry. **Owner decides**; if adopted, re-measure against the 1352px row (`e2e/tests/header-capacity.spec.ts`) and move the dropped two into `secondaryNav`. |
| B2 | Food nav dropdown → `North Indian \| Punjabi Meals \| Snacks \| Breakfast \| Street Food \| Beverages \| Cakes & Desserts \| Combos \| Pickles & Spreads \| Sunday Specials` | [09] [10] | NEW | Categories are admin-created rows, not a hand-kept list (`POST /admin/collections/categories`). This is a seed/admin task plus the panel, not a constant in the client. |
| B3 | Gifting nav dropdown → `Handmade Gifts \| Home Décor \| Candles \| Gift Hampers \| Personalised Gifts \| Jewellery \| Flowers \| Self-Care \| Festive Gifts \| Gifts Under ₹999` | [10] [11] | NEW, one **CONFLICT** | Every name but the last is fine. **"Gifts Under ₹999" is deliberately absent** (`CLAUDE.md` § "Subcategories"): a price band is the price filter's job, and a hand-tagged shelf goes stale the moment a maker edits a price. Ship the other nine; make the tenth a **preset link into the price filter**, which is the same thing for the shopper and does not rot. |
| B4 | Full homepage category structure — 11 food shelves under "Order Homemade Food", 10 gift shelves under "Shop Handcrafted Gifts" | [12] [13] | NEW | Given verbatim in the doc. Fits `Category.parentId` (M58, one level deep) exactly: the two groups are parents, the lists are their children. |
| B5 | Emoji homepage categories (🍲 Eat Homemade, 🥨 Snack Time, …) | [12] | NEW | `lib/category-emoji.ts` already exists for the quick-filter chips, where emoji are decoration and `aria-hidden`. Reuse it; do not put emoji in the category *names*, which are also URLs, page titles and admin rows. |
| B6 | State plainly that food is city/pincode-limited and gifts ship pan-India | — | NEW | Already true in the data (`shippingScope`, the delivery facet) and already implied on `/gifts` ("most ship anywhere in India"). The ask is to say it where a first-time visitor sees it. |

## C. Product, kitchen and seller surfaces

| # | Ask | Ref | Status | Notes |
|---|---|---|---|---|
| C1 | Show **"Preparation time: 48 hrs"** as a pill on the listing | [02] [03] | PARTLY | `Product.prepTimeMins` and `lib/pre-order.ts#isPreOrder` already exist and already drive a Pre-order badge above 30 minutes. This is a *display* change: render the figure itself, not only the badge. Keep the existing rules — the listing's own figure, never the vendor default; blank means "not stated" and gets no pill, never `0`. |
| C2 | Veg / Non-Veg option | [04] | **DONE** | `DietaryTag` carries `non-vegetarian` and `contains-egg`; `lib/diet.ts#dietOf` is the one reader; both browse pages filter on it. The doc's screenshot predates 2026-09-05. Confirm the marks render as the doc's two pills and close it. |
| C3 | Reviews for every chef **and** every gift maker | [08] | PARTLY | Reviews exist and are gated on a delivered order (M15). Verify the gift half has parity with the food half; the ask reads as "the gifting side has no review surface". |
| C4 | A review **of the kitchen itself**, not only of dishes | [08] | NEW | `Vendor.rating`/`reviewCount` are recomputed aggregates of product reviews. A kitchen-level review is a new subject for `Review`, and it still needs a delivered order — do not relax that to make it easier. |
| C5 | Seller story on every seller page + rating and reviews | — | PARTLY | `VendorProfile` holds the story and the storefront renders it. The gap is that a kitchen approved this morning has an empty one; the completion meter already names that. Verify, do not rebuild. |
| C6 | Kitchen/maker card should carry: caricature, bestseller, short bio, menu link | [08] [24] | PARTLY | All four already render on `KitchenCard`. What is wrong is the shared portrait (A6) and ragged card heights [05]. |
| C7 | One account may sell food **and** gifts | — | **DONE** | `PATCH /seller/specialties` (M33) is a full replacement of `Seller.specialties` from `/seller/profile → "What you make"`. Explicitly **not** a second application — that would mint a second `Vendor` and split one kitchen's reviews, followers and payouts. |
| C8 | Commission added automatically | — | **CONFLICT / verify first** | The engine exists (`commissionEnabled`, `server/src/seller/payout-split.ts`). `CLAUDE.md` says the switch is off; a session note says production has been running 20% + 18% GST since ≈2026-09-05. **Check the live `PlatformSettings` row before touching anything.** Flipping it is a business decision made on `/admin/settings`, it is audited, and it must never be done in passing by a UI change. If it is already on, the doc is asking for something already true and `CLAUDE.md` is stale. |
| C9 | Horizontal "Bestseller Food" / "Handkrafted Gifts" carousels with add-to-cart on the card | [06] | NEW | The reference is hotcrums.com. Note the carousel rule that survives M59c: rotation only where rotation *means* something, and never a rail directly above a grid showing the same objects. |

## D. Cross-cutting requirements the doc lists

| # | Ask | Status | Notes |
|---|---|---|---|
| D1 | Reels on the landing page | **DONE** | Four owner-supplied clips, second screenful, framed as proof. |
| D2 | WhatsApp number | PARTLY | `/snacks` orders via `wa.me`; the ask is a visible number. |
| D3 | Sharing | NEW | No share affordance on product or storefront pages today. |
| D4 | "Backed by" — add the logos | **DONE** | Added M24, moved to `/about` at M28. The doc's screenshot [38] is the pre-M24 text-only strip. Confirm the owner is looking at `/about` and close. |

## E. Reference sites the doc points at

- **hotcrums.com** [02] [03] [06] — the prep-time pill, the veg/non-veg pills, and the horizontal bestseller carousels with per-card add-to-cart.
- [07] — a "Meet the home chefs" hero with four trust badges (Made at Home, Cooked with Love, Fresh Ingredients, Hygienic & Safe) over a chef photograph, and a row of five chef cards.
- [12] [13] — photo-tile category grids with a circular icon badge and a one-line tagline per tile.

## F. The imagery problem, stated once

Most of the doc's mockups are **AI-generated** — the neon hero [16], the
gift-hamper hero photograph reused across [15] [28] [39] [40], the category
tiles [12] [13], the promo-band photographs [36], the `MORE FROM
HOMEKRAFTED` cards [37], and the chef caricatures [24] [25] [26] [27].

`CLAUDE.md` bans AI-fabricated product and food imagery outright: only real
assets, real uploads, licensed stock recorded in `docs/IMAGE-LICENSES.md`,
or the labelled placeholder. On a platform whose entire pitch is *a real
person made this*, a generated photograph of food nobody cooked is the one
lie the product cannot afford.

**This does not block the layouts.** Every mockup in the doc is buildable
with a real photograph in the same slot. What each one needs is a decision:

1. **Hero and promo photographs** — commission or license. Route new stock
   through `client/scripts/process-stock-images.mjs` and record it in
   `docs/IMAGE-LICENSES.md`, same as the M56 batch.
2. **Category tiles** — four of the twelve have no image at all [22]. Those
   four are the blocker on A13.
3. **Chef caricatures** — the only genuinely open question, because an
   illustration is not a photograph of a dish that does not exist. The
   sixteen Open Peeps characters already ship and are CC0. If the owner
   wants the doc's art style instead, that is an illustration commission
   with a consistent cast, not a generation.

## G. Per-product customisation — options, variants and minimum quantity

Added 2026-09-07, after the doc. The owner's words: *"Per product add an
option to add customisations. In every product it will be different, in
bangles its sizes and colour options as well. Min quantity option. Sizes
could be in grams, kgs, numbers, (s, m, L)."*

### What already exists, and why that matters

This is **not** a greenfield feature. `Product` already has one variant
axis: `weightOptions: WeightOption[]` plus `defaultWeightSku`, and
`WeightOption` already carries the things a variant must carry —
`sku` (globally unique), `label`, `price`, `mrp`, `stock`, and the
server-computed `salePrice`.

More importantly, **`sku` is already the purchasable unit end to end**:
`CartItem.sku`, `OrderItem.sku`, `resolveCartLine`'s pricing authority,
the M46 storefront-discount arithmetic, and the M45 stock rules all key on
it. That is the whole money path, and it is already variant-shaped.

So the correct move is to **generalise the axis, not to build a parallel
system**. Anything that invents a second notion of "which one did they buy"
alongside `sku` will disagree with the cart at some point, and the
disagreement will be about money.

### The model

Two new tables, and `WeightOption` keeps its name and its role as the
purchasable variant row (renaming it churns the cart, the order, the
seeds and every migration for nothing a buyer sees — the same reasoning
that keeps `seller` in code while the UI says HomeKrafter).

| Table | Purpose |
|---|---|
| `ProductOption` | one axis of choice on one listing: `productId`, `name` ("Size", "Colour"), `unit`, `position` |
| `ProductOptionValue` | one choice on that axis: `optionId`, `value` ("250 g", "M", "Rose gold"), `swatchHex?`, `position` |
| `WeightOptionValue` (join) | which value on each axis this variant *is* — `weightOptionId` + `productOptionValueId` |

`unit` is an enum and it is the answer to "sizes could be in grams, kgs,
numbers, S/M/L": `weight_g · weight_kg · volume_ml · count · apparel ·
free`. It decides the **input control and the formatting**, never the
price — a maker typing "250" under a `weight_g` option gets "250 g"
rendered for them, which is what stops the current free-text labels
drifting into "250gm", "250 Gms" and "0.25kg" on three listings.

Two rules carried from existing ones:

- **Absence is one unnamed variant, never zero.** A pre-existing listing
  has `weightOptions` and no `ProductOption` rows; it renders exactly as
  it does today, with no picker. This is the M45 rule ("the size label
  falls back to `One`") and the M12 rule (absence is not a closure).
- **A variant with no stock is shown and disabled, never hidden.** Hiding
  the sold-out size is how a buyer concludes the listing is broken. This
  is also where `parseStock`'s lesson applies: blank is `DEFAULT_STOCK`,
  a typed `0` is a real zero.

### Minimum quantity

`Product.minOrderQty: Int?` — per listing, not per variant, because the
constraint a home cook actually has is "I don't fire the oven for one
brownie", which is about the item. Absent means 1.

It is **not** `VendorProfile.minOrderValue`, which already exists and is a
rupee floor for the whole kitchen. Both can be true at once and they fail
differently, so they need different sentences: "this maker asks for a
minimum of 6" versus "orders from this kitchen start at ₹500".

Enforced server-side in `resolveCartLine` and refused at checkout, with
the `QuantityStepper` clamping its own floor so the buyer never reaches a
refusal they could have been shown. The M15 pattern: the UI decides what
to *offer*, the server decides what is *allowed*.

### Surfaces this touches

| Surface | Change |
|---|---|
| PDP purchase panel | option pickers, one row per axis; swatches for `colour`; the price/stock/sale figures re-read from the selected variant; the docked mobile bar shows the selected variant |
| Product card | no picker — the card buys the default variant, and the one-press "+" already resolves through `lib/cart/purchasable-sku.ts` |
| Listing form (long) | an options editor: add axis → add values → generate the variant matrix, each row priced and stocked |
| Guided listing flow | asks for **one** axis at most, and defaults to none — the M45 rule that the guided flow hides questions, never capability |
| Cart / order lines | already print the variant label; verify multi-axis labels read correctly ("M · Rose gold") |
| Admin catalogue | the same editor, through `SellerListingsService` — still the one owner of product writes (M44) |

### Open question for the owner

**Does adding or changing an option re-queue the listing for review?**
M22 says a material change is name, description, category or photo — not
price, stock or tags. A new *colour* is closer to a tag; a new **size**
changes what is being sold. Recommendation: **no re-queue** for values on
an existing axis, **re-queue** when an axis is added, since that is a new
claim about the product. Needs confirming before it is built.

### Research note

The reference implementations to follow here are Shopify's option/variant
split, Amazon's parent/child ASIN twister and Flipkart's variant swatch
rail — all three separate *options* from *variants* exactly as above, and
all three keep the purchasable unit as the variant. Detailed pattern
research is part of the review pass; this section records the shape the
codebase already forces.

---

---

## Sequencing — where the build starts

Ordered so that each phase is shippable on its own, and so the phases the
owner would notice first come first. **Phase 0 is the start.**

### Phase 0 — decisions and data (no UI)
Nothing below can be built correctly until these are answered, and each is
cheap.

- A2 headline wording · A4 the stat strip · A7 caricature style · B1 the nav
  set · F imagery route.
- Verify C8 against the live `PlatformSettings` row.
- Run `seed-avatars.ts` so the four maker cards stop sharing one face (A6) —
  this is data, and it is the single most visible defect in the doc.
- Close the already-done rows after checking them on the running site: C2,
  C7, D1, D4, and the stale reel counts in A8.

### Phase 1 — the bugs the doc caught
Independent of every decision above.

- A11 the "and laundry" copy, in all three places.
- A13's orphan category row.
- A14's letter discs → the icons already drawn.
- A5 delete the ticker (also removes the home page's 390px overflow).
- The four missing category images (blocks A13).

### Phase 2 — landing page rebuild
A1, A3, A6, A8, A9, A10, A12, A13, A14, A15 as one coherent pass, plus the
`SplitPanels` retirement. This is the phase the owner sees.

### Phase 3 — mobile landing (A16)
Deliberately after Phase 2: rebuilding the sections and then fixing their
phone layout twice is wasted work.

### Phase 4 — taxonomy
B2, B3, B4, B5, B6 — seed and admin work plus the nav dropdowns.

### Phase 5 — product and seller surfaces
C1, C3, C4, C5, C6, C9, D2, D3.

### Phase 6 — per-product customisation (section G)
The options/variants model, the minimum quantity, the PDP pickers and the
listing-form matrix editor. Last because it is the only item that changes
the money path, and it wants the review's system work and the catalogue
work already landed underneath it.

**These interleave with the UI/UX review's own findings** — the review's
system work (a skeleton primitive, an empty-state primitive, a motion
ladder, the CTA doctrine) lands first, because it makes Phases 2–5 smaller.
See `docs/UX-REVIEW-2026-09.md`.
