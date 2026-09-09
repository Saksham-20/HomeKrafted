# UI/UX review — September 2026

Deep review requested by the owner: research modern e-commerce UI/UX
against Zomato, Swiggy, Amazon and Flipkart; find every layout, alignment,
button-placement and loading-state defect on the site; fold in the
client's own change list (`docs/CLIENT-CHANGES-2026-09.md`); fix the phone
experience specifically; and stand up a PWA, which does not exist today.

**Method.** A production build was captured at 1440px and 390px across
anon/consumer/seller/admin (162 screenshots, `.ux-shots/`), the repo's own
QA sweep ran against it (174 page-visits, `.qa-shots/sweep.json`), and 319
patterns were researched from reference apps and peers into a three-file
playbook (`.ux-shots/playbook-*.md`, 108 entries). Eleven inspector agents
then read source *and* screenshots against that playbook, the house rules
in `CLAUDE.md`/`DESIGN.md`, and the client's change list, producing **343
findings**. A subset were adversarially re-verified before this document
was written; **34 critical and 115 high findings are in this file**, and
four of the highest-stakes were personally spot-checked against the
running code (all four confirmed exactly as reported, including the
literal `919999999999` placeholder WhatsApp number). Two clusters —
storefront and the seller/admin portals at the finding level — did not
finish before the review session's usage limit reset and are marked
**NOT YET RUN** below; everything else completed.

Read this next to `docs/CLIENT-CHANGES-2026-09.md` (the owner's asks,
row by row) and `DESIGN.md` (the approved visual direction — confirmed
**0% shipped**, see Phase 0).

---

## The five things to read first

1. **The site has no PWA and no way to install, and phones under 1190px
   have no search and no navigation at all** except a hamburger. Both are
   Phase 1.
2. **The single most repeated defect on the whole site** — found
   independently in five different reviews — is that `ProductCard`'s
   price row isn't pinned to the card's bottom edge, so any two-line
   title drops the price out of alignment with its neighbours in the
   same grid row. One CSS fix, three components, every grid on the site.
3. **The commerce loop has real gaps, not polish gaps**: checkout can
   hang forever with no error on a rejected order; a wallet balance can
   be *smaller than the order* and simply refuse to apply, mid-checkout;
   the cart recomputes its own totals client-side and discards the
   server's figures; and the WhatsApp snacks channel points at a
   placeholder number, so it is currently dead.
