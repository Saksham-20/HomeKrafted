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
- Open a **HomeKrafter storefront** from a product, and **Follow** it —
  the follower count should move, the button should still say "Following"
  after a reload, and the shop should be listed under
  `Account → Following` (unfollow from either place)
- **Occasion collections** (e.g. from the home page)
- **Wishlist** — add/remove, check it survives a page reload
- **Search** — the box in the header (and inside the mobile menu below
  ~840px). Try a product word ("pickle"), a HomeKrafter's name, and an
  area ("Sector 35"); results split into Products / HomeKrafters /
  Snacks. Two words should narrow, not widen. Search for nonsense and
  check the empty state offers a way back to browsing.
- **Broken links** — try a URL that doesn't exist (e.g. `/product/nope`,
  `/storefront/nope`, or any nonsense path) and check you get a
  Homekrafted 404 with a way out, not a blank page

### 2. Shopper — buy something
- Add items to **cart**, change quantities, remove a line
- Go through **checkout**: pick an address, pick a delivery date, place the order
- Pay with **wallet balance**, and separately try **Card / UPI** — the card
  route is test mode, no real charge and no real card details needed
- Check the order appears under **Account → Orders**
- Open the order and check the status/timeline reads correctly
- On a **delivered** order, use **Order this again** — it should put the
  same items back in your cart and take you there. If something has sold
  out or the HomeKrafter has paused it, the page should *say so by name*
  rather than quietly leaving it out. (Ask an admin to pause an item on
  a delivered order if you want to see that case.)

**Cancelling and returning**
- Open an order that is still **placed** or **confirmed** and use
  **Cancel this order**. Check the money comes back to your wallet, the
  status reads Cancelled, and the reason you typed is shown back to you.
- Try the same on an order that's already **shipped** — it should refuse
  and tell you to request a return instead.
- On a **delivered** order, use **Request a return** and write what went
  wrong. It should say someone is looking at it — **it should not refund
  you on the spot**, that's deliberate. Ask an admin to check the request
  appears on the order in the admin panel.
- Seeded delivered orders are old, so the 7-day return window may have
  closed on them — that refusal is correct. Place and complete a fresh
  order to see the window open.

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
- Support page — raise a ticket, then check it appears under **Your
  tickets** on that same page with the message you sent
- **Reviews** (`Account → Reviews`) — Ananya has two delivered orders, so
  a few items should be listed under "Waiting for your review". Write
  one: pick stars, add a headline and a couple of sentences, post it.
  Then check
  - the item leaves the waiting list and appears under "Written by you"
  - the review shows on that product's page with a **Verified purchase**
    badge, and the product's rating has moved
  - reviewing the same item twice is refused with "You have already
    reviewed this"
  - "Write a review" on a product you have *not* had delivered is refused
    with a message telling you to wait for delivery — that refusal is
    correct behaviour, not a bug

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

- Open **Listings** (or **Menu**) → add an item, with a price and a photo
- It should appear on **/shop** (or the Snacks menu) for shoppers in range
- On the **Dashboard**, the "Today's menu" panel lists everything you sell
  with an on/off switch
- Switch something **off** → it should vanish from the shopper side
  immediately. Switch it back on → it returns.
- This is the thing a cook does every day, so be rough with it

**Photos are real uploads now.** Anywhere you see a photo box you can
**drag an image onto it**, click it to browse, or paste one from the
clipboard. It should show a progress bar, then the picture itself.

Worth trying to break:

- Drag a **PDF, a .txt, or a Word doc** in — it should refuse, politely
- Drag a **very large photo** (over 5MB — most phone photos are under it,
  a DSLR shot won't be) — it should say it's too large, not fail silently
- Upload, then hit **Remove**, then upload a different one
- Do it on your **phone** — tapping the box should open your camera roll
- Upload, save, then open the item as a shopper — the photo should be there
- **Dry-clean booking** takes several photos at once — try dropping 3-4
  together

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
- **Support** — the dispute queue. As a shopper, raise a ticket from
  `/support` first. Then here: it should appear under "Waiting on us",
  open it, read the thread, write a reply, and mark it resolved. Back as
  the shopper, `/support` → **Your tickets** should show your reply
  thread with a "Reply" badge, and you should be able to write back —
  which reopens a resolved ticket, by design.
- **Payouts** — the HomeKrafter earnings queue. Sign in as a HomeKrafter
  first and request a payout from their **Payouts** screen, then come
  back here: the request should appear under Pending. Try both
  **Mark paid** (add a made-up bank reference) and **Decline** (you have
  to give a reason). Then check the HomeKrafter's own Payouts screen —
  paid should show the reference, declined should show your reason.
  Trying to decide the same payout twice should be refused.
  > "Mark paid" **does not send money** — the platform has no bank
  > integration. It records a transfer someone made by hand. That's
  > deliberate, not a missing feature.
- **Verification (M16)** — on **HomeKrafters**, press **Verify** on any
  row. The panel shows the FSSAI number they submitted, how complete
  their profile is, and a link to their live storefront. Tick a check,
  write a note, save. Then look at that HomeKrafter's storefront: the
  badge should appear next to their name and in "What we know about…".
  Sign in as them and their Profile screen should show your note.
  Untick it again and the badge should come straight off.
- **Analytics** — dashboard charts

### Keyboard and screen readers (M16)

- Press **Tab** on any page. The first thing to appear should be a
  **"Skip to content"** link — press Enter and focus should jump past the
  header into the page body.
- Open the **mobile menu** (below ~840px) and press Tab repeatedly:
  focus should stay inside the menu and wrap round. **Escape** closes it,
  and focus should return to the hamburger button — not to the top of
  the page.
- The same applies to the **"Where should we deliver?"** prompt on a
  first visit. Escape there counts as "skip", so you won't be asked
  again.
- With the menu **closed**, tabbing through a page should never walk
  through the menu's links. (It used to.)

### Admin reports, exports and settings (M16)

- **Analytics** has range chips (14 / 30 / 90 days). Every figure and the
  chart follow the range.
- **Export CSV** gives you real file downloads for orders, HomeKrafters
  and payouts, covering the selected range. Open one in Excel or Sheets —
  names with commas, quotes and accents should come through intact, and a
  phone number like `+91…` appears with a leading apostrophe. That is
  deliberate: a cell starting with `+` or `=` is treated as a formula by
  every spreadsheet, and the apostrophe is what stops one running.
- **Settings** holds the commission rate and the default delivery radius.
  Both used to be constants in source. Every change is written to the
  audit log with its before and after.

> The commission figure on Analytics is **modelling only** — payouts are
> gross and settlement is manual, so nothing is being deducted. It is
> there so "what would 12% have earned last quarter" is answerable.
> Feature flags are deliberately *not* on the settings screen; the page
> explains why.

### Pre-order and days off (M16)

The delivery-time picker used to offer every kitchen the same slots with
the same 90 minutes' notice. Now it follows the kitchen.

As a HomeKrafter, on **Profile → How you work**:

- **Days you cook** sets the weekly pattern. Leave every day off and you
  are treated as open every day — never as closed. A kitchen that has
  filled in nothing must not silently stop taking orders.
- **Preparation time** is how much notice you need. Set it to 2880
  (48 hours) and the next two days should stop being offerable.
- **Days off** takes specific dates with an optional reason. Adding the
  same date twice updates the reason rather than erroring.

Then look at that kitchen's storefront:

- **"Next available"** in the facts strip skips days you are closed.
- A **"Days … is closed"** panel lists the dates ahead, with your reasons.
- On the delivery picker, a closed day is **struck through and cannot be
  picked**, and its reason is in the tooltip and read out by a screen
  reader. It is deliberately still shown — a date that simply isn't there
  reads as a bug.

> Past days off stay on your own list but are not published. The horizon
> is 14 days, up from 7 — a kitchen needing 48 hours' notice and taking
> Sundays off had barely three pickable days in a week.

### HomeKrafter analytics (M16)

New **Analytics** tab in the HomeKrafter portal, right after Dashboard.
It answers the two things the portal never did: which item earns, and
which days are busy.

- Range chips switch between 7 / 30 / 90 days. The chart stays on screen
  while a new range loads rather than blanking.
- **"You earned" is your share of each order, not the whole basket.** If a
  shopper's order contained items from two kitchens, each of you sees only
  your own lines. That is the figure payouts are worked out from, so it
  should match what you are actually paid.
- "no earlier period" instead of a percentage means there was nothing in
  the previous window to compare against — not that nothing changed.
- A dash on "Ordered again" means there aren't enough orders yet to
  work out a rate.
- With no orders in the window, you get a short explanation rather than
  empty charts.

### Occasions and gift guides (M16)

- **[Gifts by occasion](https://homekrafted.in/collections)** is new — the
  home page's "Shop by occasion → View all" used to dump you on `/shop`.
  It has three parts: **Coming up** (dated occasions, soonest first, with
  a countdown), **Gift guides**, and **Any time of year** (birthdays,
  thank-yous — no date, so no countdown).
- Dated occasions on staging are Raksha Bandhan, Karwa Chauth and Diwali.
  A countdown inside two weeks turns terracotta.
- **Gift guides** now have their own pages, e.g.
  [/guides/first-time-gifting](https://homekrafted.in/guides/first-time-gifting).
  Guides do not have to belong to an occasion — that one deliberately
  doesn't.
- The **home page** shows a seasonal band above "Shop by occasion" when
  the nearest dated occasion is within six weeks. If nothing is close, the
  band is absent — that is correct, not a missing element.

Admin: **Collections → Occasions** is where dates get set. Worth trying:

- Set a date, save, and check the hub countdown moves.
- Clear a date and the occasion drops out of "Coming up" into "Any time of
  year".
- Push a date more than six weeks out and the home band disappears.

> Festival dates are set by hand, on purpose. Diwali and Raksha Bandhan
> are lunisolar — they land on a different date every year — so there is
> no "repeats yearly" setting to tick. Somebody rolls them forward.

### HomeKrafter profiles (M16)

The storefront is now the page a buyer reads *before* deciding to trust
a kitchen. Three states are seeded so you can see all of them:

- **[Anjali's Kitchen](https://homekrafted.in/storefront/anjalis-kitchen)** —
  a full, verified profile. Story, kitchen photos, "usually ready in",
  working days, hygiene and packaging notes, cancellation and return
  policies, verified badges, and a "What we know about…" panel listing
  every trust check with the real number behind it.
- **[Home Batch](https://homekrafted.in/storefront/home-batch)** — half
  filled in, licence submitted but **not** checked. The badge must
  **not** appear, and the trust panel should say "Licence submitted,
  awaiting check".
- **Any other kitchen** (e.g. Crunch Corner) — no profile at all. You
  should see a plain storefront plus the trust panel, and **no** empty
  "Story"/"Inside the kitchen" sections. A blank profile should look
  like a simpler page, not a broken one.

As a HomeKrafter, the new **Profile** tab in the portal is where all of
that is written. Worth checking:

- The completeness meter at the top names what is still missing in plain
  words. Fill something in, save, and the meter and the list should both
  move.
- The three verification rows are **read-only** — you cannot tick your
  own. That is the point: a badge you can award yourself is worth
  nothing to a buyer.
- Change your FSSAI number and save. Any existing verification should
  drop off, and the trust score with it — a changed licence has not been
  checked. An admin has to look again.
- Kitchen photos drag/drop or click to upload, up to 12.

> The trust score is never shown as a bare number to buyers. What they
> see is a tier ("Trusted kitchen") and every check behind it, met and
> unmet. A score with no working shown isn't something a shopper can act
> on.

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
| Product photos show a **hatched placeholder** in some slots | Nobody has uploaded a photo for that item yet — add one and it replaces the placeholder. |
| The **video reel rail** always shows the same clips | Reels aren't wired to the backend yet — they come from fixed sample data. |
| Web addresses containing **`/seller`** | Internal naming; the visible wording is HomeKrafter. |
| The home page has **no seasonal band** | Nothing dated is within six weeks. The band is not permanent furniture. |
| An occasion with **no countdown** on the hub | It has no date set — birthdays and thank-yous have no season. |
| A kitchen with **no story or photos** on its storefront | Nobody has filled that profile in yet. Sections with no content are hidden rather than shown empty. |
| **"0 orders delivered"** on a well-rated kitchen | Ratings are seeded demo data; delivered-order counts are real. They will disagree on staging until orders are actually placed. |

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
