# Component Inventory

All components are framework-neutral. Values reference `tokens.css`. States: default / hover / selected / disabled.

## Buttons
- **Primary** — bg `--hk-pine`, text `#F6EFE1→#fff`, pill, 14–15px/600, padding 13–15px × 24–28px. Hover: slight lift + `--hk-shadow-card`.
- **Secondary (outline)** — transparent, 1.5px `--hk-pine` border, pine text.
- **Ghost gold** — outline `--hk-gold-border`, gold text; used for "add to hamper".
- **WhatsApp** — bg `--hk-whatsapp`, white, leading WhatsApp glyph. Snacks only.
- **Icon button** — 30–52px square/round, `--hk-surface` fill, `--hk-border` outline.
- **Quantity stepper** — pill, 1.5px pine border, − value + .

## Chips / Badges
- **Filter chip** — pill; selected = pine fill/white, idle = white/`--hk-border`.
- **Channel badge** — see design-system §6.
- **Tag** (on cards) — pine fill, mono 9.5px uppercase, `Bestseller / New / Festive / Curated`.
- **Diet dot** — square, veg green / non-veg terracotta.

## Cards
- **Product card** — 1:1 image (labelled placeholder), maker eyebrow, Fraunces title, `★ rating (n) · weight`, price + strikethrough MRP, round `+` add. Border `--hk-border`, radius `lg`; hover → gold border + card shadow.
- **Category tile** — circular 1:1 image + label.
- **Occasion tile** — initial in gold ring + label (no image).
- **Snack card** — 1.5:1 image, diet dot, name, desc, price, add/added toggle.
- **Service card** (laundry) — icon tile, name, per-unit price, selectable border.

## Panels
- **Promo band** — radius `xl`, either pine gradient (dark, gold accent) or white/tinted. Eyebrow + H3 + copy + CTA.
- **Wallet balance card** — pine gradient, gold eyebrow, 52px Fraunces balance, pending/lifetime row, decorative circle.
- **Sticky summary aside** — white, border, radius `xl`, line-item rows (dashed dividers), total in Fraunces, wallet-cashback line, primary CTA. Used by Hamper, Laundry, Snacks, Cart.

## Navigation
- **Utility bar** (dark) — context switcher + device toggle (prototype only; drop in prod).
- **Header** — logo lockup (Fraunces "Home**krafted**" + mono tagline), primary nav, search pill, **wallet chip** (gold-tint, shows balance), wishlist/account/cart icons with count badge. Mobile: nav → hamburger, search + wishlist/account hidden.
- **Announcement bar** — pine, centered value props, gold mono first item.
- **Footer** — pine-deep, 4 columns (brand + Services/Help/Account), mono legal row.

## Forms & pickers
- **Search field** — pill, leading magnifier, muted placeholder.
- **Day / slot picker** — grid of selectable tiles (laundry).
- **Top-up amount picker** — 4-up grid of selectable amount tiles (wallet).
- **Price range** — dual-handle track (pine).
- **Photo upload** (dry-clean estimate) — dashed drop tile, `+` (spec'd, build in prod).
- **Special instructions** — multiline textarea, `--hk-border-2`.

## Progress
- **Step pills** — hamper (Box/Fill/Message/Checkout) & laundry; active = pine fill.
- **Capacity meter** — hamper box fill (gold gradient) with `n/max`.
- **WhatsApp status timeline** — dots (filled = done) for Received → Accepted → Out for delivery.

## Wallet-specific
- **Transaction row** — icon tile (credit green ↓ / debit terracotta ↑), title, mono date, signed amount.
- **Pay-with-wallet toggle card** — gold-tint, default-on messaging.

## QR / app install
- **QR tile** — 5×5 module grid placeholder → replace with real QR. Paired with App Store / Play badges.