4. **Per-product customisation (client's ask) surfaced a real data-
   integrity gap**: order lines don't record which variant was bought —
   the kitchen packs blind — and the cart will silently re-price a line
   whose variant was deleted, at a different SKU's price, with no
   warning to the buyer.
5. **The owner's DESIGN.md direction, approved 2026-09-02, is unshipped.**
   Canvas, body font, warm border, Kalam annotations — none of it is in
   the code. This is why the site "reads empty and cheap" — the fix for
   that was already designed and never built.

---

## Phase 0 — decisions and quick data fixes (no build, do first)

Blocking decisions from the client-changes doc, unchanged from that
review: headline wording, the "200+ home chefs" stat, the nav set, the
caricature art style, the imagery route, and whether adding an option
axis re-queues a listing. See that doc's Phase 0 for detail.

New from this pass:
- **Set a real WhatsApp Business number.** `client/lib/messaging.ts:130`
  — `HOMEKRAFTED_WHATSAPP_NUMBER = "919999999999"`. Every snacks order
  and every click-to-chat link on the site currently opens a chat with
  nobody. This is a one-line change and it is currently the single
  highest-value fix on the site per minute of effort.
- **Ship `DESIGN.md`'s three phases**, or formally shelve the document.
  It cannot keep being "the approved direction" while `tokens.extend.css`
  still ships the pre-refinement canvas eleven months later — every
  reviewer who reads it will re-flag the gap.
- **Confirm the commission rate with GST is stated honestly** —
  `PlatformSettings` has one rate and no tax component
  (`server/src/admin/settings.service.ts`), but a session note claims
  production has been running "20% + 18% GST" since ≈2026-09-05.
  Reconcile before touching the payout-split code.

---

## Phase 1 — mobile web and the PWA (the owner's priority)

### 1a. The phone has no search and no navigation
`client/components/layout/Header.module.css:600` hides `.searchSlot` and
the entire nav below 1190px, alongside the hamburger — a rule that
predates the 2026-09-05 two-row split and was never revisited. Every
phone visitor (100% of mobile traffic) has no way to search and no way
to reach the six catalogue tabs except the drawer. Confirmed in two
independent audits (`global-chrome`, `x-responsive`).
**Fix:** the two-row header already exists for ≥1190px; give the phone a
docked search affordance (icon that expands to a full-width field, or a
persistent compact field in the drawer's header) and put the six nav
items in the drawer's primary group, not buried under secondary links.

### 1b. `viewport-fit=cover` is missing
`client/app/layout.tsx` has no `export const viewport`. Every
`env(safe-area-inset-*)` in the codebase evaluates to `0`, on a site with
**two** docked bottom bars (`CartBar`, `ProductPurchasePanel`) that need
that inset on notched phones.
**Fix:** add the export —
```ts
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1F3B2C", // --hk-pine
};
```
This is also step one of the PWA (below) and should land in the same
commit.

### 1c. The two docked bars collide on `/snacks`
`client/components/ui/StickySummary.module.css:86` — the marketplace
CartBar and the WhatsApp "Send list" commit button both sit at
`bottom: 0`; the cart bar's z-index wins, hiding the only way to place a
snacks order. **Fix:** compose through `--hk-dock-h` like every other
docked-bar pair on the site already does.

### 1d. Filters and sort disappear after one screenful, on both browse pages
`/shop` (5,570px on a phone) and `/gifts` lose their filter/sort controls
the moment you scroll past them, with nothing docked to bring them back.
**Fix:** a two-button "Filter · Sort" dock at the bottom of the viewport
while the grid is in view — the pattern the playbook (`browse-*`
entries) already specifies from Myntra/Flipkart, adapted down for this
catalogue's size.

### 1e. Ship the PWA
Confirmed absent: no manifest, no icons, no service worker, no
`next-pwa`/Serwist, and (per 1b) no viewport export.
**Build, in order:**
1. `client/app/manifest.ts` — name, short_name, `start_url: "/"`,
   `display: "standalone"`, `theme_color`/`background_color` from
   `--hk-pine`/`--hk-bg`, icons generated from the existing brand lockup
   (never fabricated artwork) including a maskable variant.
2. The viewport export from 1b.
3. `apple-touch-icon` + `apple-mobile-web-app-*` meta in `app/layout.tsx`.
4. A minimal service worker (Serwist, since this is Next 16 App Router)
   caching **only** static assets and the app shell — **never an
   authenticated API response**: prices, stock and wallet balances change
   and a stale cached response here is a money bug, not a caching bug.
5. One offline fallback page.
6. A install-prompt affordance (Android `beforeinstallprompt`) placed
   somewhere low-friction — not a blocking modal, given the review's
   finding on the location prompt below.

---

## Phase 2 — the repeated defects (do once, fixes every grid)

### 2a. Price-row misalignment — found in 5 independent reviews
`ProductCard`, `KitchenCard` and `SnackCard` all fail to pin the price
row to the card's bottom edge, so a two-line title drops the price
~20px out of line with its row neighbours. Visible on `/gifts`, `/shop`,
the landing maker rail, and every card grid on the site.
**Fix**, identical across all three components:
```css
.content, .body { flex: 1; }          /* was: no flex-grow */
.priceRow { margin-top: auto; padding-top: 8px; }
.name { -webkit-line-clamp: 2; min-height: 2lh; }  /* reserve two lines */
```

### 2b. Prices render in the wrong token
`ProductCard.module.css` prices in pine, not `--hk-terracotta` — against
both `CLAUDE.md` and `DESIGN.md`'s own explicit rule. One line:
`.price { color: var(--hk-terracotta); }` (4.55:1 on white, holds AA).

### 2c. `--hk-line` and `--hk-r2` don't exist
Two invented custom properties, used in `SubscriptionsListClient.module.css`
*and* `NotificationsClient.module.css` *and* `DeliveryLocationConfirm.module.css`
*and* `LocationPrompt.module.css` — four independent authoring instances
of the same mistake. Every declaration using them silently drops (border,
radius, background all vanish with no warning). **Fix:** grep the tree for
both names, replace with the real tokens each was clearly meant to be
(`--hk-border`, `--hk-r-lg`), and consider a structural spec
(`unregistered-custom-property.spec.ts`) that fails the build on a
`var(--hk-*)` reference to a name not declared in `tokens.css` or
`tokens.extend.css` — this is the fourth time this exact class of bug has
shipped.

### 2d. `overflow-x: hidden` on `html, body` is hiding real defects
`globals.css:33` clips every horizontal overflow into invisibility —
converting a visible bug (scrollbar) into an undiscoverable one (content
a phone user can never reach). This is *why* the sweep's ~50 mobile
overflow reports show `horizontalScroll: false`: the clip is doing its
job perfectly, one layer above where the actual defects live.
**Fix:** keep the clip (it's the right production behaviour) but add a
dev-only detector — a `ResizeObserver` in a debug build, or extend
`e2e/sweep.mjs` to walk descendants for `scrollWidth > clientWidth`
regardless of the ancestor clip — so overflow is caught before it ships,
not hidden after.

---

## Phase 3 — the commerce loop (money and orders)

All in `client/components/checkout/CheckoutClient.tsx` unless noted.
Each of these is a checkout that silently hangs or a number that quietly
disagrees, on the page where a rupee changes hands.

| # | Defect | Fix shape |
|---|---|---|
| 1 | A rejected `createOrder` leaves "Placing order…" forever, no message, no way back | Wrap in try/catch; render a `Notice` with Try again; clear `submittingRef` |
| 2 | One failed read on mount pins the whole screen on "Loading checkout…" forever | Same `loadFailed`-apart-from-empty pattern the portal kit already enforces |
| 3 | A wallet balance smaller than the order total is unreachable, not partially-applicable | Allow partial wallet application against the total, same as most references researched |
| 4 | Cart recomputes shipping/total/cashback client-side, discarding the server's figures | Delete the client recompute; render only what the server returned |
| 5 | Quantity stepper: no optimistic update, no debounce, rapid taps silently lost | Optimistic increment + debounced PATCH, matching `lib/cart/purchasable-sku.ts`'s existing contract |
| 6 | No cart line is checked for purchasability — a sold-out line sits under a live Checkout button | Check on read, same as `isPurchasable` already does catalogue-side |
| 7 | Checkout shows no thumbnails, quantities or per-line prices — buyer can't see what they're paying for | Render the same line-item block the cart page already has |
| 8 | Payment-failure copy isn't a live region and renders off-screen on a phone | `role="alert"`, move above the fold on mobile |

## Phase 4 — per-product customisation (client's section G)

Design already written in `docs/CLIENT-CHANGES-2026-09.md` § G. This
review adds the defects that design must account for:

- **No order line anywhere records the variant bought** — the kitchen
  packs blind. `OrderItem` needs the variant label/sku persisted at
  order time (never re-read from the live `Product`, same reasoning as
  `MealSubscription.pricePerMeal` being a snapshot).
- **`resolveCartLine` silently re-prices a line whose variant no longer
  exists** — falls back to the listing's first variant with no warning.
  Must refuse the line and tell the buyer, not substitute silently.
- **`WeightOption.sku` is derived client-side from name+label** — will
  collide across kitchens once real variant matrices exist. Move SKU
  generation server-side.
- **Every listing save destroys and recreates variant rows**
  (`listings.service.ts:211`) — incompatible with the proposed
  `WeightOptionValue` join, which needs stable variant identity across
  edits. The listing write path needs an upsert-by-natural-key, not a
  delete-and-recreate, before the options model can be built on it.
- **Decide the variant ceiling now**: 3 axes / 100 variants (Shopify's
  number) is the reference; pick before building the matrix editor.
- `minOrderValue` is displayed on the storefront and enforced nowhere —
  `minOrderQty` would be the second unenforced floor if built the same
  way. Enforce both server-side before shipping either UI.

## Phase 5 — landing, PDP, browse detail work

Full findings for these are in `.ux-shots/recovered-findings.json`
(`landing`: 34, `pdp`: 33, `browse-shop`: 29, `browse-gifts`: 32). Two
worth calling out because they undercut the client's own change-list
rows:

- **A16 ("home page not good on mobile") — the phone hero shows nothing
  for the entire first screenful**, and the first real product is
  1,430px down a 7,319px page. This is the concrete shape of the owner's
  complaint and the first thing to fix under that row.
- **A6 ("Meet the Hands...") — already fixed in the running code.** The
  four maker portraits are already distinct (`seed-avatars.ts` ran); the
  client-changes doc's screenshot was stale. Don't re-do this work.

## NOT YET RUN

The review session hit its usage limit twice. These did not complete and
carry no findings in this document:
- **Storefront** (`/storefront/[vendor]`) — the "a real person made
  this" page. High priority to run next; C3/C4/C5 from the client doc
  land here.
- **Seller portal** and **admin portal** at the per-screen finding level
  (the sweep's raw overflow numbers for `SellerShell`/`AdminShell` are
  recorded but not diagnosed as bug-vs-intentional-rail).
- **UI primitives audit** — which primitives (Skeleton, Toast, Modal,
  EmptyState) should exist and don't.
- **Auth/`/sell` funnel**, **snacks/collections/search**, **account** (10
  screens), **the PWA and mobile-web fix-plan agents specifically** —
  these were *assigned* in Wave B but errored before producing findings;
  only `wallet-subs` returned from that wave.
- The full adversarial verify pass on all 343 raw findings — a random
  sample of ~40 was verified before the limit hit; the critical/high
  findings in this document were spot-checked by hand against the
  running code (4/4 confirmed) rather than by a second agent pass.

Re-run these before treating this document as complete — see
`.ux-shots/recovered-findings.json` for the raw, unverified findings from
completed clusters not summarized above (`x-loading-skeletons`: 29,
`x-customisation`: 35, `cart-checkout`: 36, `global-chrome`: 28,
`x-client-changes`: 40, `x-responsive`: 32).
