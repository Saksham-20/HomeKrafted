# Design system — usage guide

The design system itself lives in `handoff/design-system/` (`tokens.css`,
`tokens.json`, `design-system.md`, `components.md`) and is the visual
contract — read those files for the actual rules (color roles, type
scale, spacing, radius, channel badges). This doc is the short version:
**how the tokens get consumed in this codebase**, not a restatement of
the rules themselves.

## Where things live

Monorepo note: every path below is relative to `client/` (the Next.js web
app) — see root `CLAUDE.md`.

```
styles/tokens.css        verbatim copy of handoff/design-system/tokens.css — LAW, never edited
styles/tokens.extend.css app-level vars for the token gaps below (M1) — additive, NOT part of handoff/
styles/globals.css       reset, base body, font-variable bridge, .container utility
lib/tokens.ts             typed TS mirror of tokens.json — for JS-side use only (rare)
app/layout.tsx            loads tokens.css + tokens.extend.css + globals.css + the 3 font families
components/ui/            (M1) 26 primitives ported from handoff/design-system/components.md
app/gallery/               (M1) dev-only gallery rendering every ui/ primitive in every state —
                          404s in production (see "M1 component gallery" below)
```

## Consuming tokens in a component

Always reference `var(--hk-...)` in `*.module.css` — never a raw hex that
already has a token. Example (`components/layout/Header.module.css` style):

```css
.card {
  background: var(--hk-surface);
  border: 1px solid var(--hk-border);
  border-radius: var(--hk-r-lg);
  padding: var(--hk-s4);
  box-shadow: 0 0 0 transparent; /* var(--hk-shadow-card) on hover-raise */
}

.eyebrow {
  font-family: var(--hk-font-mono);
  font-size: 12px;
  letter-spacing: 0.16em; /* .12–.22em per the design system */
  text-transform: uppercase;
  color: var(--hk-gold); /* decorative use only — see contrast rule below */
}
```

`lib/tokens.ts` exists only for the rare case a token value is needed in
JS/TS itself (canvas, computed inline style, chart color) — it is **not**
the normal path; component styling goes through CSS Modules + `var()`.

## Token gaps — `styles/tokens.extend.css` (M1)

A handful of prototype colors (text/dividers sitting on solid or tinted
brand backgrounds) recur across components but have no home in the
verbatim `tokens.css` copy. As of M1 these are centralized as real custom
properties in `styles/tokens.extend.css` — imported once in `app/layout.tsx`
immediately after `globals.css` — rather than repeated as hardcoded hex in
every component that needs one. `tokens.css` itself is untouched;
`tokens.extend.css` is purely additive and is **not** part of the
`handoff/` design system (it doesn't exist there — it's an app-level
convenience layer). See root `CLAUDE.md` → "Known token gaps" for the full
list and per-var rationale; the short version:

| Var | Hex | Use |
|---|---|---|
| `--hk-on-pine` | `#EADFC9` | copy on solid `--hk-pine` (announcement bar, tag chips, dark badges, PromoBand dark, WalletBalanceCard) |
| `--hk-gold-text-sm` | `#8A6A16` | gold-family text at small sizes on white/gold-tint (wallet chip, cashback lines, `ghost-gold` button label) |
| `--hk-footer-ink` | `#C7D3C5` | body copy on solid `--hk-pine-deep` (footer + any dark-pine surface) |
| `--hk-footer-ink-2` | `#A9BCAE` | link list on the same surfaces |
| `--hk-footer-muted` | `#9FB3A5` | brand blurb |
| `--hk-footer-mono` | `#7E9488` | mono legal row |
| `--hk-footer-border` | `#2C473A` | divider above the legal row |
| `--hk-scrollbar` | `#D9CDB4` | `.hk-scroll` scrollbar-thumb tint (decorative) |

A few narrower one-off gaps used in exactly one component stayed as local
hardcoded-plus-comment values instead (not worth centralizing a single-use
color) — see the inline comment in `ProductCard.module.css` (`.added`
border), `SnackCard.module.css` (`.added` border), `TransactionRow.module.css`
(debit icon tint), `StoreBadges.module.css` (on-dark border).

## Contrast rule for gold

`--hk-gold` (`#B98724`) is ~3.6:1 on white — fine for ≥16px bold text or
pure decoration (eyebrows, "view all" links), **not safe for small body
text**. Anywhere the prototype needed gold-family color at small sizes on
a white/tinted surface, use `--hk-gold-text-sm` (`tokens.extend.css`,
above) instead of `--hk-gold` directly.

## Layout containment

Full-bleed sections (colored bands, header, footer) span the viewport;
their content is contained by the `.container` global utility class
(`styles/globals.css`): `max-width: 1180px`, centered, with responsive
`padding-inline` that steps down at 780px and 420px. This replaces the
prototype's fixed 430/1180 "stage" — the real site is fluid down to
360px. Compose it with a component's own CSS Modules class via `clsx`:

```tsx
<div className={clsx("container", styles.row)}>...</div>
```

## Fonts

Three families, all via `next/font/google`, loaded once in
`app/layout.tsx`:

| Family | Token var | Weights loaded | Use |
|---|---|---|---|
| Fraunces | `--hk-font-display` | 400, 500, 600, 700 + italic | headings, product names, prices |
| IBM Plex Sans | `--hk-font-body` | 400, 500, 600 | body copy, controls, nav |
| IBM Plex Mono | `--hk-font-mono` | 400, 500 | eyebrows, meta, always UPPERCASE + `letter-spacing: .12–.22em` |

`next/font` exposes each as a CSS variable on `<html>`
(`--font-fraunces`/`--font-plex-sans`/`--font-plex-mono`);
`styles/globals.css` re-points the `--hk-font-*` token vars at them
(imported after `tokens.css`, so it wins the cascade) — component CSS
never needs to reference `--font-fraunces` etc. directly, just the
`--hk-font-*` tokens as usual.

## Icons

`lucide-react` for all line icons (24px grid, `currentColor`, stroke-width
1.6–1.7 per `design-system.md`). Brand marks (WhatsApp, App Store, Play)
are inline SVG, filled, never recolored — added as needed starting M1/M5.

## Images

Nothing renders a real photo yet, anywhere. Every image slot goes through
`<ImageSlot>` (`components/placeholder/ImageSlot.tsx`) — the labelled
diagonal-hatch placeholder ported from the prototype. See `CLAUDE.md` for
its prop shape. This is a hard rule, not a temporary convenience: "no fake
art" means no AI-generated stand-in photography either, even to make a
milestone look more finished — placeholders stay until real photography
is supplied.

## M1 component gallery

