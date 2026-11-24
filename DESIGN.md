---
name: Homekrafted
description: Maker-first commerce on a warm table, with a festive gift-wrap counter on the homepage.
colors:
  primary-pine: "#234233"
  primary-pine-deep: "#1B3327"
  brand-gold: "#B98724"
  terracotta: "#B65D3C"
  ink: "#1A140E"
  paper-canvas: "#F7F1E6"
  surface: "#FFFFFF"
  warm-border: "#E5DCC9"
  home-wrap-paper: "#FBF8EF"
  home-counter-pine: "#123C36"
  home-rani-pink: "#8F435D"
  home-vermilion: "#B96C55"
  home-marigold: "#DDA94F"
  home-turmeric: "#F1D88C"
  home-on-pine: "#FCF8ED"
  home-seam: "#D9CBA7"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(34px, 4.4vw, 58px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.02em"
    fontVariation: "SOFT 75, WONK 1"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.16em"
  landing-display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(38px, 6vw, 96px)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  landing-body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  landing-action:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  landing-control:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  print: "4px"
  insert: "6px"
  sm: "8px"
  md: "11px"
  lg: "16px"
  xl: "20px"
  door: "22px"
  pill: "999px"
spacing:
  0: "2px"
  1: "4px"
  1h: "6px"
  2: "8px"
  2h: "10px"
  3: "12px"
  3h: "14px"
  4: "16px"
  5: "20px"
  6: "26px"
  7: "34px"
  8: "44px"
components:
  landing-button-primary:
    backgroundColor: "{colors.home-turmeric}"
    textColor: "{colors.home-counter-pine}"
    typography: "{typography.landing-action}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "54px"
  landing-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.home-on-pine}"
    typography: "{typography.landing-control}"
    padding: "0"
    height: "48px"
  landing-filter-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.landing-control}"
    rounded: "{rounded.print}"
    padding: "0 20px"
    height: "44px"
  landing-filter-tab-active:
    backgroundColor: "{colors.home-counter-pine}"
    textColor: "{colors.surface}"
    typography: "{typography.landing-control}"
    rounded: "{rounded.print}"
    padding: "0 20px"
    height: "44px"
  landing-parcel-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.home-counter-pine}"
    rounded: "{rounded.print}"
    padding: "8px 8px 12px"
---

# Design System: Homekrafted

## Overview

**Creative North Star: "The Maker's Table; a Festive Gift-Wrap Counter at `/`"**

Homekrafted is a maker-first marketplace. Across the product, warm paper, pine, gold, honest provenance, real photography, and editorial scale make the named person behind an item feel more important than marketplace chrome. Premium means specificity and material presence, not sparse white space, fabricated status, or a wall of interchangeable cards.

The homepage is a deliberate route-level world inside that system: a contemporary Indian festive gift-wrap counter. Deep pine behaves as counter cloth; softened marigold, turmeric, terracotta, and berry behave as stacked wrapping papers; gold appears as ribbon, tape, rules, and seals. Real gifts sit on top as rectangular photographs, parcel labels, and movable prints. The composition is lively but legible, asymmetrical but grid-aware, and persuasive without inventing claims.

Since 2026-11-21 (owner) the homepage uses the site's own pair — Fraunces headings over Hanken Grotesk — replacing the 2026-10-23 Public Sans direction. Eczar, Literata and handwritten annotation are not part of the landing page's rendered identity. Off `/`, the established Maker's Table typography and warm-paper system remain authoritative.

**Key Characteristics:**

- Maker names, real product photography, and real order footage are proof, not decoration.
- Warm, tactile surfaces use pine and gold as brand anchors; the homepage adds restrained festive papers around product-led neutral space.
- Editorial scale, staggered grids, overlaps, and changing section compositions prevent catalogue monotony.
- Controls remain plainly interactive, keyboard reachable, and large enough for touch.
- Motion feels like handling paper, prints, doors, and parcels; every decorative effect has a static or touch-safe form.

## Colors

The site-wide palette is warm and grounded. The homepage keeps that calm base, then uses muted festive papers as campaign fields so product photography remains the strongest source of color.

### Primary

- **Primary Pine:** The enduring brand anchor for actions, headings, navigation, and trusted solid fields.
- **Primary Pine Deep:** Footer, dark chapter breaks, and other high-contrast brand surfaces.
- **Homepage Counter Pine:** Homepage-only counter cloth behind the hero, Diwali shelf, story band, and festive cards.

