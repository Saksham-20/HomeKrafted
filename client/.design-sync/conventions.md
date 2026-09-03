# Homekrafted — how to build with this library

Homekrafted is a home-craft marketplace: homemade food and handcrafted gifts,
sold by individual makers ("HomeKrafters"). The look is **white-first with warm
accents** — an off-white canvas, white cards with a hairline border, deep pine
green for anything solid, gold and terracotta as accents only.

## Setup: no provider, no theme object

Components are plain React. There is **no ThemeProvider, no context, no
`init()`** — render any export directly:

```jsx
const { ProductCard, Button, Chip } = window.Homekrafted;

<ProductCard product={product} makerName="Meera's Kitchen" href="/product/mango-thokku-pickle" />
```

Everything visual comes from the stylesheet: load `styles.css` (it `@import`s
the tokens, the brand `@font-face` rules, and `_ds_bundle.css`, which holds the
components' own CSS). Without it the components render unstyled — that is the
only setup failure mode there is.

## Styling idiom: CSS custom properties, not utility classes

There is **no utility-class system and no style props**. Components own their
CSS; your own layout glue is plain CSS that reads the same `--hk-*` variables,
so it matches without guessing hex values.

| Purpose | Variables |
|---|---|
| Grounds | `--hk-bg` (page canvas), `--hk-surface` (card white), `--hk-surface-2`, `--hk-surface-3` |
| Lines | `--hk-border`, `--hk-border-2`, `--hk-divider`, `--hk-gold-border` |
| Text | `--hk-ink` (body), `--hk-ink-2`, `--hk-ink-3`, `--hk-muted`, `--hk-muted-2` (meta/captions) |
| Brand fills | `--hk-pine`, `--hk-pine-deep`, `--hk-pine-tint`, `--hk-pine-grad-a` / `--hk-pine-grad-b` |
| Accents | `--hk-gold`, `--hk-gold-bright`, `--hk-gold-tint`, `--hk-terracotta` (prices), `--hk-success`, `--hk-whatsapp` |
| Accent text | `--hk-gold-text-sm`, `--hk-terracotta-text`, `--hk-whatsapp-text` |
| On dark | `--hk-on-pine`, `--hk-footer-ink`, `--hk-footer-ink-2`, `--hk-footer-muted`, `--hk-footer-border` |
| Type | `--hk-font-display` (Fraunces), `--hk-font-body` (IBM Plex Sans), `--hk-font-mono` (IBM Plex Mono), sizes `--hk-h1` `--hk-h2` `--hk-h3` `--hk-body` `--hk-small` `--hk-card-title` `--hk-eyebrow-spacing` |
| Space | `--hk-s1` … `--hk-s8` |
| Radius | `--hk-r-sm` `--hk-r-md` `--hk-r-lg` `--hk-r-xl` `--hk-r-pill` |
| Depth / motion | `--hk-shadow-card`, `--hk-shadow-stage`, `--hk-dur`, `--hk-ease`, `--hk-focus-ring` |

Four rules that keep a screen on-brand:

- **Gold never carries words.** `--hk-gold` is for fills, borders and rules; any
  gold *text* uses `--hk-gold-text-sm`. Same shape for terracotta and WhatsApp
  green — the brand colour is the fill, the `-text` variant is the type.
- **White-first.** Cards are `--hk-surface` on `--hk-bg` with a 1px
  `--hk-border`. Don't fill panels with beige or cream.
- **Fraunces for headings, Plex Sans for everything else**, mono
  (`--hk-font-mono`, uppercase, letter-spaced with `--hk-eyebrow-spacing`) for
  eyebrows, badges and figures like `8 / 20`.
- **On a dark surface, set `--hk-focus-ring: var(--hk-gold-bright)`** on the
  container — the default ring disappears against pine.

## Composition notes

- **A card that navigates takes `href` and renders a real link**
  (`ProductCard`, `CategoryTile`, `OccasionTile`). There is no `onCardClick`.
- **Controlled vs uncontrolled**: `QuantityStepper`, `SlotPicker`,
  `AmountPicker` and `PriceRange` accept either `value` + `onChange` or a
  `defaultValue`. `Combobox` and `PreOrderPicker` are controlled only.
- **`Combobox`, not `<select>`**, wherever the list grows over time — it is the
  only picker with a way to say "none of these is what I make".
- **Prices are terracotta, in rupees**, and a struck-through `mrp` only appears
  when there is a real discount behind it.
- **Images**: components render their own placeholder when a photo is absent.
  This bundle ships no photography, so pass no `src`/`imageSrc` and let the
  labelled placeholder show, rather than pointing at a path that will 404.

## Where the truth is

- `styles.css` and its imports (`tokens/`, `fonts/`, `_ds_bundle.css`) — every
  variable and every component rule, verbatim from the app.
- `components/<group>/<Name>/<Name>.d.ts` — the real prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage, with the
  source's own doc comments.

## One idiomatic screen

```jsx
const { ProductCard, Chip, Button } = window.Homekrafted;

<section style={{ background: "var(--hk-bg)", padding: "var(--hk-s6)" }}>
  <p style={{
    font: "500 12px/1 var(--hk-font-mono)",
    letterSpacing: "var(--hk-eyebrow-spacing)",
    textTransform: "uppercase",
    color: "var(--hk-gold-text-sm)",
  }}>
    Ordered again and again
  </p>
  <h2 style={{ font: "600 var(--hk-h2)/1.2 var(--hk-font-display)", color: "var(--hk-ink)" }}>
    From kitchens near you
  </h2>

  <div style={{ display: "flex", gap: "var(--hk-s2)", margin: "var(--hk-s4) 0" }}>
    <Chip label="Pickles" selected onClick={() => {}} />
    <Chip label="Bakes" onClick={() => {}} />
  </div>

  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--hk-s4)" }}>
    {products.map((p) => (
      <ProductCard key={p.id} product={p} makerName={p.makerName} href={`/product/${p.slug}`} />
    ))}
  </div>

  <Button variant="secondary">See every kitchen</Button>
</section>
```
