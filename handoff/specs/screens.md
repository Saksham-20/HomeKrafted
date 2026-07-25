# Screen Breakdown (prototype)

The prototype (`prototype/Homekrafted.dc.html`) implements the web-buildable surfaces. Switch screens via the dark utility bar; toggle Desktop/Mobile there too. Stage: 1180px desktop / 430px mobile.

## Implemented
1. **Home** — store-first hero; shop-by-occasion; categories; "this week's small batches"; hamper + wallet promo bands; **"One home, three crafts"** services band (Laundry = book online, Food Delivery = app coming-soon with badges); Snacks + app-install QR band.
2. **Shop (Marketplace listing)** — filter sidebar (category / dietary / occasion + price range), sort, active-filter chips, product grid, pagination.
3. **Product detail** — gallery + thumbs, weight options, wallet-cashback line, quantity + add, add-to-hamper, gift block (message card / wrap / ship-to-recipient), description tabs + spec table.
4. **Hamper builder** — step pills; box-size picker; fill-it-up item grid with add/added states; sticky basket with capacity meter, line items, totals, cashback.
5. **Laundry** — hero (book online); service picker (wash&fold/dry-clean/ironing/cleaning, per-kg/item/hour); pickup day + slot; how-it-works; booking summary with wallet pay; app-tracking reminder band.
6. **Snacks** — channel eyebrow; category chips; snack grid (diet dots, add/added); sticky "snack list" with WhatsApp send; WhatsApp status timeline (received/accepted/out for delivery).
7. **Wallet** — balance card (pending cashback, lifetime saved); add-money amount picker + auto-top-up nudge; pay-with-wallet card; transaction history (credit/debit).

## To build (spec'd, not yet in prototype)
- **Maker/vendor storefront** page (multi-vendor) — reuse product-card grid + a store header (banner, avatar, rating, follow).
- **Gift-to-recipient** checkout variant — recipient address + hide-price toggle + gift message step.
- **Multi-address checkout** — split cart by shipping address + per-address delivery date.
- **Corporate/bulk gifting** inquiry form.
- **Laundry: two-slot** (separate delivery slot), **dry-clean photo upload**, **special instructions**, **subscription plans**, **pay-on-delivery** toggle.
- **Wishlist** page.
- **Order history** (unified Marketplace + Laundry) + **basic status** view.
- **Account / address book / support / notifications / referral** screens.
- **App promo (full meals)** marketing page.

All reuse existing tokens + components — no new visual primitives required.
