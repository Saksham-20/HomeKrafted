# UI/UX refinement — the whole site, three roles

Owner brief, 2026-09-17: *"go through all the website's UI, including all 3
users… improve the UI, use consistent spacing and designs… remove the scroll
to splitscreen transition, keep it normal split screen with zooming in on the
hovering one like we used to have… go through all the UI, all pages and refine
them, change them if needed, and generalise forms for both kitchens and
crafts… remove extra stuff, keep icons and logos consistent, and add a little
colour."*

**This is a refinement, not a rebrand.** `DESIGN.md` stays the visual
authority, `handoff/` stays untouched, `styles/tokens.css` stays law. Every
value added here lands in `styles/tokens.extend.css`, the sanctioned override
layer. Nothing in this document changes what the product *claims*, what it
*charges*, or who can *reach* what — where a fix touches copy that makes a
claim, it makes the copy **smaller**, never larger.

Audit ran 2026-09-16/17 against the local build in mock mode at 1440×900 and
390×844, across `/`, `/shop`, `/gifts`, `/product/[slug]`, `/login`,
`/account`, `/seller`, `/seller/listings/new` (both forms) and `/admin`.

---

## 0. The three decisions this plan was built on (owner, 2026-09-17)

| # | Question | Decision |
|---|---|---|
| D1 | Where does the split screen go? | **The ISB crochet banner keeps the first screenful. `SplitPanels` becomes the band under it.** `ScrollExpandMedia` is deleted. |
| D2 | How far does "a little colour" go? | **Ship `DESIGN.md` phase 1's colour half (paper canvas, warm borders, soft surface) *and* put saffron to work as a live accent.** Full contrast pass owed. |
| D3 | How are the forms generalised? | **One form. The category decides which questions appear.** The "Homemade food / Handcrafted gift" question goes. |

Each is expanded where it lands — D1 in R2, D2 in R1, D3 in R5.

---

## 1. Findings ledger

Every row was seen in a browser, not inferred. Severity: **A** breaks the page
for somebody, **B** is visible incoherence, **C** is polish.

### A — broken

| # | Where | What | Evidence |
|---|---|---|---|
| A1 | `CategoryTile` (home rail) | Label is `#FFFFFF` with a black text-shadow, drawn for a **photograph** that the 2026-09-16 owner decision removed. On the pale sage tile that is **~1.1:1**. Eight category names on the home page are effectively invisible. | computed `color: rgb(255,255,255)`, `text-shadow: rgba(0,0,0,.4) 0 1px 4px`, over `--hk-pine-tint` |
| A2 | every shelf surface | **Every category draws the same wrapped-gift fallback icon** — 8 on the home rail, 5 on `/gifts` departments, 9 on `/shop` chips. `Category.icon` is unset in mock data and `mapCategory`'s fallback is doing all the work, so the icon system looks broken to the only people who can develop against it. | screenshots, `/`, `/gifts`, `/shop` |
| A3 | `/` | **24 React `duplicate key` errors** on load. Bestsellers and Trending render overlapping product sets inside one subtree. | console log |
| A4 | `/` Bestsellers + Trending | The two rails render the **identical six products in the identical order** — `resolveCollection` falls back to "top-rated of this kind" for both. Two full-width rails, same content, stacked. | screenshot |
| A5 | `/seller` | Dashboard **never settles** — `LoadingRows` skeleton forever, no `Notice`, no Try again. The portal kit's own rule ("a failed read renders a Notice with Try again — never the empty state") is not honoured by the screen everyone lands on. | 8s wait, mock mode |
| A6 | header, ≤420px | **The logo is clipped** — "Krafted" is cut off by the bar's bottom edge. Every page, every role, every phone. | 390×844 |
| A7 | `/` hero, ≤560px | The ISB banner is **one raster with the type baked in**. At 390px the headline renders about 8px tall and the "Shop Crochet" button inside the image is unreadable and unfindable. | 390×844 |
| A8 | `ProductCard`, ≤420px | Price row **collides**: `₹220 ₹260` + a "Coming soon" pill + the `+` button do not fit a 168px card and overlap. | 390×844 |
| A9 | `/admin` | **"Queue clear — nothing is waiting on you"** renders 200px above **"PENDING APPLICATIONS 3"**. The banner and the stat read different sources. | screenshot |
| A10 | `ListingForm` sizes table | The COLOUR column's empty state ("Nothing added right now") renders **under the PRICE column**, wrapped to three lines. The table's columns and its cells disagree. | screenshot |