### Secondary

- **Brand Gold:** Fills, ribbon seams, tape, rules, and seals. It is structural or decorative, never running text.
- **Terracotta:** Site-wide gifting prices and warm emphasis off the homepage.
- **Homepage Marigold and Turmeric:** Muted wrapping sheets, active marks, ribbon fields, and high-contrast festive actions.

### Tertiary

- **Homepage Berry:** Softened full-section wrapping paper, interaction emphasis, and the closing seller cover.
- **Homepage Terracotta:** Alternating parcel-label stock and festive emphasis.

### Neutral

- **Ink:** Site-wide primary text on light surfaces.
- **Paper Canvas:** Warm site-wide ground beneath white cards.
- **Surface:** Cards, labels, navigation panels, and photograph borders.
- **Warm Border:** Site-wide card and divider line.
- **Homepage Wrap Paper:** Homepage-only warm neutral stock used between festive campaign fields.
- **Homepage On Pine:** Warm white for copy on the homepage's dark-pine surfaces.
- **Homepage Seam:** Quiet divider and parcel-edge line on the homepage.

**The Gold Is Hardware Rule.** Gold may bind, divide, underline, seal, or highlight. It does not carry body copy; small gold-family site text uses the accessible dark-gold text token instead.

**The Product-Led Festival Rule.** Festive colors may occupy a few contiguous campaign fields and parcel-label strips, but neutral paper and real product imagery carry most of the page. Do not make every chapter equally saturated.

**The Scope Rule.** Homepage colors live beneath the landing root. Do not leak rani pink, turmeric, or wrapping-paper surfaces into account, seller, admin, checkout, or catalogue routes without a separate design decision.

## Typography

**Display Font:** Fraunces (with Georgia and serif fallbacks), site-wide including `/`

**Body Font:** Hanken Grotesk (with system sans-serif fallbacks), site-wide including `/`

**Label/Mono Font:** IBM Plex Mono for factual receipt-style metadata off `/` — counts, dates, batches, order numbers. Since 2026-11-22 not for wayfinding or labels: breadcrumbs, form/section labels, maker names, the footer, and the portals' nav labels, status pills, stat labels and tags are Hanken 600 in sentence case

**Character:** The wider product uses a softened editorial serif over a warm, readable grotesk. The homepage intentionally becomes cleaner and bolder: one sans family, two weights, strong size contrast, tight display tracking, and no handwriting.

### Hierarchy

- **Site Display** (700, responsive to 58px, 1.04): Fraunces for major headings and prices. At true display sizes, use the softened/wonk variable treatment; keep body-size titles flat.
- **Site Body** (400, 15px, 1.6): Hanken Grotesk for copy and controls. Long reading columns stay near 65–75 characters.
- **Site Label** (400–500, 13px, 1.5): IBM Plex Mono for provenance, batches, dates, and receipt-like facts, not generic technical decoration.
- **Homepage Hero** (600, 38–64px in the implemented hero, 1.0): Fraunces 600, SOFT 40, tightly tracked and balanced across two decisive lines.
- **Homepage Section Display** (600, typically 28–68px, 1.03–1.1): Fraunces 600, set once on the landing root. Individual chapters vary scale and alignment instead of repeating one title bar.
- **Homepage Body** (400, usually 16–20px, 1.4–1.65): Hanken Grotesk. The landing root establishes 17px/1.6 as its reading default.
- **Homepage Label/Action** (600 for emphasis, 13–21px): Hanken Grotesk 600 for buttons, maker names, tabs, small labels, and emphasized phrases.

**The Landing Type Rule.** Headings on `/` are Fraunces 600; everything else is Hanken Grotesk 400/600, including the fixed header. Hanken loads no 700 — never ask for one. No handwriting, mono or ornamental display type there.

**The Strong Headline Rule.** Homepage headings are bold because the selected family has a real 700 cut. Do not simulate distinction with color alone or substitute a display face that cannot supply the intended weight.

## Layout

The base product uses full-bleed bands around centered content. Consumer surfaces can extend to a 1440px container; prose stays capped at 1180px. Side padding is 44px on wide screens, 20px at 780px and below, and 16px at 420px and below. Existing responsive rails remain 420, 560, 640, 780, and 900px.

