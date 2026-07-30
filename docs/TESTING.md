# Homekrafted — Tester Guide

**Test site:** https://homekrafted.in

This is a staging build with demo data. Nothing here is real — no real
money moves, no real orders ship. Break things freely.

> **Note:** the site is on its real domain with HTTPS now, so you'll see a
> padlock. It's still a staging build with demo data — don't enter any real
> password, card, or personal detail. Use the demo accounts below.

**A note on names:** people who sell on Homekrafted are called
**HomeKrafters**. You'll see that word throughout the site and in this
guide. (Some web addresses still contain `/seller` — that's internal
plumbing, not a mistake.)

**Everything is Chandigarh tricity now.** Every kitchen sits in a real
area — Chandigarh sectors, Mohali, Panchkula, Zirakpur — and you only see
food from kitchens that deliver to *you*. The site asks for your area on
your first visit.

> **Accounts were reset.** If you tested before 30 July, your old account,
> orders and wallet balance are gone. Sign in again with the demo accounts
> below.

---

## How to log in

Go to **https://homekrafted.in/login** and use **email + password**.

All demo accounts share the same password:

```
Passw0rd!123
```

**Don't use "login with phone / OTP."** The SMS provider isn't connected on
staging, so the code is never delivered — you'd be stuck. Email + password
only.

You should arrive **logged out**. If you land already signed in as someone,
that's a bug — report it.

---

## Demo accounts

| Role | What they see | Email |
|---|---|---|
| **Shopper** | The normal customer site — browse, cart, checkout, wallet, orders | `ananya.iyer@example.com` |
| **HomeKrafter — maker** | Seller dashboard for a food/craft maker | `anjali@anjaliskitchen.example` |
| **HomeKrafter — laundry** | Seller dashboard for a laundry partner | `ravi@freshfoldlaundry.example` |
| **HomeKrafter — snacks** | Seller dashboard for a snack seller | `meera@meerassnackbox.example` |
| **Admin** | Full admin panel — all users, HomeKrafters, orders, wallets | `admin@homekrafted.example` |

Password for every one of them: `Passw0rd!123`

Each role should land in the right place after signing in:

- Shopper → `/account`
- HomeKrafter → `/seller` (the dashboard)
- Admin → `/admin` (the admin panel)

If any of them drops you on the ordinary shopper pages instead, that's a
bug worth reporting.

A HomeKrafter account can also shop as a normal customer in the same
session — look for "Switch to shopping" in the dashboard top bar. Worth
testing both directions.

---

## What to test

### 0. Location — do this first
Open the site in a **fresh browser window** (or clear site data).

- You should be asked **"Where should we deliver?"** on the first visit
- Try **Use my current location** (allow it), and separately try **picking
  an area** from the list
- Also try **Skip for now** — you must still be able to browse everything.
  Nothing should be locked behind sharing your location.
- Once an area is set, **/shop** and **/snacks** should only show food from
  kitchens that deliver there
- Pick an area far from most kitchens (say Kharar) and confirm the list
  gets shorter, not broken
- At **checkout**, there's a "Delivering to …" band — check it matches, and
  that you can change it

### 1. Shopper — browse
Sign in as **Ananya**.

- Home page — banners, category tiles, the video reel rail
- **Shop** — filter and sort products, open a product page
- Open a **HomeKrafter storefront** from a product
- **Occasion collections** (e.g. from the home page)
- **Wishlist** — add/remove, check it survives a page reload
- **Search** and empty states (search for nonsense, see what shows)

### 2. Shopper — buy something
- Add items to **cart**, change quantities, remove a line
- Go through **checkout**: pick an address, pick a delivery date, place the order
- Pay with **wallet balance**, and separately try **Card / UPI** — the card
  route is test mode, no real charge and no real card details needed
- Check the order appears under **Account → Orders**
- Open the order and check the status/timeline reads correctly

### 3. Shopper — wallet
- **Wallet** page — balance, transaction history
- Pay for an order using wallet balance, then confirm the balance dropped
- Check cashback lands after payment
- Try to overspend (pay for something costlier than your balance) — it should
  refuse cleanly, not crash

### 4. Shopper — account
- Profile — edit name, phone
- Addresses — add, edit, set default, delete
- Notifications
- Referrals — referral code and sharing
- Support page

### 5. Laundry
- **Laundry** page — services and pricing
- Book a service: pick a slot, pick a date, confirm
- Check the booking shows in your orders
- Live tracking is **app-only** — on the web you should only see a status
  line, not a map. Confirm that's what you get.

### 6. Snacks — including pre-order
- **Snacks** page — browse the menu
- Add a few things, then use the **delivery window** picker to choose a day
  and time
- Send the list on WhatsApp and check the message includes a
  `Requested for: …` line matching what you picked