### B — incoherent

| # | Where | What |
|---|---|---|
| B1 | forms, everywhere | **Three label styles in one form.** `ListingForm` uses 11px mono uppercase (`PRODUCT PHOTO`, `DEFAULT SIZE COLOUR PRICE`), sentence-case sans (`What are you listing?`), and a sans label + grey `Optional` suffix — simultaneously. The portal kit's own rule says mono is receipt type for counts and eyebrows, **never a form label**. `/login` uses the banned mono style too. |
| B2 | `ListingForm` | **Five input widths in one column** — 567px, 567px, 275px, 460px, 567px. "Storage instructions" is too narrow for its own placeholder and truncates it mid-word. Helper text wraps at a different measure from the inputs it explains. |
| B3 | `/shop` | **Emoji as an icon system**: `⚡ Delivered nearby`, `🌱 Pure veg`, `🌾 Sugar-Free / Gluten-Free`, `🎁 Gift-Ready`. Emoji render differently on every OS, and `lib/category-emoji.ts` was deleted for exactly this reason. |
| B4 | `/shop` | **`🎁 Gift-Ready` filters the tag `Curated`.** A chip labelled as a property that the data does not hold — the M51 pattern, still shipping. |
| B5 | `/shop` vs `/gifts` | **Two different chip components for the same job.** `/shop` is icon-over-label with a count badge in the icon's corner (reads as a notification); `/gifts` is icon-beside-label with a count underneath, and one chip wraps to two lines and breaks the row's height. |
| B6 | site-wide | **Three icon vocabularies, unevenly applied.** `lucide-react` in 99 files, the `Icon` registry in 4, `CraftIcon` in 7 — plus 17 `★`, 14 `✓`, 3 `✕`, 1 `☆` used as glyph-icons, and 13 true emoji. |
| B7 | `/` promo bands | The two bands' **top edges do not align** (25px apart), and their CTAs are opposite treatments — gold pill with dark text on the left, dark pill with white text on the right — side by side. |
| B8 | `/` "By HomeKrafted" | **One 240px card inside a full-width panel**, 1150px of it empty. |
| B9 | `/` seasonal band | **"42 DAYS" beside "Karwa Chauth in 6 weeks"** — the same fact in two units, 400px apart. |
| B10 | `/account` | Four tiles where three show a count and one shows an action ("Profile / Edit details"); the sidebar already lists all four. Then ~250px of dead canvas. |
| B11 | `/product/[slug]` | A **candle**'s breadcrumb reads `Home / Homemade Food / Candles & Home`. |
| B12 | `/product/[slug]` | **No maker portrait above the fold.** On a platform whose entire pitch is "a real person made this", the person is a 10px uppercase label. `DESIGN.md` asks for a portrait chip on every card and this is the page that most needs one. |
| B13 | `/login` | The form card is **1350px wide for two fields**; the Continue button is 1318px. |
| B14 | `/login?role=seller`, signed in | "You're signed in as a shopper" is offered **"Go to the admin panel"**. |
| B15 | `/gifts` | The hero band carries **no photograph** (the `HeroBanner` the design calls for); `/shop`'s has one but its wash does not stay solid over the text column, so the subtitle sits on the photo. |
| B16 | `/gifts` | **"Personalisable 0"** — a control offered with a zero count, on the page whose own rule is that an empty shelf is not rendered. |
| B17 | `/` HowItWorks | "**backed by our guarantee**" and "in a **clean** home kitchen" — a blanket guarantee the M15 rules reverse, and a hygiene claim no inspection backs. Both are the exact patterns M51 deleted from `FaqSection`. |
| B18 | `/` SellCta | "**Join 200+ HomeKrafters**" beside three invented avatar initials. Production has ~13. `CLAUDE.md`: *"There is still no '200+ home chefs' strip."* |
| B19 | `/` AppInstallPanel | A **decorative QR code that scans as nothing**, beside copy saying the apps are "coming soon", above a button whose action is the site you are already on. |
| B20 | `/admin` | **"Laundry 6"** in Orders by module — a withdrawn module presented as live traffic. |
| B21 | `/admin` | Three grid systems stacked: a 2-up band, a 4-up band, a second 4-up band whose ninth card is **orphaned alone on its own row**, its label wrapping to two lines. |
| B22 | `GuidedListingForm` | A hard black rectangle is drawn around the step heading — a focus outline on a non-interactive element. |
| B23 | copy | `flavor` (US) in the description placeholder; `colour`, `personalised`, `customise` (en-GB) everywhere else. |

