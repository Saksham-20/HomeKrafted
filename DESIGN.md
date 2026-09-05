# Design System — Homekrafted ("The Maker's Table" refinement)

Approved 2026-09-02 via /design-consultation (owner picked the direction and
shipped it after the rendered preview). This is a **refinement of the live
brand, not a rebrand**: same logo, same content, same Fraunces, same
pine/gold/terracotta family. `handoff/` stays untouched and `styles/tokens.css`
stays law — every value here lands through `styles/tokens.extend.css` and
`app/layout.tsx`'s font config, the sanctioned override layer, so the whole
direction is reversible in one commit.

## Product Context
- **What this is:** marketplace for homemade food (tricity home kitchens,
  cooked to order) and handcrafted gifts (ships across India).
- **Who it's for:** urban Indian buyers who want "a real person made this" —
  the one thing a first-time visitor should remember (owner, 2026-09-02).
- **Why this exists:** the owner's finding that the site read "empty and not
  premium". Diagnosis (three independent voices agreed): white-first
  minimalism designed for a catalogue we don't have yet; uniform card grids
  with no editorial scale; the *person* missing from the pixels; an
  institutional body font.
- **Reference research:** iTokri (dense artisan-first bands, faces
  everywhere), The Whole Truth (oversized type + hand annotations),
  Goldbelly/Etsy/Swiggy/Zomato from knowledge (they block headless browsers).

## Aesthetic Direction
- **Direction:** Organic/editorial — "a sunlit Indian kitchen table".
  Premium = specificity + texture, never emptier whitespace.
- **Decoration level:** intentional — paper ground, receipt-type provenance,
  rationed handwriting. No blobs, no icon grids, no gradients-as-decoration.
- **Mood:** warm, tactile, honestly counted. Sell the wait, not the speed:
  "cooked after you order · only 8 this week" is the flex Swiggy can't make.

## Typography
- **Display/Hero: Fraunces — KEPT, pushed harder.** At display sizes set the
  variable axes `SOFT 70-80, WONK 1` (via `font-variation-settings` on the
  display classes) — hand-lettered jam-label energy; flat Fraunces reads like
  a bank. Body-size Fraunces (card titles) stays flat.
- **Body: Hanken Grotesk — REPLACES IBM Plex Sans.** Same neutrality, warmer
  counters; Plex Sans is IBM's corporate UI voice and reads institutional
  SaaS. (Codex proposed Satoshi; rejected — not on Google Fonts, and the
  stack loads via `next/font/google`.)
- **UI/Labels: IBM Plex Mono — KEPT, recast as "receipt type".** Batch
  numbers, made-on dates, counts, eyebrows. The ledger is the brand. Stop
  using it where it reads technical-cold.
- **Annotations: Kalam (Google Fonts, Indian Type Foundry) — NEW.** One
  weight (400), the maker's hand: "Dadi's bestseller →". **Hard ration: max
  two per screen**, decorative only (`aria-hidden`), never carrying
  information that exists nowhere else.
- **Loading:** all four via `next/font/google` in `app/layout.tsx`, exposed
  as the existing `--font-*` variables; `--hk-font-body` re-points in
  `globals.css` exactly as today.
- **Scale:** unchanged from the live system; the change is *how* the display
  face is used (bigger, wonkier), not the ramp.

## Color
- **Approach:** balanced, same family, warmer ground. All M34 contrast rules
  survive: **gold never carries text** (`--hk-gold-text-sm` for gold-family
  words), terracotta for prices, focus-ring rules unchanged.
- **Canvas:** `#F7F1E6` paper (was `#F4F3F0`). This deliberately supersedes
  the "white-first, never beige" rule — owner-approved 2026-09-02: with a
  small catalogue, white-on-white *is* the emptiness. White cards now pop
  like labels on kraft.
- **Cards:** `#FFFFFF` unchanged; border warms to `#E5DCC9`
  (was `#ECEAE4`); soft surface `#FFFCF5` for receipt-meta blocks.
- **Pine:** `#1F3B2C` / deep `#14281E` — trust anchor, used in bigger filled
  blocks (hero bands, editorial tiles), not only trim.
- **Gold:** `#B98724` fills/rules/seals only; soft `#E6C97D` on dark pine.
- **Terracotta:** `#B85F3D` prices + the italic accent word (deep `#8D3F29`
  on tint).
- **Dark mode:** none — the site ships one look, as today.
- **Contrast:** every re-tinted pairing owes the M34 pass before shipping
  (`e2e/tests/a11y.spec.ts` + `node e2e/sweep.mjs`); the paper canvas is
  *lighter-warmer*, so current AA text colors are expected to hold, but
  measure, don't assume.

## Density & Provenance (the anti-empty rules)
- **Maker identity on every card:** portrait chip + name + area
  ("Dadi's Recipe · Zirakpur"). Already true on kitchen cards; extend to
  gift cards' maker line prominence.
- **Receipt-meta block on kitchen/product cards:** mono, dashed border,
  `PURE VEG · 4 DISHES · FROM ₹160 · THURSDAY'S BATCH OPEN` — only facts the
  data already holds (the M51 honesty rules: never invent counts or dates).
- **Editorial scale contrast:** one oversized hero card/tile per band; never
  a uniform grid wall. Mixed scales beat more SKUs.
- **Edge-to-edge photo rows** between card bands (real photography only —
  the M56/M25 imagery rules are untouched).
- **Carousels only where rotation means something:** freshness ("cooking
  today"), makers, occasions. The M59c featured rows themselves were
  removed on 2026-09-05 (they duplicated the grids under them); the
  rotation rules they set still apply (pause on
  hover/focus, reduced-motion off, no rotation when everything fits) apply
  to any new one.

## Spacing / Layout / Motion
- **Spacing, grid, breakpoints:** unchanged (5 rails: 420·560·640·780·900;
  1180 container; header arithmetic untouched).
- **Layout approach:** hybrid — grid-disciplined app surfaces, editorial
  bands on browse/landing.
- **Motion:** intentional and tactile — cards slide like objects on a table
  (`--hk-dur .36s` stays); badges stamp once, never loop; all under the
  global reduced-motion floor.

## Implementation phases (each its own reviewed change)
1. **Tokens + fonts:** `tokens.extend.css` overrides (canvas, borders,
   surface-soft), `layout.tsx` font swap (Hanken Grotesk, Kalam), display
   wonk classes. Run the contrast sweep.
2. **Provenance:** receipt-meta block on kitchen cards + product cards;
   Kalam annotation slots (rationed) on featured tiles.
3. **Editorial scale:** hero card treatment in browse grids and landing rails.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-02 | Initial refinement direction approved (preview reviewed) | Owner: "consistent with logo and current design, just classier, content unchanged". Three-voice consultation converged on: keep Fraunces/push harder, replace Plex Sans, warm canvas, provenance density. |
| 2026-09-02 | Paper canvas supersedes "white-first, never beige" | White-on-white read as emptiness at current catalogue size; owner-approved reversal, one-commit reversible. |