`app/gallery/` (`page.tsx` + `GalleryClient.tsx`) renders every
`components/ui/` primitive in every documented state (default / hover /
selected / disabled, where each applies) against real `lib/api` mock data,
for visual QA against `handoff/prototype/Homekrafted.dc.html`. It's a dev
tool, not a shipped screen: `page.tsx` calls `notFound()` when
`process.env.NODE_ENV === "production"`, so the route 404s in a production
build, and it's never linked from any nav. Safe to delete once every
screen milestone (M2–M7) has exercised these primitives in situ; until
then, it's the fastest way to eyeball a component change across every
state at once.

## `components/ui/` — the M1 primitives

26 components, ported from `handoff/design-system/components.md` into CSS
Modules over `tokens.css` (+ `tokens.extend.css` for the gaps above). Named
exports, `Thing.tsx` + `Thing.module.css` co-located. Each maps to a
`components.md` section and to the M2+ screen(s) that will consume it:

| Component | components.md section | Where it gets reused (M2+) |
|---|---|---|
| `Button` | Buttons | everywhere — CTAs, add-to-cart, WhatsApp send, icon buttons |
| `QuantityStepper` | Buttons (quantity stepper) | Product detail, Cart, Hamper |
| `Chip` | Chips/Badges (filter chip) | Shop filters, Snacks category filter |
| `ChannelBadge` | Chips/Badges (channel badge) | Home service cards, Laundry/Snacks/app-promo headers |
| `Tag` | Chips/Badges (tag) | ProductCard corner tag |
| `DietDot` | Chips/Badges (diet dot) | SnackCard, Snacks menu |
| `Card` | Cards (base recipe) | generic white/border/radius-lg container, used ad hoc |
| `ProductCard` | Cards (product card) | Home featured rail, Shop grid, Collections, Storefront |
| `CategoryTile` | Cards (category tile) | Home "shop by category", Shop sidebar |
| `OccasionTile` | Cards (occasion tile) | Home "shop by occasion", Collections index |
| `SnackCard` | Cards (snack card) | Snacks menu grid |
| `ServiceCard` | Cards (service card) | Laundry service picker |
| `PromoBand` | Panels (promo band) | Home hamper band (dark) + wallet band (tint) |
| `WalletBalanceCard` | Panels (wallet balance card) | Wallet screen |
| `StickySummary` | Panels (sticky summary aside) | Hamper basket, Laundry booking summary, Cart, Snacks list |
| `SearchField` | Forms & pickers | Header search pill, Shop search |
| `SlotPicker` | Forms & pickers (day/slot picker) | Laundry pickup + delivery day/slot grids |
| `AmountPicker` | Forms & pickers (top-up amount picker) | Wallet top-up |
| `PriceRange` | Forms & pickers (price range) | Shop filter aside |
| `PhotoUpload` | Forms & pickers (photo upload) | Laundry dry-clean estimate, Hamper basket "add more" |
| `Textarea` | Forms & pickers (special instructions) | Laundry instructions, Hamper gift note |
| `StepPills` | Progress (step pills) | Hamper builder (Box/Fill/Message/Checkout), Laundry booking |
| `CapacityMeter` | Progress (capacity meter) | Hamper box fill |
| `StatusTimeline` | Progress (WhatsApp status timeline) | Snacks WA status (tone="whatsapp"), general order status (tone="pine") |
| `TransactionRow` | Wallet-specific (transaction row) | Wallet transaction list, Account orders |
| `QRTile` | QR / app install | Home "get the app", app-promo |
| `StoreBadges` | QR / app install (App Store/Play pair) | Home food-delivery card, app-promo, footer |

