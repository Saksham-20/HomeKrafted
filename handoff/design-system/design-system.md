# Homekrafted Design System

White-first, warm-accented. Pine green leads; gold and terracotta support; per-channel greens (WhatsApp) are reserved for that channel only.

---

## 1. Color

### Roles
| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Primary | `--hk-pine` | `#234233` | Primary buttons, headings, nav, icons |
| Primary deep | `--hk-pine-deep` | `#1B3327` | Top utility bar, footer |
| Primary tint | `--hk-pine-tint` | `#EFF3EA` | Selected chips, success surfaces |
| Accent | `--hk-gold` | `#B98724` | Eyebrows, "view all", accent text |
| Accent bright | `--hk-gold-bright` | `#E4C874` | On-dark highlights, wallet accent |
| Accent tint | `--hk-gold-tint` | `#FBF1D6` | Wallet cards / chips |
| Price / emphasis | `--hk-terracotta` | `#B65D3C` | Marketplace prices, italic word in hero, remove ✕ |
| WhatsApp | `--hk-whatsapp` | `#1FA855` | Snacks & any WhatsApp CTA **only** |

### Surfaces & ink
Canvas `#F4F3F0` → cards `#FFFFFF` (1px `#ECEAE4` border). Text ramps `#2B241C → #4A4335 → #5B5344 → #8A8070`. **Never** reintroduce beige/cream fills — warmth is accent-only.

### Contrast
Pine `#234233` on white = 8.9:1. Gold `#B98724` on white = 3.6:1 → use for ≥16px/bold or decoration, not body text. Terracotta on white = 4.6:1, ok for large text.

---

## 2. Typography

Three families, loaded from Google Fonts:

- **Fraunces** (display serif) — headings, product names, prices. Weights 400/500/600/700; occasional *italic* for one emphasis word.
- **IBM Plex Sans** — all body, controls, nav.
- **IBM Plex Mono** — eyebrows, meta, price ticks, breadcrumbs, QR-ish labels. ALWAYS uppercase with `letter-spacing: .12–.22em`.

### Scale
| Token | Spec |
|-------|------|
| H1 | Fraunces 600–700, clamp(34→58px), line 1.04 |
| H2 | Fraunces 600, 27–29px |
| H3 | Fraunces 600, 24–25px |
| Card title | Fraunces 600, 17px |
| Body | Plex Sans 400, 14.5–16px, line 1.6 |
| Small / meta | Plex Sans 400, 12.5–13.5px |
| Eyebrow | Plex Mono, 11–12px, uppercase, tracked |

Apply `text-wrap: pretty` to headings and long paragraphs.

---

## 3. Spacing & layout

4px base scale (`--hk-s1..s8`). Section padding: 34–48px desktop, 20–24px mobile. Card interiors 14–16px. Lay out sibling groups (chips, nav, cards) with `display:flex/grid` + `gap` — never margin-spaced inline.

**Grid breakpoints:** mobile `430px` (single column, nav → menu button, utilities hidden), desktop `1180px` max stage. Two-column sections all collapse to one column on mobile.

---

## 4. Radius & elevation

Cards `16px`, promo bands/panels `20px`, inputs/thumbs `8–11px`, everything tappable-round is `pill (999px)`. Two shadows only: `--hk-shadow-card` on hover-raise, `--hk-shadow-stage` on the app stage.

---

## 5. Iconography

Line icons, 1.6–1.7 stroke, `currentColor`, 24px grid (search, wallet, heart, user, cart, washer). Brand marks (App Store / Play / WhatsApp) use filled glyphs. Diet dots: 1.5px square outline, green = veg, terracotta = non-veg. No emoji in production surfaces except the temporary service-icon placeholders (replace with line icons).

---

## 6. Channel badges (required)

Every service entry must declare its channel:
- `Book online now` — pine pill, white text (Laundry, Marketplace)
- `On the app · Coming soon` — translucent gold pill on dark (Food Delivery)
- `Order on WhatsApp` — WhatsApp-green pill (Snacks)

See `components.md` for the badge component.