The homepage uses 900px as its principal composition change. Above it, twelve-column grids support deliberate imbalance: copy occupies seven columns beside a five-column gift feature; editorial shelves run off the right edge; headings trade sides with content; a diagonal catalogue split opens toward the pointer; and the ordering story pins one six-column half while the other scrolls. Below it, sections stack, print labels become a horizontal snap rail, doors become separate cards, sticky/pointer-dependent effects recede, and all essential links and text remain available.

Landing sections are contiguous wrapping sheets separated by purposeful 1px or 8px seams. Adjacent chapters must change composition—not just background color—so the page never collapses into repeated “container, heading, grid” bands. The hero begins on deep pine with a broad marigold ribbon behind an oversized real product and overlapping parcel labels. The fixed landing header is 72px on desktop and 54px on small screens; it is transparent over the pine hero and becomes a blurred white bar after the hero brand handoff.

**The Asymmetric Counter Rule.** Offset titles, stagger cards, overlap inserts, let shelves exceed the container, and alternate the dominant edge. Preserve a coherent twelve-column skeleton underneath the apparent looseness.

**The Mobile Function Rule.** A pointer flourish may disappear on touch, but its link, proof, label, and action may not. Horizontal scrolling replaces desktop dragging; stacked cards replace diagonal clipping; visible words replace pinned swaps.

## Elevation & Depth

The base system is mostly flat and uses tonal layers and warm borders. Its card and stage shadows are reserved for objects that genuinely sit above the table.

On the homepage, depth belongs to physical metaphors: draggable product prints, the tilted festival feature, circular photo stickers, and taped promotional inserts. Colored section sheets stay flat. Avoid ambient shadows around every content block; seams, overlap, rotation, clip paths, and a change of paper stock should carry most of the depth.

### Shadow Vocabulary

- **Site Card:** `0 14px 30px -18px rgba(35,66,51,.40)` for ordinary raised cards off `/`.
- **Site Stage:** `0 30px 70px -30px rgba(27,51,39,.50)` for larger off-homepage panels.
- **Homepage Resting Print:** `0 8px 24px -12px rgb(18 60 54 / 0.34), 0 2px 4px rgb(18 60 54 / 0.10)` for paper and sticker objects at rest.
- **Homepage Lifted Print:** `0 22px 44px -18px rgb(18 60 54 / 0.42), 0 5px 10px rgb(18 60 54 / 0.12)` while a paper object is hovered or dragged.

**The Object-Only Shadow Rule.** If a surface is not behaving like a print, parcel, taped insert, or floating navigation layer, it stays flat.

## Shapes

Site-wide cards use gently rounded corners from 8px through 20px. Pills are reserved for genuine compact statuses, counts, or mode switches; they are not the default silhouette.

The homepage is more cut-paper than soft-card. Parcel prints use 4px corners, inserts 6px, primary actions 8px, the hero gift feature 10px, and large photographic doors 18–22px. Circles are reserved for category stickers, fallback initials, progress dots, and arrow discs. Broad gold or turmeric seams, narrow tape strips, diagonal clipping, slight rotations, and overlapping rectangular photographs provide the distinctive geometry.

**The Clipped-by-Overlap Rule.** Create festive character with seams, crop, rotation, and one object crossing another—not decorative blobs or a rounded container around every idea.

## Components

### Buttons