Every component with an image area (`ProductCard`, `CategoryTile`,
`SnackCard`, `PhotoUpload`'s thumbnails) renders it through `<ImageSlot>` —
no exceptions, per the placeholders-only rule.

### Documented deviations from the prototype

A few components intentionally extend or normalize the prototype rather
than reproducing it pixel-for-pixel — each is called out inline in the
component's own file, summarized here:

- **ProductCard wishlisted (filled-heart) state** — the prototype never
  shows a filled wishlist heart (every instance renders the idle outline);
  `ProductCard.module.css` adds a real filled/terracotta state so
  "selected" has a look, reusing the existing terracotta token rather than
  inventing one.
- **StatusTimeline `current` step** — an in-progress emphasis state
  (partial ring, not fully "done") beyond what the prototype's WhatsApp
  panel shows, needed for the general pine-tone order-status reuse.
- **PriceRange as two native range inputs** — the prototype renders a
  static decorative bar; the M1 port uses two overlapping
  `<input type="range">` elements (each showing only its own thumb) for
  real pointer-drag + keyboard accessibility, same visual track/fill/handle.
- Several near-identical prototype hex values were normalized to the
  nearest existing token rather than kept as separate hardcoded values
  (e.g. the prototype's `#C9A24a` hover border → `--hk-gold-border`,
  `#EEEDE9` meter track → `--hk-border`) — flagged inline where it happens.

## M2 feature components

Beyond the 26 `components/ui/` primitives, M2 (Marketplace browse) added a
handful of screen-specific feature components — composed from the M1
primitives, not new visual primitives in their own right. Each stays
co-located as `Thing.tsx` + `Thing.module.css` under its module directory:

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `Hero` | `components/home/` | `ImageSlot` | Home |
| `CraftCard` | `components/home/` | `ChannelBadge`, `StoreBadges` | Home "one home, three crafts" band |
| `AppInstallPanel` | `components/home/` | `QRTile`, `StoreBadges` | Home app-install band |
| `OccasionTileLink` / `CategoryTileLink` | `components/home/` | `OccasionTile` / `CategoryTile` | Home (client wrappers — `router.push` on click, avoids nesting a `<button>` inside a `<Link>`'s `<a>`) |
| `ProductGallery` | `components/product/` | `ImageSlot` | Product detail |
| `ProductPurchasePanel` | `components/product/` | `Chip`, `QuantityStepper`, `Button` | Product detail (weight select, quantity, add-to-cart no-op, wishlist, add-to-hamper) |
| `ProductTabs` | `components/product/` | `ReviewList` | Product detail (Description+specs / Reviews tabs) |
| `ProductGridCard` | `components/product/` | `ProductCard` | Every product grid (Home featured rail, Shop, Storefront, Collections) — client wrapper owning navigation + local wishlist/"added" state |
| `StoreHeader` / `FollowButton` | `components/storefront/` | `ImageSlot`, `Button` | Storefront |
| `ReviewCard` / `ReviewList` | `components/review/` | — (new, star row + verified-purchase badge) | Product detail, Storefront |

`ReviewCard`/`ReviewList` are the one genuinely new visual pattern in M2
(the prototype never shows reviews at all) — star row ported at the same
visual weight as the product-detail rating line, verified-purchase badge
reuses `--hk-success`/`--hk-success-tint` (the existing feedback tokens,
not a new color).

## M3 feature components (Buy flow)

M3 (Hamper builder / Cart / Checkout) is the first milestone with real
cross-page state (`lib/cart/CartContext.tsx`) and extends two M1
primitives rather than only composing them:

- **`StickySummary` gained two additive, backward-compatible props:**
  `beforeLines?: ReactNode` (content between the title and the line
  items — e.g. a `<CapacityMeter>`, keeping the Hamper basket a single
  bordered card instead of two stacked ones) and `stickyOnMobile?:
  boolean` (pins just the CTA to a full-width bar fixed to the
  viewport bottom below ~640px, so a long scrollable list — Hamper's
  fill grid, a big cart — never buries the primary action below the
  fold; the rest of the card stays in normal flow above it). Both
  default to off/undefined — every M1/M2 call site renders unchanged.
  Any page using `stickyOnMobile` must reserve bottom padding on its own
  root container at the same breakpoint so the fixed bar doesn't cover
  its last content (see `Cart.module.css`/`CheckoutClient.module.css`).

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `CartProvider` / `useCart` | `lib/cart/CartContext.tsx` | — (React context, not a visual component) | Root layout; `ProductPurchasePanel`, `ProductGridCard`, `HeaderClient`, `/cart`, `/checkout` |
| ~~`HamperBuilderClient`~~ | *removed M18* | — | `/hamper` is now a `ProductGridCard` grid of `isHamper` listings; the wizard and `HamperFillTile`/`HamperBasket` went with it |
| ~~`HamperFillTile`~~ | *removed M18* | — | went with the builder |
| ~~`HamperBasket`~~ | *removed M18* | — | went with the builder |
| `LegalPage` | `components/legal/` | — | `/terms`, `/privacy`, `/refunds`, `/contact` — shared shell for the policy pages, incl. the "details not filled in yet" banner |
| `CartLineRow` | `components/cart/` | `ImageSlot`, `QuantityStepper` | `/cart` line items |
| `CheckoutClient` | `components/checkout/` | `StickySummary`, `SlotPicker`, `Textarea`, `AddressForm`, `OrderConfirmation` | `/checkout` |
| `AddressForm` | `components/checkout/` | — (plain labeled inputs, no shared Input primitive exists yet) | Checkout's inline "add address" and gift-recipient forms |
| `OrderConfirmation` | `components/checkout/` | `StatusTimeline` | Checkout's post-place-order state (not a separate route) |

`AddressForm` uses plain `<input>` elements styled locally rather than a
shared `ui/` primitive — there wasn't an existing text-input component to
reuse (`SearchField`/`Textarea` are shaped differently), and one generic
labeled-input component felt premature to extract from a single
consumer; revisit if M7's address-book CRUD or another module needs the
same field set.

## M4 feature components (Laundry booking flow)

M4 (Laundry, Cleaning & Ironing) is the first milestone to compose
`ServiceCard`, `SlotPicker` (used twice — pickup and delivery, a genuinely
new two-picker pattern), and `PhotoUpload` together in one real screen,
plus two new feature components:

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `LaundryBookingClient` | `components/laundry/` | `ServiceCard`, `SlotPicker` (×2 — pickup + delivery), `QuantityStepper`, `PhotoUpload`, `Textarea`, `Chip`, `StickySummary` (`stickyOnMobile`) | `/laundry` — the full booking form |
| `LaundryBookingConfirmation` | `components/laundry/` | `StatusTimeline` | `/laundry`'s post-`createBooking` state (not a separate route, mirrors Checkout's `OrderConfirmation`) |
| `AppTrackingBand` | `components/laundry/` | `ChannelBadge`, `StoreBadges` | `/laundry` — the closing "live rider tracking is on the app" band, rendered whether or not a booking exists yet |

Notes on how these compose the M1 primitives:

- **Two `SlotPicker`s per scheduling block** (day row + time row), and
  **two scheduling blocks** (pickup, delivery) — the prototype only had
  one pickup picker; delivery is a genuine M4 addition per the plan's
  "two-slot scheduling" requirement. Both required; `LaundryBookingClient`
  validates the delivery date isn't before the pickup date before calling
  `createBooking`.
- **`PhotoUpload` + an item-count `QuantityStepper`** render together only
  when the selected service's `pricingModel === "per-item"` (Dry Clean,
  Steam Ironing) — Wash & Fold (`per-kg`) and Home Cleaning (`per-hour`)
  show the same `QuantityStepper` alone, relabeled ("Estimated weight" /
  "Estimated hours"), so all three pricing models exercise one shared
  quantity control rather than three bespoke ones.