- Ordering is **WhatsApp only** by design. There should be **no cart and no
  checkout** on the snacks pages — it should hand you to WhatsApp instead.
  If you find an add-to-cart or checkout button anywhere in Snacks, **that's
  a bug — report it.** (The delivery-window picker is not a checkout — it
  just tells the kitchen when you want it.)

**Worth poking at:** the picker should never offer a time that's already
gone. If it's 3pm, you shouldn't be able to pick 9am today. If it's late
evening, today may disappear entirely and it should start at Tomorrow.

### 6b. Full meals — pre-order
- Open **/app-promo** (Food Delivery)
- Full meals are still app-only, so there's no menu here — but you can
  **pre-order**: pick a time and send it on WhatsApp
- Check the message carries your preferred time

### 7. HomeKrafter dashboard
Sign in as any of the three HomeKrafter accounts.

Every HomeKrafter now sees **one dashboard with the same full menu**:
Dashboard, Listings, Menu, Orders, Pickups, Storefront, Payouts, Reviews.

**All three accounts now have all eight modules working.** There is one
role, so a laundry HomeKrafter can add food, and a cook can take pickups.
The "isn't set up" card should no longer appear for any of the three demo
accounts — if you see it, report it.

**The big one to test: adding your own items.**

- Open **Listings** (or **Menu**) → add an item, with a price and a photo path
- It should appear on **/shop** (or the Snacks menu) for shoppers in range
- On the **Dashboard**, the "Today's menu" panel lists everything you sell
  with an on/off switch
- Switch something **off** → it should vanish from the shopper side
  immediately. Switch it back on → it returns.
- This is the thing a cook does every day, so be rough with it

**A module must never sit on "Loading…" forever.** A permanent spinner is a
bug — report it with the account and module name.

Then exercise the rest:

- Dashboard summary numbers
- **Listings / Menu** — create a new one, edit an existing one
- **Orders** — open an order, move it through its statuses
- **Pickups** — open a pickup, update it
- **Payouts** — earnings and payout history
- **Reviews** — customer reviews, and replying to one
- **Storefront** — edit your public shop page, then view it as a shopper

**Important:** a HomeKrafter must only ever see their **own** data. If you
can see another HomeKrafter's orders, listings, or payouts, **stop and
report it immediately** — that's the most serious kind of bug on this list.

### 7b. Becoming a HomeKrafter
- Open **/sell** and fill in the application — it now asks which **area**
  your kitchen is in, **what you'll offer**, and **how far you'll deliver**
- Submit it, then sign in as **admin** → **HomeKrafters** → review queue
- Approve it, and check a new kitchen appears with the right area
- The new HomeKrafter should get a welcome notification

### 8. Admin panel
Sign in as **admin** at https://homekrafted.in/admin/login

- **Users** — list, open a user, see their detail
- **HomeKrafters** — review applications, approve/reject
- **Orders** — every order across all HomeKrafters and all modules
- **Catalog** — hide/unhide, flag, feature a product
- **Reviews** — moderate reviews
- **Collections** — create and edit collections, promo slots
- **Wallet** — view and adjust a user's wallet
- **Analytics** — dashboard charts

---

## Things that are deliberately off — don't report these

| Thing | Why |
|---|---|
| **Gift hamper builder** shows a "coming soon" page | Held before launch on purpose. Every link into it points at the coming-soon page. |
| **Full meals** has no menu — promo page only | By design on web. Meals are app-only. |
| **Snacks** has no cart/checkout | By design — WhatsApp ordering only. |
| **Payments** don't really charge | Test mode. Orders complete without a real transaction. |
| **Phone/OTP login** never sends a code | SMS provider not connected on staging. |
| **WhatsApp messages** don't actually send | WhatsApp provider not connected on staging. |
| **Live delivery tracking / map** missing on web | App-only by design. Web shows a status line. |
| Product photos show a **hatched placeholder** in some slots | Real photography hasn't been shot for those items yet. |
| The **video reel rail** always shows the same clips | Reels aren't wired to the backend yet — they come from fixed sample data. |
| Web addresses containing **`/seller`** | Internal naming; the visible wording is HomeKrafter. |

---

## How to report a bug

Please include:

1. **Which account** you were signed in as (e.g. "HomeKrafter — laundry, Ravi")
2. **The page URL** — copy it from the address bar
3. **What you did**, step by step
4. **What you expected** vs **what happened**
5. A **screenshot**, if it's a visual problem

Also worth checking as you go: try it on your **phone** as well as a laptop.
The layout should adapt down to a narrow phone screen without anything
overlapping, cut off, or sideways-scrolling.

---

## If the site is down

It may just be restarting. Wait a minute and reload. If it's still down,
report it with the time you tried.