- **Shape:** Compact rectangular parcel labels (usually 8px radius), not pills.
- **Homepage Primary:** Turmeric fill, counter-pine text, 2px matching border, Hanken Grotesk 600, 54px desktop height and 48px mobile height.
- **Hover / Focus:** Lift by 3px, brighten the paper, move the arrow by 4px, and keep a clearly visible focus outline. Active returns to the surface.
- **Secondary:** Bold warm-white or ink link with a 2px marigold, rani, or gold-bright underline and generous underline offset.
- **Site-wide shape (2026-11-22, owner):** off `/` the same grammar holds — `Button`, search and form fields, quantity steppers, filter and sort controls use `--hk-r-control` (6px, the landing's `--lp-r`); a segment group (Kitchens/Dishes) is a bordered frame of `--hk-r-tab` (4px) tabs with a flat pine selection, like the landing's Bestsellers/Trending. Pills remain for compact chips, statuses and counts; icon buttons stay round. The consumer nav uses the landing header's voice (600, 0.04em tracking).
- **Page titles and section links (2026-11-22, owner):** a browse page title turns like the landing hero — ink, then the turned word in `--hk-pine-turn`, upright (not italic terracotta). "Go elsewhere" text links are `MoreLink`: 600 ink words, a 2px gold underline at 0.3em, and a drawn arrow that moves 4px on hover — never a typed "→".

### Chips

- **Style:** Homepage filters are four compact rectangular tabs inside one bordered 8px frame. Their moving selected marker is deep pine; inactive tabs remain transparent.
- **State:** The active tab is white on deep pine. Focus uses a 3px rani outline. Outside `/`, existing pills remain valid only for status, count, compact choice, or mode.

### Cards / Containers

- **Parcel Prints:** Real square product photography above a bold product name and a regular maker line, on white stock with a dark 2px edge and a small resting shadow. Desktop labels can be dragged within the hero; mobile labels scroll and snap.
- **Product Registers:** Reuse real product cards, but stagger alternate columns and deal them in after a filter change. Do not wrap the whole grid in another generic card.
- **Product Card (site-wide, 2026-11-22):** `ProductCard` is frameless like the landing shelf — 8px photo lifting 3px on hover, Hanken 600 name, "by Maker" in muted body type, ink price. No border, box or card shadow; category shortcut tiles are white faces with pine marks, not per-category pastels. Type under the photo (owner, 2026-11-24): name 19 / maker 15 / size 14 / price 19px on desktop, 16.5 / 14 / 13 / 17.5 on a phone. The photo is its own layer above the card's stretched link with `pointer-events: none`, so its arrows and heart stay pressable while the hover lift (a transform) runs.
- **Promotional Inserts:** Dark-pine or gold-tint rectangular sheets with a narrow translucent tape strip, slight rotation, and overlap at desktop.
- **Photographic Doors:** Large edge-to-edge gift and food photographs behind readable scrims. Desktop uses one diagonal seam; touch uses two independent stacked links.
- **FAQ:** Native `details` rows with strong type, one top rule, quiet dividers, and a plus rotating to 45 degrees when open.

### The seasonal home page and dress (client mockup, 2026-11-24)

**Supersedes this section's older homepage notes for `/`, and three of the Don'ts below** — the client's mockup draws pill buttons, centred section titles between hairlines, and a cream paper page, and the client asked for it as drawn. Scope stays tight: the cream (`--hp-paper` `#f8f1e6`, `--hp-tint` `#f3e5cd`, line `#e8d8bd`) lives in `HomePage.module.css`; pills are the home page's CTAs only — the rest of the site keeps the 6px control shape.

- **Type:** Fraunces 600 headings in `--hk-pine-deep` with size-specific negative tracking (−0.022em at the hero, −0.015em at section titles); Hanken body at 0.
- **Surfaces:** white-warm cards (`--hp-card`) with a two-layer warm shadow, 14px radius; tinted bands at 18–20px. Photographs are rectangular and real; the hero's fades into the paper through an intersected left-and-top mask.
- **Motion (apple-design):** feedback on press (`:active` scale 0.97–0.98), critically damped easing `cubic-bezier(0.2, 0.8, 0.2, 1)`, no bounce; rows scroll natively with snap points; every transform is dropped under reduced motion.
- **Ornament, rationed:** one snowflake per section at most, drawn in `--hp-frost` (never text). Frost is an accent, not a palette: `--hp-frost` `#a9bdca` for marks, `--hp-ice` `#e6eef1` behind the recipient icons.
- **Snow, minimal (`components/season/`):** small soft white flakes fall slowly (16–30s per fall, gentle sway) inside the hero photograph, which masks them with its own fades, past the Winter Edit band's photographs, and in a 220px band at the footer's top edge — never full-screen, never over a headline or running copy. CSS animation on transform/opacity, no canvas. One "Pause snow" control (frosted glass in the hero, an outline pill in the footer's legal line) stops every area at once and is remembered; under reduced motion there is no snow and no control.
- **Warm inside, cold outside (2026-11-24):** the page is the warm kitchen; the season shows on three dark pine surfaces that wear the same static snow cap (`SnowCap`): the **Winter Edit band** (the page's window onto the night — deep pine with a cool `--hp-frost` light from the upper right, snow falling past four photographs that glow warm like lit windows, cream type, frost kicker), the meal-plans card, and the footer. One drawing of the cap, never a second.
- **The seasonal dress, site-wide while `SEASON.theme` is set:** the paper header on every shopper page, a "Winter Edit" tab, the footer's snow cap and snow. No announcement bar (removed at the client's request). Portals keep their own chrome.
- **The app, coming soon (owner, 2026-11-24):** the last section of `/` is a store listing in one row — the app's real tile (the brand lockup on a white rounded square), a gold "Coming soon" pill, "The Homekrafted app", one line, and the App Store / Google Play badges reading "Coming soon on …" (labels, not links, until the apps are published). Not in the footer.
- **Footer (site-wide):** brand + "Made with love in real homes", Explore / Customer Care / About columns, "Stay in the loop" (an Instagram link — no newsletter list exists to subscribe to), then every policy document in one compact row and the legal line.

### Navigation

*(Describes the previous landing header; `/` now uses the sticky paper bar above.)* The landing header is fixed and Hanken Grotesk. Over the hero it is transparent with warm-white controls and turmeric hover states. After the hero brand leaves, it becomes a 96%-white blurred bar with warm border and a light structural shadow. Desktop navigation is visible; at 900px and below it yields to a 44px hamburger while the logo remains visible.

### Signature Homepage Components

- **Hero Counter:** Two-line promise, one primary action, one underlined secondary action, an oversized real festive product, a wide marigold ribbon seam, and four named product prints.
- **Interactive Promise:** Truthful claims are underlined inline buttons that reveal their explanation in one adjacent live region. It never uses floating popovers on mobile.
- **Occasion Ledger:** Large linked rows on rani paper. Desktop may show a real product preview near the pointer; mobile keeps a thumbnail or initial ring inside each row.
- **Wrapping-Label Strip:** Secondary destinations form a contiguous two-column mobile or five-column desktop sheet with 3px seams and alternating marigold, vermilion, rani, turmeric, and pine-tint stock.
- **Pinned Ordering Story:** A deep-pine chapter with three steps. Desktop swaps one oversized word as the corresponding explanation crosses the viewport; mobile prints the word above every step.

Motion uses the landing ease-out curve `cubic-bezier(0.16, 1, 0.3, 1)` for most handling and `cubic-bezier(0.77, 0, 0.175, 1)` for the diagonal door seam. State changes generally take 200–520ms; large image or seam movements can take 700–900ms. Honor the global reduced-motion floor and remove nonessential transforms when reduction is requested.

## Do's and Don'ts

### Do:

- **Do** keep the homepage festive world scoped to `/` and retain the warm Maker's Table system elsewhere.
- **Do** use real product, maker, category, and order imagery; keep photographs rectangular, materially prominent, and linked to real content.
- **Do** name the maker wherever a product appears and keep every commercial statement traceable to real data.
- **Do** use Fraunces 600 for homepage headings and Hanken Grotesk for copy, actions, labels and emphasis.
- **Do** let neutral paper and real product imagery dominate, then use muted wrapping-paper fields, gold structural seams, stagger, overlap, and intentionally changing section compositions.
- **Do** preserve keyboard semantics, 44px touch targets, visible focus, reduced-motion alternatives, and mobile equivalents for pointer interactions.
- **Do** keep gold structural and decorative; use warm white, pine, ink, or the established accessible dark-gold token for text.

### Don't:

- **Don't** bring Eczar, Literata, Public Sans, Kalam, handwritten notes, or receipt-mono typography into visible homepage copy.
- **Don't** turn the homepage into a generic stack of gradient cards, glass panels, centered heading bars, or repeated SaaS bento grids.
- **Don't** put every action, label, filter, and card inside a pill. Most landing controls are compact rectangular parcel labels.
- **Don't** fabricate maker counts, review totals, delivery promises, hygiene inspections, guarantees, app availability, or any metric the catalogue does not hold.
- **Don't** replace real photography with decorative illustration, generic icons, empty gradients, or ornamental blobs.
- **Don't** make every section equally colorful; reserve festive papers for campaign bands, actions, and contiguous label strips.
- **Don't** use perpetual decorative motion, bouncy spring behavior, or pointer-only meaning.
