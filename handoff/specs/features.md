# Homekrafted — Product Specification

A multi-service home-craft platform. Modules share one account layer and one wallet. **Channel rules are strict** — build only what each module allows on web.

---

## Shared Platform
- **Login** — phone / email / social
- **Address book** — multiple saved addresses, default flag
- **Order history** — unified across Marketplace + Laundry (Snacks orders live in WhatsApp thread)
- **Support** — chat + call
- **Notifications** — SMS / WhatsApp / email
- **Ratings & reviews** — on products, makers, and services
- **Referral & loyalty program** — credits into wallet

## Wallet (single, cross-module)
- Add money / **auto top-up**
- Cashback & loyalty credits
- **One balance** usable across Marketplace, Laundry & Snacks
- **Instant refunds to wallet**
- Balance & full transaction history
- Pay-with-wallet on by default at checkout (Marketplace + Laundry)

## Gifting Marketplace (full e-commerce, web)
- **Multi-vendor** marketplace (not just in-house catalog)
- Artist & maker **storefronts**
- Home bakers / handmade edible sellers
- Packaged food listings
- **Hamper builder** — customisable: items, gift note, wrap style, ribbon, name card
- **Gift-to-recipient flow** — ship to someone else, **hide price**
- Occasion-based collections
- Corporate / bulk gifting **inquiry form**
- Wishlist
- Cart, **multi-address checkout**, delivery-date scheduling
- **Basic order status only — no live tracking**
- Seller onboarding *(future)*

## Laundry, Cleaning & Ironing (bookable on web)
- Service selection: wash & fold, dry clean, ironing, deep cleaning
- Pricing: **per-kg / per-item / per-hour**
- **Two-slot scheduling** (pickup + delivery)
- Item count / **photo upload** for dry-clean estimate
- Special-instructions field
- **Recurring subscription** plans
- Pay **online or on delivery**
- Basic status line on site
- **Real-time pickup/delivery tracking — in app only**

## Food Delivery
- **Full meals:** promotional section only on web — no menu / cart / checkout. Ordering & **live tracking entirely in-app**.
- **Snacks:** browsable menu **on the website**
  - Order placed by **sending selection via WhatsApp**
  - WhatsApp status updates: **order received → order accepted → out for delivery**
- **App Store / Play Store** download badges
- **QR code** for app install

---

## Channel matrix (single source of truth)

| Module | Browse web | Checkout web | Live tracking | Notes |
|--------|:---:|:---:|:---:|-------|
| Marketplace | ✅ | ✅ | ❌ (status only) | multi-vendor, multi-address |
| Laundry | ✅ | ✅ (or COD) | 📱 app only | 2-slot, subscriptions |
| Snacks | ✅ | 💬 WhatsApp | 💬 WhatsApp text | no on-site checkout |
| Full meals | promo only | 📱 app | 📱 app | web is marketing only |

Wallet spans Marketplace + Laundry + Snacks.