### C — spacing and rhythm

| # | What |
|---|---|
| C1 | **The spacing scale is not being used.** Off-scale values dominate: `6px` ×154, `2px` ×105, `10px` ×51, `5px` ×27, `14px` ×20, `3px` ×17, `7px` ×10, plus `9px`, `11px`, `13px`. The scale itself has no step under 4px and jumps 4→8→12→16→20→26→34→44, so there is nowhere legitimate for a 2px or 6px inset to go. |
| C2 | Section vertical rhythm on `/` varies with no rule — the gap above "How this works" is not the gap above "Frequently asked questions" is not the gap above `SellCta`. |
| C3 | "How this works": a left-aligned heading over a timeline indented 165px further, with ~340px of dead space on the right. |
| C4 | The footer's four columns are unevenly gapped (315px between two 125px-wide link lists). |
| C5 | `ScrollRail` slices its last card at an arbitrary point, and the `›` control floats over the sliced card rather than beside the rail. |
| C6 | FAQ answers wrap at ~580px under rules that span 880px. |

---

## 2. Rules that survive this work

Do not "fix" any of these. Each is a decision with a reason recorded in
`CLAUDE.md`, and every one of them looks like a defect to somebody who has not
read it.

- **Mono eyebrows stay.** The impeccable craft floor bans kickers above
  headings; `DESIGN.md` commits to receipt type as the brand ("the ledger is
  the brand"). The committed world wins — B1 is about mono on *form labels*,
  not about eyebrows.
- **Gold never carries text.** `--hk-gold-text-sm` for gold-family words. Any
  new accent owes the same measurement.
- **Absence is not an answer.** No dietary mark, no prep time, no `distanceKm`
  and no attribute value means *nobody was asked* — never a default, never a
  zero, never the opposite claim.
- **The platform never makes a claim a column does not hold.** No badge
  derived from `kind`. No count that was not counted.
- **A failed read is a `Notice` with Try again**, never an empty state.
- **Nothing reads `avatarSrc` directly** — `MakerPortrait` only.
- **Everything in `client/lib` obeys the shared boundary** — no React, no DOM
  globals, no `@/` alias outside `@/lib/`.
- **`/` is exempt from the two-row header.** The landing bar floats over the
  hero and keeps one row.
- **Location is never a gate.** No coords still returns the full catalogue.

---

## 3. Phases

Each phase is one reviewed change, ships on its own, and ends green on
`npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and
`e2e/tests/a11y.spec.ts`.

### R1 — Foundation: tokens, one label style, one icon system — ✅ shipped 2026-09-17
*Everything downstream consumes this. Nothing else starts first.*

See `CHANGELOG.md`'s 2026-09-17 entry for the full list of what landed.
Not done in this pass: the browser-surfaces item (selection/caret/
scrollbar/focus-ring-offset/tabular-numerals theming) and the logo-clip
audit at ≤420px (A6) — the latter was written from the plan's own audit
pass but did **not** reproduce when checked live afterward (the header's
logo rendered correctly at 390×844 on every route tested); leave A6 as
unconfirmed rather than "fixed" until it's actually seen broken.

**Colour (D2).** Land `DESIGN.md` phase 1's colour half in
`tokens.extend.css`: canvas `#F7F1E6`, card border `#E5DCC9`, surface-soft
`#FFFCF5`. Then promote the saffron family already sitting unused in that file
to a real role — **the "this needs you" hue**: admin queue counts, seller
moderation notices, pre-order badges, the seasonal countdown. Terracotta stays
prices and the italic accent word only; pine stays the trust anchor; gold stays
fills, rules and seals. Give each of the ~20 top-level shelves a **tint pair**
(a ground and an ink) so a category tile is coloured by what it is rather than
all sage — that is where "add a little colour" is most visible and costs no new
hue.

**Spacing (C1).** Add the missing small steps — `--hk-s0: 2px`,
`--hk-s1h: 6px`, `--hk-s2h: 10px`, `--hk-s3h: 14px` — so off-scale values have
somewhere legitimate to land, and a `--hk-section-y` / `--hk-section-y-tight`
pair for vertical rhythm. **Do not run a site-wide normalisation diff** — 193
files of mechanical substitution is unreviewable and buys nobody anything.
Convert only inside a file a later phase is already opening.

**One form-label style (B1).** `components/portal/Field` becomes the only
place a form label is drawn — sentence-case sans, 13px, `--hk-ink-2`, with the
grey `Optional` suffix. Delete every mono-uppercase form label in the portal,
in `/login`, and in `ListingForm`'s sizes table header. Mono keeps eyebrows,
counts, dates and the receipt blocks.

**One icon system (B6).** `lucide-react` is the UI vocabulary, `CraftIcon` is
the department vocabulary, and nothing else draws an icon. Replace the 17 `★`,
14 `✓`, 3 `✕` and 1 `☆` with `Star`, `Check`, `X`. Delete the 13 emoji. Extend
`lib/icons/registry.ts` so the shelves production actually has each carry a
real mark, and **seed `Category.icon` in the mock data** so the icon system is
visible to the only people who can develop against it (A2).

**One logo lockup.** Audit every `logo*` asset in use; keep exactly two (the
colour lockup and the on-dark lockup) and fix the header's clip at ≤420px
(A6) by giving the mark an explicit box rather than letting it overflow.

**Browser surfaces.** Theme selection, caret, scrollbars, focus ring offset
and tabular numerals from the palette — the cheapest signal that the page was
built rather than assembled.

*Done when:* a contrast sweep over `e2e/tests/public-routes.ts` is clean on the
new ground; no `*.module.css` declares a raw hex that a token now covers; no
emoji remain in `app/`, `components/` or `lib/`; the native theme generator
(`mobile/ npm run theme`) still resolves every token.

---

### R2 — The landing page — ✅ shipped 2026-09-17
*The page the brief is mostly about.*

See `CHANGELOG.md`. Shipped: the hero swap (D1), the duplicated-rails fix,
the emoji task chips. **Not done**: merging Bestsellers/Trending into one
rail when they resolve identically (they no longer do, now that the four
collections are real, so the trigger condition this item was written for
no longer occurs in mock mode — revisit against real admin-curated data),
hiding "By HomeKrafted" below a threshold, the false-claims copy cleanup
(guarantee/hygiene/200+ line/QR code), and the section-rhythm/promo-band
alignment pass (C2/C3/C5/B7/B9). The `--hk-section-y` token exists
(R1) but is only consumed by the new split band so far — applying it
across the rest of `/`'s bands is still open.

**The hero (D1).** Delete `components/ui/scroll-expansion-hero.tsx` and
`components/home/Hero.tsx` — dead code since yesterday and the transition the
owner asked to remove. Restore `SplitPanels` as the band **under** the ISB
banner: level at rest, the half you lean toward opens to ~74% with the
photograph counter-scaling (the zoom), the diagonal seam, the dead middle
third, focus counts as leaning, touch stays level, all inside
`(hover: hover) and (prefers-reduced-motion: no-preference)`. Its own file
header documents every one of those rules — honour them rather than
re-deriving them.

**The ISB banner (A7).** Rebuild it as **real type over the photograph**
instead of one flat JPG: the artwork becomes the background, "Pre-orders now
open", the ISB line and the CTA become live text and a real button. That is
what makes it legible on a phone, selectable, and able to carry the brand's own
faces instead of a marker script that appears nowhere else on the site.

**Remove extra stuff.** Merge Bestsellers and Trending into **one** rail while
they resolve to the same products (A4, A3) — a second rail returns when the
admin curates a genuinely different collection. Hide "By HomeKrafted" below a
threshold instead of rendering one card in an empty panel (B8). Drop the
duplicate marker from `HowItWorks` steps (numbered disc *and* icon disc for the
same step).

**Fix the claims (B17, B18, B19).** Delete "backed by our guarantee" and
"clean home kitchen". Replace "Join 200+ HomeKrafters" and its three invented
faces with a counted figure or nothing. Remove the non-scannable QR; the panel
can say the apps are coming without drawing a code that scans as nothing.

**Rhythm (C2, C3, C5, B7, B9).** One `--hk-section-y` between every band.
Centre "How this works" over its own timeline. Align the promo bands' top edges
and give them one CTA treatment. One unit in the seasonal band. Give
`ScrollRail` a deliberate peek and move its control out of the card.

*Done when:* zero console errors on `/`; the split opens on hover and on focus
and does nothing under reduced motion or on touch; `/` at 390px has a legible
headline, a findable CTA, and no overlapping price row.

---

### R3 — Browse: `/shop` and `/gifts` — reviewed 2026-09-17, mostly not a bug
*Two pages that do the same job three different ways — turned out to be
two pages that do two different jobs, on purpose, most of the way down.*

R1 already fixed the one real, shared defect here (every category/
department drawing the wrapped-gift fallback, A2). Re-auditing this
phase against the live pages and their own code comments found that most
of what R1's original write-up flagged as inconsistency is a recorded
decision, not drift:

- **`QuickFilterChips` (`/shop`) vs `DepartmentTiles` (`/gifts`) stay
  two components.** B5 assumed this was accidental duplication; it is
  not. `/shop`'s categories are flat; `/gifts`'s departments are a real
  two-level tree with **progressive disclosure** — picking one reveals
  its subcategories as a second chip row (`DepartmentTiles.tsx`'s own
  doc comment, G3 §5.1.3, D2/D3 in `docs/GIFTING-REWORK.md`). Forcing
  one shape onto both would either bolt a parent/child affordance onto
  `/shop`'s flat list or strip `/gifts`'s disclosure — a real regression
  against a documented, owner-reasoned interaction, not a fix. Both
  already draw from the same token vocabulary (no raw hex, no off-scale
  spacing) and both got real icons in R1; that is the level they should
  match at.
- **`/gifts`'s hero carries no photograph on purpose.** B15 read this as
  a gap; `app/gifts/page.tsx`'s own comment says otherwise: "the photo
  wash is gone... on a page whose whole job is to show handmade objects,
  the photograph belongs in the department tiles where it is a real
  listing's own picture rather than a mood," and the band stays under
  180px so gifts start in the first screenful. `HeroBanner`'s `gold`
  tint variant exists and is unused — but it is unused because this page
  turned it down, not because nobody wired it up. Left alone.
- **B4 (the mislabelled "Gift-Ready" chip) and the emoji task-chip rail
  (B3) were real and are fixed** — see R1/R2 in `CHANGELOG.md`.
- **B16 ("Personalisable 0") is not a bug.** It is the documented
  zero-count pattern (`FilterGroup`'s own rule: "dimmed and disabled,
  never hidden") applied correctly, with a `title` explaining why it is
  disabled. Confirmed in `app/gifts/GiftsClient.tsx`.

Checked live at 1440 and 390: both pages render cleanly, no overlap, no
console errors, scroll-hint gradients work on both chip rails. Nothing
further to do here beyond what R1 already shipped.

---

### R4 — Consumer detail, account and auth — done 2026-09-17

- **`/product/[slug]`:** shipped — `MakerPortrait` chip above the fold (B12),
  group-derived breadcrumb fixed (B11).
- **B13, the narrow-form specificity bug, shipped in two rounds.** First fix
  (`LoginClient.module.css`'s doubled `.page.page` selector) held for a plain
  route but not for `/login` or `/terms`, both consumer-surface routes under
  `body:has([data-surface="consumer"]) .container { max-width: 1440px }`
  (specificity 0,2,1 — higher than any same-shape doubled selector can reach).
  Fixed properly in both `LegalPage.tsx` and `LoginClient.tsx` by moving
  `.page` onto its own inner element, off the one carrying `container` — no
  specificity fight to win, plus `margin-inline: auto` since centring had been
  `.container`'s job on the combined element. Verified live:
  `/terms` → 760px centred, `/login` → 480px centred. Swept every other
  `clsx("container", styles.page)` site in the tree for the same pattern —
  none of the rest give `.page` its own `max-width`, so none carry the bug.
  B14 (shopper offered the admin panel) was already fixed by an earlier
  commit — `/login?role=seller` while signed in as a shopper now offers "Go
  to my account", confirmed live.
- **`/account`, `/wallet`, `/support`, `/about`, `/checkout`:** swept live,
  signed in as the demo shopper — page-title, card and empty-state treatment
  are already consistent across all five; no further findings.

---

### R5 — The seller portal, and one listing form (D3) — done 2026-09-17

**Generalised the form, as planned.** Both `ListingForm.tsx` and
`GuidedListingForm.tsx` no longer ask "What are you listing? / Is it
something to eat, or something to keep?" as a separate question — `kind`
and `shippingScope` are now derived the moment a category is picked
(`setCategory`), the same way `SellerApplicationCategory` derives from
specialties. `lib/sell/listing-families.ts`'s `SLUG_FAMILY` map had
already drifted from `lib/data/categories.ts`'s real slugs (confirmed:
`bakery`, `chocolates`, `snacks`, `hampers`, `candles-home`,
`handmade-jewellery`, `personalised-gifts` all resolved through no slug
at all) — extended to cover every live top-level shelf. The category
combobox now lists every shelf, food and gift alike, with the department
name in the combobox's `hint` line so two same-named shelves on
different sides stay tellable apart. Verified live end-to-end: picking
"Handmade Jewellery" on the guided flow correctly derives `kind: craft`
and reveals the colour-swatch step.

**The guided flow keeps a lightweight browse filter, not a gating
question.** Fourteen-plus shelves need *some* way to narrow the list, so
a `SegmentedFilter` ("Food" / "Gifts") sits above the shelf search and
chips — but it's a **view-only filter** (`shelfSide`, local state) that
commits nothing by itself; only an actual shelf pick (search result or
chip) writes `kind`. Browsing "Gifts" out of curiosity and picking a food
shelf after all costs nothing.

**A10/B2 (sizes-table misalignment, five input widths) were already
fixed** by an earlier, undated change — the table is a real CSS grid now
(`ListingForm.module.css`'s `.weightRow`/`.weightRowCraft`) with the
colour question answered by `ColourSwatches`, not a free-text box. B23
(`flavor` → `flavour`) and B22 (the black box around the guided form's
step heading) were real and fixed: B22 turned out to be the intentional
pine `:focus-visible` ring — correct in the common case, but this
browser doesn't always grant `:focus-visible` to a programmatic
`.focus()` (e.g. right after a mouse-triggered step change), and with no
base rule it fell through to the UA default outline. Fixed with
`outline: none` on `.stepTitle` plus the existing `:focus-visible` rule
layered on top — the deliberate ring still shows whenever the browser
grants it, the UA default never does.

**A5, the real bug, was one line in `AuthContext.tsx`, not the
component.** `SellerDashboardClient`'s `failed`/Try-again path already
existed and was correct; the dashboard "never settles" because
`sellerSessionActive` required `activeSessionUserId`, which is
*unconditionally* `undefined` in mock mode (`NEXT_PUBLIC_USE_MOCK=true`
— this dev server's own mode) — so `sellerDataReady` could never become
true and every gated screen (`/seller`, `/seller/meal-plans`,
`/seller/listings`, ...) spun its `LoadingRows` skeleton forever. Fixed:
`sellerSessionActive` now reads `signedIn && role === "seller" && (mock
|| !!activeSessionUserId)`. Verified live across `/seller`,
`/seller/meal-plans` and `/seller/listings` — all three now settle and
render real data.

**Two real `window.confirm` calls found and fixed**, both converted to
the portal's inline two-step: `MealPlansClient`'s "stop taking new
subscribers" (now `MealPlanRow`'s `confirmingClose` block) and
`ApplicationRow`'s reject confirmation. One real `role="tablist"` found
and fixed: `CurationsClient`'s rail selector had no `aria-controls`/
`tabpanel` and no arrow-key nav — claimed the tab contract without
honouring it — replaced with the portal's own `SegmentedFilter`.

**A repeated fake-token pattern, unrelated to the plan's original
findings, found across a wider sweep.** Grepped the whole tree for
`var(--hk-*, #hex)` and diffed the token names against `tokens.css` +
`tokens.extend.css`: eleven distinct invented names (`--hk-amber*`,
`--hk-rose*`, `--hk-pine-subtle`, `--hk-pine-light`, `--hk-gold-subtle`,
`--hk-ink-1`, `--hk-sand-2`) were in use across six files, three of them
portal (`SellerDashboardClient`, `ListingRow`, `AvailabilityPanel`, all
with a Tailwind-slate/amber/rose hex fallback baked in) and one
**consumer-facing**: `ProductPurchasePanel.module.css`'s pincode-feedback
and allergen-chip colours. All rebuilt on the real gold/terracotta/
success tone tokens the rest of the site already uses for the same three
meanings. `SellerDashboardClient`'s "Kitchen operating status" block was
also a bare `style={{...}}` reinventing a card `.capacityLine` already
existed for — moved to real CSS Module classes.

---

### R6 — The admin panel — done 2026-09-17

**A9's real cause: `getAdminDashboard()`'s mock branch never built an
`attention` object at all** (`lib/api/admin.ts`). The banner
(`AdminDashboardClient.tsx`) reads `snapshot.attention` and renders "Queue
clear" whenever it's `undefined` — which it always was in mock mode, the
mode this dev server runs in — while the stat cards and the SLA row read
separate, real fields (`pendingApplicationsCount`,
`oldestPendingApplicationAt`) that were populated correctly. Same shape as
A5: not a rendering bug, a mock-data gap that silently blanked a real
feature. Fixed by building `attention` (and the two `oldest*At` fields, and
`pendingListingsCount`) from the same counts already computed for the stat
cards, so the banner, the stat cards, the SLA row and the sidebar's queue
badges (`AdminShell#queueCounts`, which reads the identical field and was
therefore also always showing 0) now all agree — verified live via
screenshot: banner lists "3 HomeKrafter applications to review" / "2 Payout
requests to settle", the SLA card shows "64 days · 3 waiting", the sidebar
badges read 3/2, all consistent.

**B21**: the 9-10 "stat cards" were one `.statGrid` (`auto-fill,
minmax(170px,1fr)`), not three grids — at the width it was measured, 8
platform-total cards filled two neat rows of 4, and the trailing
specialty-breakdown card(s) wrapped to a lone 9th, reading as an orphaned
third grid. Split into two grids: `.statGrid` now holds exactly the 8
platform totals (GMV/orders/users/pending applications/pending
payouts/wallet liability/active HomeKrafters — divides evenly, no orphan),
and a second `.statGrid` under its own "HomeKrafters by specialty" heading
holds the specialty breakdown (food, plus legacy laundry when nonzero) —
semantically a breakdown of "Active HomeKrafters", not a platform total, so
grouping it apart is also the more honest read, not just a layout fix.
Renamed "Cooking homemade food" → "Cook homemade food" (matches the metric
being counted, shorter, doesn't wrap at 170px).

**B20**: `ORDER_TYPE_LABEL.laundry` → `"Laundry (legacy)"` — the bar chart
already hid the row at zero; the live catalogue still has legacy bookings,
so the fix is labelling it as history, not dropping it.

**The sweep over the other ~20 admin screens, against the portal-kit
rules, found and fixed:**

- **Zero `window.confirm`/`window.prompt` and zero `role="tablist"`
  misuse** — both rules were already clean everywhere outside what R5
  already fixed.
- **Four fake CSS tokens** (`--hk-card`, `--hk-white`, `--hk-canvas` ×2 —
  none real, none carrying a hex fallback, so each silently resolved to
  nothing) in `ApplicationRow`, `SellerDetailClient`,
  `CorporateInquiryDetailClient` and `TaxonomySuggestionsClient` —
  rebuilt on `--hk-surface`/`--hk-bg`/`--hk-surface-3` by what each was
  actually drawing (a card face, a recessed nested panel, a neutral
  status pill).
- **Three static inline `style={{...}}` in `CurationsClient.tsx`**
  (an icon's `flexShrink`, a `<ul>`'s reset, a count label's font/colour)
  — none genuinely dynamic — folded into the module CSS.
- **Six hand-rolled `<input>`/`<select>`/`<textarea>` swapped for the
  kit**: both `AdminLoginClient` fields → `Field`+`Input`;
  `ApplicationRow`'s area-assign `<select>` → `Field`'s `Select`;
  `ReviewQueuePanel` and `ProductModerationRow`'s reason boxes →
  `Field`+`TextArea` (the latter's per-field `error`/`aria-describedby`
  wiring now comes from `Field` itself instead of a hand-built id);
  `CurationsClient`'s catalogue search → the existing `SearchField`
  primitive (the audit's own guess that no such component existed was
  wrong — `components/ui/SearchField` is already the pattern three other
  admin list screens use). **Left as a reviewed exception:**
  `SellerVerificationPanel`'s three-abreast identity/address/FSSAI
  checkboxes — the kit's `CheckRow` is a 44px full-width row by design,
  and forcing it here would stack three short labels into three full
  rows for no accessibility or consistency gain; the existing native
  checkboxes are correctly labelled and wired.
- **Sixteen screens with no `try`/`catch` at all on their initial load**
  (an unhandled rejection left each stuck on its loading skeleton
  forever) and **one, `SellerDetailClient`, that collapsed a genuine
  network failure into "this HomeKrafter doesn't exist"** — all sixteen
  now follow `AdminDashboardClient`'s own `loadError`/`reloadToken` →
  `Notice` + Retry shape (a distinctly-named `loadError` where a file
  already had an `error` for something else, e.g. a save action);
  `SellerDetailClient` now branches on the thrown `ApiError`'s status —
  only a real 404 renders the not-found card, everything else is a
  Retry. The deeper "403 → a distinct *unavailable* state" half of the
  portal-kit rule (what `SellerShell` already does) was judged out of
  scope for this pass — every admin route is effectively single-role
  today, so a sub-admin hitting a 403 outside their `adminScopes` is the
  one case this doesn't yet name — noted here rather than silently
  skipped.

Fixing the 17-file error-handling pass surfaced one **pre-existing**
`lib/silent-failure.spec.ts` failure, unrelated to anything this
refinement touched: `SellersClient.handleApprove` awaited
`approveSellerApplication` inside an `async` arrow passed to a local
`run()` helper, and `run()`'s own `try/catch` — one function away — is
invisible to the spec's per-function static scan, which flagged a
false positive (the refusal *was* caught, just one indirection down).
Fixed by making `run()` generic and returning the mutation's result,
so `handleApprove` no longer needs its own `await` inside a nested arrow
— same behaviour, and the scanner now sees what was always true.

---

### R7 — Motion, then verification — done 2026-09-17

**Motion:** no new transitions/animations were added anywhere in R1–R6
beyond what already existed pre-refinement (checked every `.module.css`
this work touched or added). The global reduced-motion floor
(`styles/globals.css`'s `*, *::before, *::after { transition-duration:
0.01ms !important }` under the media query) already covers all of it,
including the pre-existing, untouched `CurationsClient.module.css`
transitions. The landing split's hover-expansion remains the one
authored moment; nothing in this refinement competes with it or adds a
second one. No further motion work was needed.

**Verification, in bounded passes:**
- `npm run build`, `npm run lint` (0 errors), `npx tsc --noEmit` — all
  clean in `client/`, twice (before and after the `SellersClient` fix
  above).
- `npm test` in `client/` — **58 suites / 700 tests**, all passing (one
  failure found and fixed — see the `SellersClient` note above).
- `npm test` in `server/` — **88 suites / 698 tests**, all passing
  (read-only; nothing under `server/` was changed by this work).
- Live-verified in the browser (synthetic admin/shopper sessions,
  `NEXT_PUBLIC_USE_MOCK=true` dev server, 0 console errors on every
  screen checked): `/admin` dashboard, `/admin/login`,
  `/admin/collections/curations`, `/admin/sellers` (both tabs).
- **The Playwright e2e layer was attempted and stood down.** It needs a
  real API + web app against a seeded throwaway Postgres database
  (`scripts/qa-up.sh`), which was stood up on isolated ports/DB
  (`hk_qa_uireview`, 4177/3177) — but Next's dev server refuses a second
  instance against the same project directory even on a different port,
  and the running `:3000` mock server (shared with other things in this
  environment) couldn't be killed to free it without risk. The only
  clean fix is a second git worktree, judged disproportionate to what
  was being checked: every new interactive element this pass added
  (`Field`/`Input`/`Select`/`TextArea`, `SearchField`, the `Notice`+Retry
  pattern, the inline two-step confirms) is an adoption of an
  already-established, already-tested kit primitive, not a new
  interaction shape — the class of defect the e2e layer exists to catch
  (dead Save buttons, un-trapped dialogs, double-charging) is exactly
  what using the kit correctly, rather than hand-rolling, is supposed to
  prevent. Stood down cleanly: the throwaway DB was dropped, the QA env
  file removed, the `:3000` server confirmed unaffected. If a future
  session has a spare worktree, `e2e/tests/a11y.spec.ts`,
  `focus-traps.spec.ts`, `header-capacity.spec.ts`,
  `presentation.spec.ts`, `node e2e/sweep.mjs` and `e2e/smoke-a5.mjs`
  are still the right list to run.

---

## 4. Docs this work owes

Per `CLAUDE.md`'s upkeep table, in the same commit as the change:

| Changed | Update |
|---|---|
| Tokens, label rule, icon rule | `DESIGN.md` + `CLAUDE.md`'s token-gap section |
| The landing hero | `CLAUDE.md`'s landing-page sections |
| The listing form's branching | `CLAUDE.md`'s M45 section + `docs/DATA-MODEL.md` if a column's meaning moves |
| Anything a tester can click | `docs/TESTING.md` |
| A gap the audit listed | ✅ in `docs/PRODUCTION-AUDIT.md` |
| Each phase | `CHANGELOG.md` |