- **`AppTrackingBand` reuses `ChannelBadge`'s `full-meals` variant**
  ("On the app · Coming soon", gold-dark) rather than inventing a fourth
  badge style — the band's whole message ("this specific feature —
  live tracking — is app-only") is the same shape as `full-meals`'s
  channel rule, even though the surrounding page (`laundry`) is
  web-bookable. Paired with `StoreBadges` (`outline` variant, same as
  Home's food-delivery `CraftCard`) for real store links in place of the
  prototype's static "Notify me →" pill.
- **Payment tiles (wallet / online / COD)** follow `CheckoutClient`'s
  wallet/Razorpay tile pattern exactly, adding a third `cod` tile — no
  shared "PaymentTileGroup" primitive exists yet since only two screens
  (Checkout, Laundry) need it; worth extracting if a third payment-method
  picker shows up (e.g. Snacks, if it ever grows checkout).

## M5 feature components (Snacks + Food Delivery promo)

M5 is the first milestone to compose `SnackCard`, `Chip` (category
filter), and `StatusTimeline`'s `tone="whatsapp"` together in one real
screen, plus a fresh promo-only page with no M1–M4 precedent to port from:

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `SnacksClient` | `components/snacks/` | `Chip`, `SnackCard`, `QuantityStepper`, `StickySummary` (`stickyOnMobile`), `StatusTimeline` (`tone="whatsapp"`), `Button` (`whatsapp`) | `/snacks` — category filter, grid, and the sticky "your snack list" aside |
| `AppInstallPanel` (reused, not new) | `components/home/` | `QRTile`, `StoreBadges` | `/app-promo` — the "get the app" panel, same component as Home's app-install band |

Notes on how these compose the M1 primitives, and where M5 deviates from
a literal prototype port:

- **`SnackCard`'s add/added toggle is a per-snack boolean, not a
  quantity.** Clicking "+ Add" adds one line to the snack list at
  quantity 1; clicking it again removes the line. Quantity beyond 1 is
  adjusted in the sticky list itself via a `QuantityStepper` per line
  (mirroring `HamperBasket`'s pattern of a `QuantityStepper`/remove pair
  per row) — a genuine M5 addition over the prototype, which only ever
  renders a static "×1" per line with no interactivity. `SnackListItem`
  already modeled a `quantity` field (`lib/types/food.ts`), so this uses
  the schema as designed rather than leaving it permanently at 1.
- **The snack list is real client state, never `useCart`.** `SnacksClient`
  holds `Record<snackId, quantity>` locally; there is no cart/checkout
  entity and nothing is persisted server-side (see `lib/channel.ts` —
  Snacks is `hasCartOnWeb: false`, `hasCheckoutOnWeb: false`). The
  estimate total is the real sum of `price × quantity` across lines, not
  a hardcoded figure.
- **`buildSnackListMessage`** (`lib/snacks/message.ts`) formats the
  WhatsApp payload from the current list + estimate, mirroring
  `sampleSnackList.whatsappPayload`'s wording exactly so a real,
  user-built list and the mock fixture read identically in chat.
  `buildWhatsAppLink` (`lib/messaging.ts`) turns that into the `wa.me`
  URL the "Send list on WhatsApp" button opens — pattern:
  `https://wa.me/<HOMEKRAFTED_WHATSAPP_NUMBER>?text=<encoded message>`.
- **`ChannelBadge` replaces the prototype's plain mono-text eyebrow** on
  both `/snacks` ("Order on WhatsApp") and `/app-promo` ("On the app ·
  Coming soon") — same substitution `CraftCard` already made on Home, so
  the badge copy stays sourced from `lib/channel.ts` instead of being
  hand-typed per screen. The "No checkout — we reply on chat" pill next
  to it is literal prototype copy, kept as a small local pill (reuses
  `--hk-success-tint`/`--hk-whatsapp-deep`, no new tokens needed).
- **`/app-promo` has no prototype screen to port** — the prototype's Home
  page only ever shows the dark "Food Delivery · Coming soon" card
  (ported as `CraftCard variant="food"` in M2). The dedicated promo page
  is new M5 content: a hero reusing that same dark-gradient/gold-bright
  treatment, a "why the app" value-prop grid (fresh copy, not ported),
  and `AppInstallPanel` reused as-is from `components/home/` rather than
  duplicated — it was already generic (no Home-specific props).
- **Both `/snacks` and `/app-promo` assert their channel rule in code** —
  `getChannelRule("snacks")` / `getChannelRule("full-meals")` are checked
  at the top of each page component, throwing if `hasCartOnWeb` /
  `hasCheckoutOnWeb` / `hasMenuOnWeb` ever flip to `true` without the page
  being deliberately redesigned, per `CLAUDE.md`'s channel-critical
  instruction for this milestone.

## M6 feature components (Wallet)

M6 (Wallet) is the first milestone to compose `WalletBalanceCard`,
`AmountPicker`, and `TransactionRow` together in one real screen, and adds
the second real cross-page client store after `CartContext`:

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `WalletProvider` / `useWallet` | `lib/wallet/WalletContext.tsx` | — (React context, not a visual component) | Root layout (alongside `CartProvider`); `HeaderClient`/`MobileDrawer`, `/wallet`, `CheckoutClient`, `LaundryBookingClient` |
| `WalletClient` | `components/wallet/` | `WalletBalanceCard`, `AmountPicker`, `TransactionRow`, `Card`, `Button` | `/wallet` — balance, add-money, auto-top-up editor, pay-with-wallet info card, transaction history |

Notes on how `WalletClient` composes the M1 primitives, and where M6
deviates from the prototype:

- **`WalletContext` mirrors `CartContext`'s shape exactly** — a
  `localStorage`-persisted React context, hydrated post-mount (`stored`
  read in a `useEffect`, gated by a `hydrated` ref so the pre-hydration
  render never clobbers existing storage), seeded on first-ever load from
  `lib/api/wallet` (`getWallet`/`getTransactions`/`getAutoTopupRule`)
  rather than an empty default — the wallet has real starting data,
  unlike a cart. Exposes `topUp`/`pay`/`earnCashback`/`refund`/
  `setAutoTopup`; every op appends a `WalletTransaction` with the correct
  `direction`/`category`/`balanceAfter`/`refType`/`refId`. `pay` returns
  `{ ok: false }` without mutating state when the live balance can't
  cover the amount — callers (`CheckoutClient`, `LaundryBookingClient`)
  gate the wallet payment option on a live sufficiency check *before*
  calling it, so this is a defensive fallback, not the primary guard.
- **Auto-top-up (`AutoTopupRule`, `below-threshold` trigger) is a genuine
  M6 addition, not a prototype port** — the prototype's Wallet screen
  never shows an auto-top-up editor, but the plan's Wallet line item and
  the `AutoTopupRule` type (present since M0) both call for one. Built as
  a plain enable-checkbox + two number inputs (same "styled `<input
  type=checkbox>`, no dedicated `ui/` toggle primitive" convention
  `CheckoutClient`'s gift toggle and `LaundryBookingClient`'s subscription
  toggle already established) rather than inventing a new primitive for a
  single consumer. Fires automatically inside `pay()` whenever a
  successful debit drops the balance under the configured threshold —
  never rescues an *insufficient* payment, only reacts after a completed
  one.
- **The prototype's "Get 3% extra on top-ups above ₹2,000" copy is
  actually wired**, not purely decorative — `topUp()` appends a second
  `category: "cashback"` credit (titled "Top-up bonus (3%)") whenever the
  top-up amount exceeds `TOPUP_BONUS_THRESHOLD`. The prototype only ever
  showed this as static text under a non-functional demo button.
- **"View full history" expands in place** (client-side `showFullHistory`
  toggle, transactions grouped by month via `formatDate(..., { month:
  "long", year: "numeric" })` once expanded) rather than a `TransactionRow`
  wall or a separate route — the prototype's button has no wired behavior
  at all (static demo chrome).
- **Checkout/Laundry back-wiring:** both `CheckoutClient` and
  `LaundryBookingClient` previously computed `walletSufficient`/the
  cashback preview against the server-fetched `wallet` prop's *static*
  balance (a snapshot from page load); both now read `useWallet().balance`
  live for sufficiency checks and displayed balance, while still seeding
  the initial payment-method *preference* from the static prop (avoids a
  hydration-race default to Razorpay on a hard reload — see the inline
  comment in each file). `handlePlaceOrder`/`handleConfirm` call `pay()`
  (wallet only) then `earnCashback()` (Checkout: every order, matching its
  pre-existing unconditional `cashbackEarned`; Laundry: wallet-paid
  bookings only, matching M4's pre-existing `walletCashback` scoping) once
  the mock `createOrder`/`createBooking` call returns.
- **Header wallet chip is live client state**, same pattern M3 already
  established for the cart badge — `HeaderClient` reads
  `useWallet().balance` instead of a `walletBalance` prop the server
  component fetched once. Shows "…" instead of a misleading ₹0 while
  `WalletContext` is still hydrating (mirrors the cart badge's own
  pre-hydration handling, just visible instead of hidden since the wallet
  chip always renders a value).

## M7a feature components (Account core)

M7a is the first milestone with no reference prototype screen — the
account shell, unified order history, address book, profile, and
wishlist are built entirely inside the established design system
(`Card`, `Button`, `Chip`, `StatusTimeline`, `Textarea`) rather than
ported from `handoff/prototype/Homekrafted.dc.html`.

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `WishlistProvider` / `useWishlist` | `lib/wishlist/WishlistContext.tsx` | — (React context) | Root layout; `ProductGridCard`, `ProductPurchasePanel`, `HeaderClient`/`MobileDrawer`, `/account/wishlist` |
| `AuthProvider` / `useAuth` | `lib/auth/AuthContext.tsx` | — (React context) | Root layout; `LoginClient`, `AccountShell`, `AccountOverviewClient`, `ProfileClient` |
| `LoginClient` | `components/auth/` | `Card`, `Button` | `/login` |
| `AccountShell` | `components/account/` | `Button` | `app/account/layout.tsx` — every `/account/*` route |
| `AccountOverviewClient` | `components/account/` | `Card` | `/account` |
| `OrdersListClient` / `OrderDetailClient` | `components/account/` | `Card`, `Chip`, `StatusTimeline`, `AppTrackingBand` | `/account/orders`, `/account/orders/[id]` |
| `AddressBookClient` | `components/account/` | `Card`, `Button`, `Textarea` | `/account/addresses` |
| `ProfileClient` | `components/account/` | `Card`, `Button` | `/account/profile` |
| `WishlistPageClient` | `components/account/` | `Card`, `Button`, `ImageSlot` | `/account/wishlist` |

Notes on M7a's design decisions:

- **`AccountShell` reuses the header's own responsive technique** —
  `Header.module.css`'s desktop-nav-vs-hamburger split is a CSS layout
  swap, not conditional JS rendering; `AccountShell.module.css` does the
  same for its one `<nav>` (`flex-direction: column`, sticky, desktop →
  `flex-direction: row`, horizontally scrollable via the shared
  `.hk-scroll` utility, below 780px). No hydration-mismatch risk, and one
  markup tree to maintain instead of two.
- **Icon-only controls in new M7a components use a 44px minimum** (address
  book's edit/delete/set-default buttons), not the 36–38px some pre-M7a
  icon buttons use (`Header`'s `.utilityIcon`/`.hamburger`,
  `MobileDrawer`'s `.closeButton`) — picked the safer default per the
  milestone's own live-QA tap-target check rather than retrofitting
  earlier screens. The wishlist grid's corner "remove" badge stays small
  (32px) since it's a corner-overlay affordance in the same visual slot as
  `ProductCard`'s existing 30px wishlist heart, not a primary action.
- **Order/booking status steppers are ported verbatim, not reinvented** —
  `lib/api/history.ts`'s `getOrderStatusSteps`/`getLaundryStatusSteps`
  reuse the exact label sets `OrderConfirmation`/`LaundryBookingConfirmation`
  (M3/M4) already shipped (Placed→Confirmed→Packed→Shipped→Delivered;
  Scheduled→Picked up→In progress→Out for delivery→Delivered), so a
  shopper sees the same wording at checkout, at the laundry booking
  screen, and later on `/account/orders/[id]`. `cancelled`/`returned`
  collapse to a short two-step line instead of stalling mid-pipeline.
- **Client-side fetch, not a server prop, for orders/order-detail** —
  `OrdersListClient`/`OrderDetailClient` call `getOrderHistory()`/
  `getOrderHistoryEntry()` in a `useEffect` rather than the page.tsx
  server component fetching once. Deliberate: `lib/api/orders.ts`'s
  `createOrder`/`lib/api/laundry.ts`'s `createBooking` run entirely in the
  browser's client bundle (no server boundary pre-M8), so only a
  client-side call — within the same tab, via client-side `next/link`
  navigation — can see an order/booking placed earlier in the session on
  top of the always-present seeded history from `lib/data/orders.ts`/
  `lib/data/laundry.ts`. A hard reload still resets the live-session part,
  same caveat every other mock mutation in this codebase already carries.
- **Address CRUD extends the existing mock-mutation pattern, not a new
  store** — `lib/api/addresses.ts`'s `createAddress`/`updateAddress`/
  `deleteAddress`/`setDefaultAddress` mutate the same shared `addresses`
  array `lib/api/site.ts#getAddresses` already reads (and Checkout's
  `initialAddresses` seeds from), rather than introducing a
  `localStorage`-persisted Context like Wishlist/Auth got. Checkout's own
  inline "add address" flow (M3) is untouched and still works exactly as
  before — the two aren't unified into one shared client store this
  milestone; see `CHANGELOG.md`'s M7a entry.
- **Mock auth defaults to signed-in** — `AuthContext`'s `isSignedIn`
  starts `true` on both the server render and the pre-hydration client
  render (no flash), matching the M7a brief's "account pages assume the
  demo user is signed in." Only an explicit `signOut()` (Profile page)
  flips it, persisted in `localStorage` until the next `signIn()`.
  `AccountShell` gates on this: once hydrated and signed out, it swaps
  its entire sidebar+content tree for a "you're signed out" prompt rather
  than rendering a broken account tree.

## M7b feature components (Shared screens)

M7b (Referrals+loyalty, Notifications, Support, Corporate, Sell) has no
reference prototype screen either — same as M7a, built entirely inside
the established system (`Card`, `Button`, `Chip`, `Textarea`,
`CapacityMeter`).

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `ReferralsClient` | `components/account/` | `Card`, `Button`, `CapacityMeter` | `/account/referrals` |
| `NotificationsClient` | `components/account/` | `Card`, `Chip` | `/account/notifications` |
| `SupportClient` | `components/support/` | `Card`, `Button`, `Chip`, `Textarea` | `/support` |
| `CorporateInquiryClient` | `components/corporate/` | `Card`, `Button`, `Chip`, `Textarea` | `/corporate` |
| `SellerApplicationClient` | `components/sell/` | `Card`, `Button`, `Chip`, `Textarea` | `/sell` |

Notes on how these compose the M1 primitives, and where M7b deviates:

- **`WalletContext` gained `earnReferralCredit`** (`lib/wallet/WalletContext.tsx`)
  — same shape as `earnCashback` but appends `category: "referral"`
  (matching `WalletTransactionCategory`) instead of `"cashback"`, and
  does not add to `lifetimeSaved` (a referral bonus isn't a shopping
  saving). `ReferralsClient`'s demo "Apply referral credit" button calls
  `applyReferralCredit()` (`lib/api/referrals.ts` — advances the oldest
  non-`rewarded` `Referral` to `rewarded`, session-scoped mock mutation)
  then `earnReferralCredit()` — the same two-step "mock mutation records
  the domain event, `WalletContext` owns the ledger write" split M6
  established between `createOrder`/`createBooking` and `pay`/`earnCashback`.
- **Loyalty tier ladder is `lifetimePoints`-threshold-driven**, not a
  hardcoded per-tier flag — `LOYALTY_TIERS` (`lib/data/referrals.ts`)
  holds one `{ tier, label, threshold, perk }` row per `LoyaltyTier`;
  `ReferralsClient` finds the current/next tier by comparing
  `loyaltyAccount.lifetimePoints` against each threshold and drives a
  `CapacityMeter` off the gap to the next one. Tier accent colors
  (bronze/platinum) have no dedicated tokens — one-off hardcoded hex with
  an inline comment in `ReferralsClient.module.css`, per the established
  "known token gap" convention; silver/gold reuse existing
  `--hk-muted-2`/`--hk-gold-text-sm`.
- **Notification preferences use the same "styled `<input
  type=checkbox>`" convention** `WalletClient`'s auto-top-up editor and
  `CheckoutClient`'s gift toggle already established, laid out as a
  category × channel grid (`NotificationsClient.module.css`'s
  `.prefsTable`) rather than inventing a dedicated `ui/` switch
  primitive for a single consumer. The grid is wider than 360px
  (`min-width: 400px` on `.prefsRow`) so it scrolls *inside* its own
  card (`overflow-x: auto`) at the narrowest supported width rather than
  ever widening the page itself — verified via live QA that
  `document.documentElement.scrollWidth` never exceeds `clientWidth` at
  360/768/1180.
- **Support's chat widget is entirely local, ephemeral React state** —
  no `lib/data`/`lib/api` persistence, since it's explicitly a mock
  ("no backend" per the brief) rather than a real ticketing/chat system.
  Canned replies come from a small keyword-matcher,
  `lib/support/autoReply.ts#getAutoReply` — the same "logic helper
  colocated under `lib/<domain>/`" pattern as `lib/cart/pricing.ts` and
  `lib/snacks/message.ts`, not a `ui/` primitive or mock-data file. The
  ticket form (a separate, real `SupportTicket`) is the one part of
  `/support` that does persist, via `createSupportTicket`
  (`lib/api/support.ts`), session-scoped like every other mock mutation
  in this codebase.
- **`/sell`'s form is real and submittable, not disabled markup** — the
  plan's "future-flagged, wired but disabled" line item is expressed as
  a prominent "Coming soon" banner plus copy framing the submit as
  joining a waitlist, and `createSellerApplication` seeds every
  `SellerApplication` with `status: "waitlisted"` rather than `"new"` —
  not as an actually-disabled `<button disabled>`. A real, disabled
  control would block exercising the mock submit → confirmation flow the
  M7b brief calls for; the "coming soon" framing carries the future-flag
  instead.
- **`SellerApplication` (`lib/types/shared.ts`) is the one new type M7b
  added** — modeled identically to the existing standalone
  `CorporateInquiry` (no user FK; an application may predate an account).
  Every other M7b entity (`Referral`, `LoyaltyAccount`, `Notification`,
  `NotificationPreference`, `SupportTicket`) was already fully modeled
  at M0.
- **Footer + account nav wiring:** `lib/data/site.ts#footerColumns`
  gained "Corporate gifting" / "Sell on Homekrafted" (Services column)
  and "Referrals & loyalty" (Account column) links; `ACCOUNT_NAV_ITEMS`
  (`components/account/AccountShell.tsx`) gained Referrals (`Gift` icon)
  and Notifications (`Bell` icon) between Wishlist and Profile — same
  array, no shell restructuring, exactly as M7a's brief left room for.

## M10 Seller portal components (M10a maker; M10b laundry partner + snack seller)

The seller portal (`/seller/*`) is its own chrome, not a reskin of the
consumer `Header`/`Footer` — `ConsumerChrome` hides those entirely on
`/seller/*` routes. No reference prototype screen exists for it either
(same situation as M7a/M7b) — built entirely on the established system
(`Card`, `Button`, `Chip`, `Textarea`, tokens). M10a shipped the shell +
maker dashboard but this doc section was never added at the time; it's
added now, covering the full current state (M10a + M10b) rather than
just this milestone's diff.

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `SellerShell` | `components/seller/` | `Button` | every `/seller/*` route except `/seller/login` |
| `SellerPageHeader`, `StatCard`, `PayoutRow`, `OrderStatusPill` | `components/seller/` | `Card` | shared across all 3 seller types |
| `SellerDashboardClient` / `SellerOrdersClient` / `SellerOrderDetailClient` | `components/seller/` | type router only (see below) | `/seller`, `/seller/orders`, `/seller/orders/[id]` |
| `MakerDashboardClient`, `ListingsClient`/`SellerListingEditorClient`/`ListingForm`/`ListingRow`, `MakerOrdersClient`/`MakerOrderDetailClient`/`OrderRow`, `SellerStorefrontClient`, `SellerPayoutsClient`, `SellerReviewsClient`/`SellerReviewCard` | `components/seller/` | `Card`, `Button`, `Chip`, `Textarea`, `ImageSlot` | maker (`type: "maker"`) modules |
| `PartnerDashboardClient`, `PartnerPickupsClient`/`PartnerPickupDetailClient`/`PickupRow`/`PickupStatusPill` | `components/seller/` | `Card`, `Button`, `StatusTimeline` | laundry partner (`type: "laundry"`) — `/seller`, `/seller/pickups`, `/seller/pickups/[id]` |
| `SnackDashboardClient`, `SellerMenuClient`/`SellerMenuEditorClient`/`SnackMenuForm`/`SnackMenuRow`, `SnackOrdersClient`/`SnackOrderDetailClient`/`SnackOrderRow`/`SnackOrderStatusPill` | `components/seller/` | `Card`, `Button`, `Chip`, `Textarea`, `ImageSlot`, `StatusTimeline` | snack seller (`type: "snack"`) — `/seller`, `/seller/menu(/…)`, `/seller/orders(/…)` |

Notes on how M10b composes the M10a shell, and where it deviates:

- **`SellerShell`'s nav is one flat array for everyone (M12).**
  `HOMEKRAFTER_NAV` in `SellerShell.tsx` lists all eight modules
  (Dashboard, Listings, Menu, Orders, Pickups, Storefront, Payouts,
  Reviews). This replaced `navForType(seller.type)` and its three arrays
  (`MAKER_NAV`/`LAUNDRY_NAV`/`SNACK_NAV`): there is one supply role now,
  so hiding modules by account type is exactly what was removed. A module
  the account isn't set up for renders `<ModuleUnavailable>` rather than
  disappearing from the nav.
- **`SellerDashboardClient` is a single component, not a type router.**
  It was a three-way switch over `seller.type` rendering
  `MakerDashboardClient`/`PartnerDashboardClient`/`SnackDashboardClient`;
  the server now returns one snapshot covering every revenue stream, so
  there is one dashboard and unused counters simply read zero.
  `SellerOrdersClient` still composes two siblings — a marketplace `Order`
  and a WhatsApp `SnackOrder` are genuinely different entities with
  different statuses, and flattening them would mean inventing a status
  vocabulary that fits neither — but it renders both rather than choosing
  by type. Sibling components (rather than one component branching
  mid-render) remain a hooks-correctness constraint: an early return
  before `useState`/`useEffect` would call a different number of hooks
  depending on the account, which `react-hooks/rules-of-hooks` forbids.
- **"Orders" means two unrelated entities depending on type** — for a
  maker it's the marketplace `Order`/`OrderStatus` pipeline (placed→
  confirmed→packed→shipped→delivered, `OrderStatusPill`); for a snack
  seller it's `SnackOrder`/`SnackOrderStatus`, a seller-portal-only mock
  entity for WhatsApp-origin orders (received→accepted→
  out-for-delivery→delivered, `SnackOrderStatusPill` — reuses
  `StatusTimeline`'s `tone="whatsapp"` green-dot styling, since that's
  the exact sequence the consumer `/snacks` page already shows under
  that tone). Laundry has no `/seller/orders` nav entry at all — its
  equivalent is "Pickups" (`LaundryBooking`/`LaundryBookingStatus`,
  `PickupStatusPill`). Same route path (`/seller/orders(/[id])`) resolves
  to different components purely via the type router above; laundry
  sellers who navigate there directly fall back to the maker view
  (harmless — `getSellerOrders` returns an empty list for a seller with
  no `vendorId`).
- **`PartnerPickupDetailClient`'s slot editor** (`/seller/pickups/[id]`)
  is the one genuinely new interaction pattern — two day `<select>` +
  two time-slot `<select>` pairs (pickup/delivery) sourced from the same
  `getLaundryDays`/`getLaundrySlots` the consumer booking flow uses,
  "Save slots" calling `updatePartnerBookingSlots`. Known cosmetic gap:
  since `laundryDays` is still M4's fixed 4-day window (19–22 Jul 2026)
  and this environment's "today" is 25–26 Jul, a booking dated outside
  that window shows a blank "Select day" until one is explicitly picked
  — the underlying state and the read-only summary panel are correct
  regardless; see `CHANGELOG.md`'s M10b entry for why `laundryDays`
  itself was left untouched.
- **`SnackMenuForm` is deliberately smaller than `ListingForm`** — a
  `Snack` has no weight tiers, occasions, or packaged/tags fields the
  way a maker `Product` does; it's flat name/description/price/category/
  diet/image/available. Category and diet are both `Chip`-toggle groups
  (single-select, styled identically to `ListingForm`'s multi-select
  chip groups) rather than `<select>` dropdowns, matching the visual
  weight of a 4-option and 2-option choice respectively.
- **Fixed a pre-existing `SellerShell` mobile clipping bug** — found via
  M10b's own 360px QA, not something M10b's components caused directly.
  `.body`'s base `align-items: flex-start` (correct for the desktop
  row layout) silently became a cross-axis *width* rule once `.body`
  switches to `flex-direction: column` below 780px, so `.content`
  shrink-to-fit its own children instead of filling the row — invisible
  under M10a's maker dashboard (its content never happened to exceed the
  available width) but real under M10b's wider stat-grid labels and
  longer pickup-row text, silently clipped by `body{overflow-x:hidden}`
  rather than showing a scrollbar. Fixed with `align-items: stretch`
  scoped to the existing `@media (max-width: 780px)` block only — see
  `CHANGELOG.md`'s M10b entry for the full diagnosis.

## M11a Admin panel components

The admin panel (`/admin/*`) is its own chrome too — `ConsumerChrome`'s
`/seller`-or-`/admin` pathname check already covered this path since M10
(scaffolded ahead of need), so no change there. No reference prototype
screen exists (same situation as M10/M7b) — built on the established
system (`Card`, `Button`, `Chip`, `SearchField`, tokens). `AdminShell`
deliberately mirrors `SellerShell`'s structure (pine-deep topbar, sticky
sidebar → sub-780px horizontal-scroll-strip collapse) rather than
reusing it as a shared component — see `CLAUDE.md`'s "Three role
surfaces" section and `docs/ARCHITECTURE.md`'s "Role surfaces" for why
the two shells stay independent.

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `AdminShell` | `components/admin/` | `Button` | every `/admin/*` route except `/admin/login` |
| `AdminPageHeader`, `StatCard` | `components/admin/` | `Card` | every admin screen (mirrors `SellerPageHeader`/`StatCard` 1:1, not imported from `components/seller/` — see below) |
| `StatusPill` | `components/admin/` | — | one generic status pill for every admin list/detail screen — see below |
| `AdminDashboardClient` | `components/admin/` | `Card`, `StatCard`, CSS-only bar chart | `/admin` |
| `UsersClient`/`UserRow`/`UserDetailClient` | `components/admin/` | `Card`, `Chip`, `SearchField`, `StatusPill` | `/admin/users`, `/admin/users/[id]` |
| `SellersClient`/`SellerRow`/`ApplicationRow` | `components/admin/` | `Card`, `Chip`, `StatusPill` | `/admin/sellers` (both tabs) |
| `OrdersClient`/`UnifiedOrderRow`/`OrderDetailClient` | `components/admin/` | `Card`, `Chip`, `SearchField`, `StatusPill` | `/admin/orders`, `/admin/orders/[type]/[id]` |

Notes:

- **`AdminShell`/`StatCard`/`AdminPageHeader` are deliberate near-
  duplicates of `SellerShell`/`StatCard`/`SellerPageHeader`**, not
  imports from `components/seller/`. Same reasoning as the shell split
  above: a shared `RoleShell`/`StatCard` would couple the two role
  surfaces' independent evolution (M11b's admin-only nav additions,
  future seller-portal changes) for a small amount of duplication in
  two ~20-line files. Every seller-portal status pill
  (`OrderStatusPill`/`PickupStatusPill`/`SnackOrderStatusPill`) is
  per-domain by contrast — left as-is, not folded into `StatusPill`,
  since refactoring working M10 code wasn't in scope.
- **`StatusPill` is one generic component, not five** — it takes a raw
  status string (`OrderStatus`\|`LaundryBookingStatus`\|
  `SnackOrderStatus`\|`SellerApplicationStatus`\|`SellerStatus`, or the
  ad hoc `"active"`/`"suspended"` user-suspension label) and looks its
  tone up from one shared map, auto-title-casing the label unless one is
  passed explicitly. This is the one place M11a intentionally diverges
  from M10's "one pill component per domain" pattern: the admin surface
  renders many different small status unions read-only across several
  screens, so one map pays for itself where a maker/laundry/snack
  seller's 2–3 domain-specific pills didn't need to. Same 6-tone visual
  language as every other pill in the app (`neutral`/`pine`/`gold`/
  `success`/`danger`/`solid`), same token vars, same `#f6e7e0` one-off
  terracotta-tint hardcode `OrderStatusPill`/`TransactionRow` already
  established (see root `CLAUDE.md`'s "Known token gaps").
- **Nav "Soon" slots** — `AdminShell`'s nav array renders M11b's
  Catalog/Wallet/Collections/Analytics entries now (per the M11a brief),
  styled `aria-disabled`, muted, with a small mono "Soon" tag, rather
  than waiting for M11b to add them. Communicates the panel's eventual
  shape without a dead link — clicking does nothing, no `href`.
- **Dashboard bar chart is plain CSS, no chart library** — `Orders by
  module` (`AdminDashboardClient`) is a `<span>` track + a width-
  percented fill `<span>` per module, matching `CapacityMeter`'s existing
  "meter via CSS, not SVG/canvas" approach elsewhere in the design
  system. The fill's `width` is the one inline `style` in the admin
  surface — a genuinely dynamic computed percentage, the same allowance
  `CLAUDE.md` carves out for `<ImageSlot>`'s `aspect-ratio`, not a static
  styling shortcut.
- **Orders oversight reuses the marketplace/laundry/snack status-pill
  color language** but doesn't reuse the components — `StatusPill`'s
  shared tone map (above) was tuned so `delivered`/`out-for-delivery`/
  `packed`/etc. land on the same tone a seller-portal pill would give
  them, so the two surfaces read as one system despite not sharing code.

## M11b Admin panel components (moderation, wallet/refunds, CMS, analytics)

Completes the admin surface — the 4 M11a "Soon" nav slots
(Catalog/Wallet/Collections/Analytics) are now live routes.  Built
entirely on M11a's foundation (`AdminShell`, `AdminPageHeader`,
`StatCard`, `StatusPill`) plus the established `components/ui/`
primitives — no new design-system primitives were needed.

| Component | Directory | Composes | Used by |
|---|---|---|---|
| `CatalogTabs`, `CollectionsTabs` | `components/admin/` | plain `Link` styled with `Chip`'s exact CSS recipe | `/admin/catalog(/reviews)`, `/admin/collections(/promo)` — 2-tab sub-nav for a real route pair, not client-state tabs like `SellersClient`'s |
| `CatalogClient`/`ProductModerationRow` | `components/admin/` | `Card`, `Chip`, `SearchField`, `StatusPill`, `ImageSlot` | `/admin/catalog` |
| `CatalogReviewsClient`/`AdminReviewRow` | `components/admin/` | `Card`, `Chip`, `StatusPill` | `/admin/catalog/reviews` |
| `AdminListingEditorClient` | `components/admin/` | **`components/seller/ListingForm.tsx`, reused verbatim** | `/admin/catalog/[id]` |
| `WalletOverviewClient` | `components/admin/` | `Card`, `StatCard` | `/admin/wallet` |
| `AdminUserWalletDetailClient` | `components/admin/` | `Card`, `StatCard`, **`components/ui/TransactionRow.tsx`, reused verbatim** | `/admin/wallet/[userId]` |
| `CollectionsClient` | `components/admin/` | `Card`, `Button` | `/admin/collections` |
| `CollectionEditorClient` | `components/admin/` | `Card`, `Button`, `Textarea` | `/admin/collections/[id]`, `/admin/collections/new` |
| `HomePromoEditorClient` | `components/admin/` | `Card`, `Button`, `Textarea` | `/admin/collections/promo` |
| `AnalyticsClient` | `components/admin/` | `Card`, `StatCard`, CSS bars + one inline SVG polyline | `/admin/analytics` |

Notes:

- **`ListingForm` and `TransactionRow` cross the role-surface boundary
  on purpose** — both are pure, props-driven presentational components
  with no seller-shell or consumer-chrome coupling (`ListingForm` takes
  `values`/`onChange`/`categories`/`occasions`; `TransactionRow` takes
  one `WalletTransaction`), so `AdminListingEditorClient` and
  `AdminUserWalletDetailClient` import them directly rather than forking
  near-identical copies. This is different from `AdminShell`/`SellerShell`
  staying independent (those are stateful shells whose *evolution* needs
  to diverge, not stateless forms/rows) — see `CLAUDE.md`'s "Three role
  surfaces" for that distinction.
- **`StatusPill`'s shared tone map gained 3 entries** for this milestone:
  `hidden`→danger, `flagged`→gold, `visible`→success (product moderation
  status and review visibility). Same one-map-not-five-pills approach
  M11a established.
- **No chart library, anywhere in `/admin/analytics`** — the GMV-over-
  time chart is one inline `<svg>` with a single `<polyline>` (points
  computed from the 14-day series, no library), and every other chart
  (orders by module, top sellers/products, new users by month, wallet
  flow by category) is the exact `<span class="track"><span class="fill"
  style="width:N%"></span></span>` recipe `AdminDashboardClient`'s M11a
  bar chart established.
- **Found and fixed a real rendering bug in that exact bar-chart
  recipe** while reusing it: `.barFill`/`.barFillGold` are nested
  `<span>`s inside a `.barTrack` `<span>` that is itself a flex item
  (auto-blockified by the flex spec, so its own `width`/`height` "just
  work" even as a `<span>`) — but the *inner* fill span was never itself
  a flex/grid item, so per the CSS spec its `width: N%` / `height: 100%`
  were silently ignored (percentages don't apply to non-replaced inline
  boxes), rendering at 0×0 — invisible. Fixed by adding `display: block`
  to `.barFill`/`.barFillGold` in **both** `AnalyticsClient.module.css`
  (new) and `AdminDashboardClient.module.css` (M11a, retroactively fixed
  here too since it's the exact same latent bug) — the Dashboard's
  "Orders by module" chart now actually renders visible bars for the
  first time.
- **Tap targets bumped to 44px** where M11b introduced new icon-only
  buttons below that: `ProductModerationRow`'s edit-icon link (ported
  from `ListingRow.module.css`'s 36px precedent, sized up here to meet
  this milestone's 44px minimum) and `CollectionEditorClient`'s
  move-up/move-down/remove buttons (30px originally, same fix).
- **Nav "Soon" slots are gone** — `AdminShell`'s `NAV` array no longer
  sets `disabled` on Catalog/Wallet/Collections/Analytics; all 8 items
  are live `Link`s now.

## Channel badges

`design-system.md` §6 defines three badge styles (pine "Book online now",
translucent-gold-on-dark "On the app · Coming soon", WhatsApp-green
"Order on WhatsApp"). The data behind them — which module gets which
label/variant — lives in `lib/channel.ts` (`CHANNEL_RULES[key].badge`),
not hardcoded per screen. The actual `<ChannelBadge>` component is an M1
primitive; when building it, source its label/variant from
`getChannelBadge(key)`.
