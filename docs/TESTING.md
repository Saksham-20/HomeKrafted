# Homekrafted — Tester Guide

**Test site:** http://187.127.171.48

This is a staging build with demo data. Nothing here is real — no real
money moves, no real orders ship. Break things freely.

> **Note:** the site runs on plain HTTP (no padlock in the browser). That's
> expected for staging. Don't enter any real password, card, or personal
> detail — only use the demo accounts below.

**A note on names:** people who sell on Homekrafted are called
**HomeKrafters**. You'll see that word throughout the site and in this
guide. (Some web addresses still contain `/seller` — that's internal
plumbing, not a mistake.)

---

## How to log in

Go to **http://187.127.171.48/login** and use **email + password**.

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

### 6. Snacks
- **Snacks** page — browse the menu
- Ordering is **WhatsApp only** by design. There should be **no cart and no
  checkout** on the snacks pages — it should hand you to WhatsApp instead.
  If you find an add-to-cart or checkout button anywhere in Snacks, **that's
  a bug — report it.**

### 7. HomeKrafter dashboard
Sign in as any of the three HomeKrafter accounts.

Every HomeKrafter now sees **one dashboard with the same full menu**:
Dashboard, Listings, Menu, Orders, Pickups, Storefront, Payouts, Reviews.

Because the three demo accounts are set up for different kinds of business,
some modules will say **"… isn't set up for your account"**. That is
expected, not a bug. What it should look like:

| Module | Maker (Anjali) | Laundry (Ravi) | Snacks (Meera) |
|---|---|---|---|
| Dashboard | works | works | works |
| Listings | works | not set up | not set up |
| Menu | not set up | not set up | works |
| Orders | works | not set up | works |
| Pickups | not set up | works | not set up |
| Storefront | works | not set up | not set up |
| Payouts | works | works | works |
| Reviews | works | not set up | not set up |

**A module must never sit on "Loading…" forever.** It either shows real
data or the "isn't set up" card. A permanent spinner is a bug — report it
with the account and module name.

Then exercise the modules that do work for each account:

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

### 8. Admin panel
Sign in as **admin** at http://187.127.171.48/admin/login

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
| Some HomeKrafter modules say **"isn't set up for your account"** | By design — see the table above. |
| **Payments** don't really charge | Test mode. Orders complete without a real transaction. |
| **Phone/OTP login** never sends a code | SMS provider not connected on staging. |
| **WhatsApp messages** don't actually send | WhatsApp provider not connected on staging. |
| **Live delivery tracking / map** missing on web | App-only by design. Web shows a status line. |
| **No HTTPS padlock** | Staging runs on a bare IP. |
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
