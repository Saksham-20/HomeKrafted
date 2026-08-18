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

**Buying is Chandigarh tricity; selling is national (M36).** Every live
kitchen sits in a real tricity area — Chandigarh sectors, Mohali,
Panchkula, Zirakpur — and you only see food from kitchens that deliver
to *you*. The site asks for your area on your first visit (skipping is
fine — you still see everything, sorted rather than hidden). Applying to
**sell**, though, works from any Indian pincode — see the `/sell`
section further down; the two are different on purpose.

> **Accounts were reset.** If you tested before 30 July, your old account,
> orders and wallet balance are gone. Sign in again with the demo accounts
> below.

---

## How to log in

Go to **https://homekrafted.in/login**.

**There is one field now (M25).** Type an email address *or* a mobile
number into the first box — the form works out which it is and relabels
itself as you type — then the password, then **Continue**. The same screen
signs you in and creates an account; `/signup` is the same page. There are
no Shopper/HomeKrafter tabs and no Phone/Email tabs any more, and where
you land afterwards is decided by the account, not by anything you picked.

A bare Indian mobile number works: `9845012345` is understood as
`+919845012345`, and both reach the same account.

All demo accounts share the same password:

```
Passw0rd!123
```

**There are no longer any "continue as demo ___" buttons.** They were
removed in M17: those buttons carried the seeded emails *and the shared
password* inside the public JavaScript bundle, so anyone could read the
admin credentials with view-source. The accounts below are unchanged —
type the email and password into the ordinary form like a real user
would, which is also what makes this a real test of sign-in.

### Testing the one-time code

Codes now go to **either** channel — SMS for a number, email for an
address — but neither provider is connected, so a real code is written to
the server log and nowhere else. To make that path testable there is a
**fixed test code**:

| Field | Value |
|---|---|
| Code | `123456` |
| Works for | only the demo phone numbers below |

| Account | Phone |
|---|---|
| Shopper (Ananya) | `+919845012345` |
| HomeKrafter (Anjali) | `+919876543210` |
| HomeKrafter (Ravi) | `+919822011223` |
| HomeKrafter (Meera) | `+919008033445` |

Type the number, click **Use a code instead**, then enter `123456`.

Three things it deliberately will **not** do, and all are worth trying:

- **Any other number is refused.** `123456` on a number not in that list
  gets "Incorrect code" — it is not a master key, because code sign-in
  creates an account for a number it doesn't recognise.
- **It never signs in an admin.** The admin account uses email and
  password only.
- **It never works for an email address**, whatever is in the allowlist —
  that list is checked against phone numbers only.

This matters beyond convenience: a one-time code is genuinely the *only*
way a newly-approved HomeKrafter signs in (see "A brand-new HomeKrafter"
below), because approval never sets a password. Worth testing directly:
enter an approved HomeKrafter's number **with any password at all** and
the form should tell you the account has no password yet and switch to the
code step by itself — not say "incorrect password".

### Forgot password

`/forgot-password` is live. Email delivery isn't connected, so the reset
link is written to the server log rather than sent — the flow itself
(single-use token, one-hour expiry, all sessions signed out afterwards) is
real and testable from there. The page says "if an account exists" for
every address, including ones that don't: that's deliberate, not a bug.

You should arrive **logged out**. If you land already signed in as someone,
that's a bug — report it.

---

## Demo accounts

| Role | What they see | Email |
|---|---|---|
| **Shopper** | The normal customer site — browse, cart, checkout, wallet, orders | `ananya.iyer@example.com` |
| **HomeKrafter — maker** | Seller dashboard for a food/craft maker | `anjali@anjaliskitchen.example` |
| **HomeKrafter — ex-laundry** | Same seller dashboard. Kept because this account has historical pickups, and its past orders must still render now that laundry is withdrawn | `ravi@freshfoldlaundry.example` |
| **HomeKrafter — snacks** | Seller dashboard for a snack seller | `meera@meerassnackbox.example` |
| **HomeKrafter — crafts** | A gift maker rather than a kitchen. Their listings are on `/gifts`, and most post nationally | `studio@theslowstudio.example` |
| **HomeKrafter — crafts** | The second gift maker — jewellery, art and personalised pieces | `hello@maatiandthread.example` |
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

An admin can do the same round trip: "View site" in the admin top bar
goes to the shop, and the shop header shows a shield icon ("Switch to
admin panel" on hover; a labelled row in the phone drawer) to come back.

**Check the dashboard greets you as the right kitchen.** Signing in as
`meera@meerassnackbox.example` must say *Meera's Snack Box*, not
Anjali's. Until M17 every real (non-seeded) HomeKrafter was shown a
seeded demo kitchen's name and storefront link, because the portal
resolved the seller record from mock data.

### A brand-new HomeKrafter

The demo accounts above are seeded *with* passwords. A kitchen that comes
through the real application flow is not:

1. Apply at `/sell`. The form confirms on the page and the application
   lands in the admin queue.
2. An admin approves it at `/admin/sellers` → **Approval queue**.
3. Approval mints a **single-use set-password link, valid 7 days**, and
   sends it by email and SMS. Opening it gives "Set your password"; after
   saving, they sign in and land in `/seller` under their own name.
4. **On a server with no email or SMS keys, nothing is sent — and the
   admin screen says so**: "Approved — but we could not reach them",
   with the link shown so it can be handed over by hand. That is the
   expected state today, not a bug. `POST /admin/sellers/:id/resend-invite`
   re-sends and burns the previous link.
5. **M32 — approval also issues a username and a short temporary
   password**, shown on the approval banner so an admin can read them
   out. **M37 — it is shown exactly once.** Nothing stores the plaintext,
   so note it down before leaving the page; afterwards the row says
   "Issued ‹date›, not yet used" and offers **Re-issue**, which mints a
   fresh password (killing the previous one and any open sessions) and
   shows the new one — once. Do the onboarding call with the panel open,
   or re-issue at the start of it. The moment that kitchen signs in and
   chooses their own password, the row flips to "Signed in" and the
   control disappears for good. If such a HomeKrafter is genuinely locked
   out, use **Resend invite** — that sends a set-password link to them,
   rather than giving whoever is at the admin screen a working password.
6. **The filter above the list has three states**, and they are worth
   knowing apart. **No sign-in yet** — no password exists at all, so
   there is nothing to read out; every HomeKrafter approved before M32 is
   here, and their row offers "Create sign-in details". **Details
   issued** — a credential exists and has not been used; the password
   itself is not re-readable (M37 — re-issue if it was lost). **Signed
   in** — they chose their own, and we hold nothing that opens the
   account.

**The `/sell` form asks more, and refuses less usefully (M32).** It now
checks as you go: an email address typed into "Business / maker name"
says so under the box, and so does a phone number — that field becomes
the storefront name on every product card, and two live storefronts are
named after somebody's email because it used to accept anything. The city
question is gone; it is derived from where you say you are, which is the
field that actually decides where buyers see you. New optional questions:
Instagram, website, years making, orders a day, and — only if you say you
make food — an FSSAI number. Everything optional can be left blank; the
licence is recorded, never verified (a verified badge is still an admin
decision).

**You can now apply from anywhere in India (M36).** The form asks for a
**pincode** instead of picking from a list of twenty-one Chandigarh,
Mohali, Panchkula and Zirakpur areas. Type six digits and it echoes back
the district and state — "134109" should show *Panchkula, Haryana* — which
is the only way to catch a transposed pair on a form with no address
lookup. A pincode we don't recognise says so and names it; a valid one we
simply couldn't check (our API being down) still lets you submit, because
the server checks it again.

**What changed underneath, and why it matters for testing.** Before M36,
anyone outside those 21 areas picked "Somewhere else", which filed the
application as **waitlisted** — and waitlisted applications could not be
approved by anybody, from any screen. If you tested this before and found
Approve did nothing on such a row, that was the bug, not your session.
Those older rows still exist and still show the out-of-area warning, and
they now carry an **area picker on the row itself** so you can resolve and
then approve them.

**The form now asks where a rider should collect from (M36b), and
promises buyers never see it.** Under the pincode there is an address
block — house/street, area, landmark, and an optional second phone —
closed by a note saying shoppers see only your area, never your street.
Worth checking that the promise holds: open any storefront while signed
out and you will find the area label ("Sector 35, Chandigarh") and no
address anywhere. The address appears in exactly two places, both behind
a login: the admin verification panel and the HomeKrafter's own
**/seller/profile → "Where we collect from"**. A HomeKrafter approved
before this shipped has none on file, and both screens say so rather
than showing an empty box.

**A HomeKrafter can change their own address (M36c).** `/seller/profile`
→ **Where we collect from** is editable. Worth testing the consequence:
if their **Kitchen address** shows as verified, saving a changed address
clears that badge, and the hint under the fields says so before you save.
That is deliberate — we verified the old address, so the new one has to
be checked again. Editing anything else on the page (a return policy,
hours) leaves the badge alone.

**A HomeKrafter can pin their kitchen's exact spot (2026-08-18).**
`/seller/profile` → **Your kitchen's exact spot** has a "Use my current
location" button: the browser asks for location, and the fix becomes the
kitchen's coordinates — the ones behind delivery-distance sorting. Things
to test: the pin is **private** (open the storefront signed out; the page
and its API payload only ever carry a ~1 km rounded point); saving a pin
clears the **Kitchen address** verification, and the status line says so;
a pin far from the kitchen's registered pincode is refused with the
distance in the message (simulate with browser dev-tools sensor override
— set a location in another city); denying the browser prompt shows an
instruction, not a dead button; and until someone pins (or an admin sets
coords), the profile completion meter lists "Pin your kitchen's exact
spot" as missing.

**Applying is national; delivering is not.** Approving a HomeKrafter in
Jaipur works and is meant to. Whether buyers there can order is a separate
setting (`Serviced areas` under `/admin/settings`, currently the tricity),
and a buyer outside it still sees the whole catalogue — we tell them we
don't deliver there yet rather than showing an empty page.

**Approving someone outside the tricity may ask you to check the map.**
For a pincode covering a wide area, approval says *"Check where we put
them on the map"* and links to their record. This is not an error — the
kitchen is live — but a pincode's centre can be ten kilometres or more
from a specific kitchen, and that distance decides which buyers see them
at all. Open the record and set the exact spot.

**The approval queue flags people who already have an account (M32).**
Somebody who does not hear back and applies again leaves a second row in
the queue. Approving it has always failed — one account per person — but
the failure only arrived after the click. The row now says *Already a
HomeKrafter*, names the storefront they have, and the Approve button is
disabled. Reject the duplicate, or help them into the account they have.

**Click a HomeKrafter's name for their whole record (M32).**
`/admin/sellers/[id]` — contact details, storefront, listings (on vs
total vs awaiting review), orders, their share of sales, payouts waiting,
verification, sign-in details while they are still pending, and the
application they were approved on. Sales there are the kitchen's
**line-item share**, not the order total: one order can span several
kitchens.

**What to check on the forced change (M32).** Sign in with an issued
password: you should land on `/set-password`, not the dashboard, and
every other page should refuse you (the API answers `403
PASSWORD_CHANGE_REQUIRED` — that is the gate working, not a bug). After
saving a new password you continue straight into `/seller` without
signing in again, the old password stops working, and the admin panel no
longer shows one.

Approval used to leave the account with **no** password at all, on the
rule that an admin must never set one. M32 reversed that, because with no
provider keys the link reaches nobody and the rule was leaving every real
kitchen with an account and no door. The substance is preserved by the
forced rotation above: the admin's copy stops working the moment its
owner arrives. Restore the old behaviour once SendGrid/Twilio are set.

A one-time code also remains a valid way in: the sign-in form is one
field, and `/auth/continue` answers **409** for an account with no
password, which the form turns into the code route automatically. "Use a
code instead" is visible before any failure, deliberately.

Two ways this has actually broken, both worth re-checking if a newly
approved kitchen cannot reach `/seller`: before M17 the form offered only
email and password, so a real kitchen was told "Incorrect email or
password" for a password that had never existed; and until this was walked
end to end on 2026-08-10, `/sell` itself told every applicant *"your
storefront opens once HomeKrafter onboarding launches"* — the flow worked,
the page said it did not.

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

### 5. Laundry — withdrawn, and worth checking it stayed withdrawn
Laundry, Cleaning & Ironing is **no longer offered** (M19). There is
nothing to book. What to confirm instead:

- There is no **Laundry** link in the header, the mobile drawer or the
  footer
- Typing `/laundry` straight into the address bar gives a **404 page**,
  not a blank screen and not a redirect to home
- A demo account with an **old booking still sees it** in
  `/account/orders`. Hiding a service must never erase what somebody
  already paid for — if a past booking has vanished, report it. The
  booking detail names its services and slots without the old catalogue
  (M37 — those labels now ride on the booking itself).
- The support bot's greeting no longer offers laundry, but asking it
  about a laundry pickup gets an honest "no longer offered" answer that
  points at `/account/orders` (M37).

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

### 6c. Meal plans — the subscription (M19/M20)

This is the one that moves real money, so be thorough. Open **/meal-plans**
(also linked from the home page band, "Ghar Ka Khana, Every Day").

- Pick a plan → check the price says **per meal** for a breakfast/lunch/
  dinner plan and **per delivery** for anything else (a monthly box)
- Choose your meals, your days and a 30-minute window
- **The total must be visible before you press the button.** If you can
  commit money without seeing what it costs, that's a bug — report it
- Pay → you should land on **/account/subscriptions** with the new plan on it

Then, from **/account/subscriptions**:

- **Expand "See every meal".** Each upcoming meal should say **what food
  arrives** (M37) when the kitchen has set that day's menu, or the
  weekday line of a 7-line rotation. If the kitchen set tomorrow's menu,
  it should be here — verbatim
- **Skip a meal.** The meal should come back at the far end — your end date
  moves out by a day. You paid for N meals, you get N meals. If skipping
  loses you a meal, **that's a bug**
- **Try to skip tomorrow's meal after the lock** (default: after 8pm the
  evening before). The Skip button should read **"Being planned"** and
  refuse — the kitchen is already cooking against that list. Being told
  no with the reason is correct; a silent dead button is a bug
- **Pause**, then **resume**. Your wallet balance must not move either way.
  If tomorrow's meal was already locked when you paused, it **still
  arrives** — the confirmation message says so
- **Cancel.** This also moves no money — a refund is something we do by
  hand, on purpose. The screen should say so rather than implying a refund
  is coming

Worth trying to break:

- Subscribe with **not enough balance** — it should refuse cleanly and you
  should end up with **no** half-made subscription sitting in your account
- **Double-tap the subscribe button** — you must not be charged twice
- Pick a **window the kitchen doesn't offer** (if you can get the app to
  send one) — it should refuse
- Subscribe to a plan that is **full** — it should say so, not fail oddly

### 7. HomeKrafter dashboard
Sign in as any of the three HomeKrafter accounts.

Every HomeKrafter now sees **one dashboard with the same full menu**:
Dashboard, Analytics, Listings, Menu, Meal plans, Orders, Storefront,
Profile, Payouts, Reviews. (Pickups is off the nav — laundry is withdrawn —
but the screen still exists and the dashboard links to it if you have a
booking still in flight.)

**All three accounts have the same modules working.** There is one role,
so any HomeKrafter can add food. Pickups is the exception now: laundry is
withdrawn, so that screen only ever shows history.
The "isn't set up" card should no longer appear for any of the three demo
accounts — if you see it, report it.

**The big one to test: adding your own items.**

- Open **Listings** (or **Menu**) → add an item, with a price and a photo
- It should appear on **/shop** (or the Snacks menu) for shoppers in range
- On the **Dashboard**, the "Today's menu" panel lists everything you sell
  with an on/off switch. Above the stat cards, a work strip (M37) shows
  "N meals to cook today" and "N orders waiting to be confirmed" when
  either is non-zero, each linking to the screen that clears it; if the
  profile states a daily capacity, a line compares today's load against
  it. If loading your items fails, the panel now says so with a Retry —
  it must never claim "you haven't added anything yet" over a hiccup.
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

**Listing a handcrafted gift (M20).** Open **Listings → Add listing**.

- The first question is now **"What are you listing?"** — Homemade food or
  Handcrafted gift
- Pick **Handcrafted gift**. The dietary chips and the snacks-menu tick
  should **disappear** — a candle has no dietary tags. If you're still
  asked whether your earrings are gluten-free, report it
- The **category** dropdown should now only offer gift categories (Candles
  & Home, Handmade Jewellery, Art & Prints, Personalised Gifts). Switch
  back to food and it should offer the food ones instead
- **"How does it reach the buyer?"** — pick *I post it anywhere in India*.
  That listing should then be visible to shoppers **outside** your delivery
  distance, unlike your food. This is the difference the Gifts page is
  built on, so it's worth confirming
- Save → it should appear on **/gifts**, not in the food shop

**Meal plans — the other big one (M20).** Open **Meal plans**.

- **Add plan** → note the "What kind of plan is this?" row. Breakfast,
  lunch and dinner are three of the four choices; the fourth is
  **Something else**, and it's a peer, not a footnote. A monthly pickle box
  is an ordinary thing for a kitchen to sell
- Pick **Something else**, name it ("Monthly pickle box"), set a price →
  save. On **/meal-plans** it should read **₹N / delivery**, not "/ meal"
- Now edit it. The page should tell you **how many delivery windows** the
  plan offers. A meal plan gets its mealtime window (about 6); a
  "something else" plan gets your whole opening hours (about 24)
- **If it says no delivery windows, that's the thing to check.** It means
  your opening hours (on **Profile**) don't overlap the meal — and nobody
  can subscribe until they do. It should say that in as many words
- **Day-by-day menus (M37).** Edit a plan → below the form is
  **"Day-by-day menus"**: the next 14 dates, each editable until it locks
  at the platform's lock time the evening before (default 8pm; Admin →
  Settings changes it). Set tomorrow's dishes and save — if anyone is
  subscribed and scheduled for that date, the panel names how many, and
  a *change* to an already-set day messages them ("Menu changed for…").
  A locked day renders read-only saying so. Buyers see the set menus on
  the plan page ("This week, dated") and against each meal on
  /account/subscriptions
- Set a **subscriber limit**, then have somebody subscribe up to it — the
  plan should show as full and stop taking people
- Press the **power icon** on a plan. It should tell you plainly that the
  people already on it keep their meals — closing stops *new* subscribers
  and nothing else. If it reads like "delete", report the wording

**Coming up** is the queue of meals you owe, newest day first, with the
customer, their address and a call button.

- **Mark one delivered.** That is the only thing that spends a meal from
  somebody's cycle — a skipped meal is still owed
- Mark the same one twice (two tabs) — the second should say it's already
  done, not silently double-count
- **All N meals →** opens the full fortnight

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
- Open **/sell** and fill in the application. It asks which **area** your
  kitchen is in and **what you'll offer**. Delivery distance is now
  **optional** — behind "Set a delivery distance"
- The category list now starts with **Home chef (food)**, and there are no
  laundry or cleaning options
- Submit it, then sign in as **admin** → **HomeKrafters** → review queue
- Approve it, and check a new kitchen appears with the right area
- The new HomeKrafter should get a welcome notification

**Leave the delivery distance alone on one application.** After approving
it, the kitchen should still have a sensible delivery radius — the platform
fills one in. If it ends up with no radius, or everyone gets exactly 10 km
regardless of the setting in **Admin → Settings**, report it.

**Then try an out-of-area application.** Pick **"Somewhere else"** as the
area and type a city we don't serve (e.g. "Model Town, Ludhiana"):

- The confirmation should say **you're on the list**, not "we'll email you
  once a decision is made". Being told to expect a decision that cannot
  come is the bug here
- In the admin review queue the row should be flagged as outside the
  tricity, showing what they typed
- **Pressing Approve should refuse**, with a message naming the place. If
  it approves, report it immediately: that kitchen would then show up as
  being right in the middle of Chandigarh for every buyer
- An admin should be able to assign a real area to it, after which
  approving works normally

**Break the forms on purpose.** Turn off your wifi and submit **/sell** and
**/corporate**. Both should tell you the submission failed. Previously they
said nothing at all and the button just became clickable again — if you see
that, report it.

### 7c. Corporate &amp; bulk enquiries (M20)

Two sides. Start on **/corporate** as a shopper (no login needed).

- Note the new **"What kind of order is this?"** row — Corporate gifting or
  Bulk order. They're different conversations, and the admin queue shows
  which is which
- Submit it. Then sign in as **admin** — you should have a **notification**
  about it. Until M20 the form wrote a row and told nobody, and nothing
  read the table
- **/admin/corporate** should list it, with a count of how many nobody has
  worked yet
- Submit the form six times quickly. It should start **refusing** — that's
  a deliberate rate limit on an unauthenticated form

Then open the enquiry as an admin and **build a quote**:

- Add a line. Every line needs a **HomeKrafter**, even a fully custom one
  ("Custom Diwali hamper"). Try saving without one — it should refuse, and
  say why
- Set a delivery fee and tax. The **total updates before you save** — you
  shouldn't have to create a quote to find out what it says
- Create the draft, then **Send**. That emails the customer a link
- Try to **edit a sent quote** — it should refuse. Somebody is looking at
  the old number; withdraw and raise a new one

Now the customer's side — **open the link in a logged-out browser** (or a
private window). This is the highest-stakes screen in the build:

- There should be **no login wall and no sign-up prompt**. Procurement will
  not make an account to accept a quote
- It should say who it's from, who it's for, the lines, and a **Total
  payable** — not a subtotal dressed up as a total
- **Accept** takes two steps: a typed name and an "I'm authorised" tick.
  One tap on a phone is too easy to do by accident for five figures
- Open the same link again. It should show **"Accepted by …"** as a normal
  state, not an error
- **Read it on a phone.** The line table should stack, not scroll the page
  sideways

Worth trying to break:

- **Change one character of the token** in the URL — it should 404, and
  look exactly like a link that was withdrawn
- Have an admin **Withdraw link**, then reload the customer's page — same
  404, identical wording
- **Re-send** a quote, then try the *old* link — it should be dead
- Accept, then check **/admin/orders**. There should be **no new orders**.
  That's deliberate: accepting agrees a price, it doesn't start
  fulfilment. An admin places the orders once there's an address and
  payment terms, and the admin screen says so

### 8. Admin panel
Sign in as **admin** at https://homekrafted.in/admin/login

- **Dashboard** — the top card is the needs-attention queue (M37): one
  row per thing waiting on an admin (applications, listings to approve,
  support tickets waiting on us, payout requests, new corporate
  enquiries, flagged listings), each with an Open button; "Queue clear"
  when nothing is. Also on `/shop` as a shopper: filter yourself into
  zero results — the empty state names the filters and offers **Clear
  filters**; and on a phone, a product page's Add to cart follows you in
  a sticky bottom bar once the in-page button scrolls away.
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
- **Settings** holds the commission rate (plus its on/off switch — M37,
  below), the default delivery radius, the serviced-area prefixes and the
  meal-menu lock time. Every change is written to the audit log with its
  before and after.

> While the commission switch is **off** (the shipped default), the rate
> is estimates only — payouts are gross and settlement is manual, and
> every screen showing a figure says so. Feature flags are deliberately
> *not* on the settings screen; the page explains why.

### Commission engine (M37)

The platform can now actually deduct its take rate, behind a switch that
ships **off**. To walk the whole loop:

1. As a HomeKrafter with delivered orders, open **Payouts**: a breakdown
   card shows unclaimed earnings, the commission at the configured rate
   and the net — labelled *"estimate — nothing is deducted yet"*. The
   listing editor shows the same arithmetic live under the price tiers
   ("Customer pays ₹450 → commission (10%) ₹45 → you receive ₹405"),
   with the inverse ("to take home X, price at Y").
2. Request a payout: it arrives **gross**, and the admin queue's banner
   says every figure is the full order value.
3. As admin, **Settings → "Deduct commission from payouts"** on, save
   (audited). The payouts banner flips: new rows arrive net.
4. Request another payout as the HomeKrafter: the row now shows its own
   split — gross − commission (rate) — on both the seller history and
   the admin queue, and the amount to settle is the net. Rows from step
   2 keep their gross figure untouched: nothing recalculates a request
   already made.

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

- **[Occasions](https://homekrafted.in/collections)** is new — the
  home page's occasion grid's "View all" used to dump you on `/shop`.
  Since M35 it also holds the third desktop nav slot (it swapped with
  Gift Hampers, which moved to the home quick-entry strip).
  It has three parts: **Coming up** (dated occasions, soonest first, with
  a countdown), **Gift guides**, and **Any time of year** (birthdays,
  thank-yous — no date, so no countdown).
- Dated occasions on staging are Raksha Bandhan, Karwa Chauth and Diwali.
  A countdown inside two weeks turns terracotta.
- **Gift guides** now have their own pages, e.g.
  [/guides/first-time-gifting](https://homekrafted.in/guides/first-time-gifting).
  Guides do not have to belong to an occasion — that one deliberately
  doesn't.
- The **home page** shows a seasonal band above the occasion grid when
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
- **"What you make"** (M33), the first card on the page. Tick a second
  category — say a food kitchen adding **Candles & fragrance** — and save.
  It saves on its own button, separately from the profile below it. Things
  to check: no second application and no approval wait; the tag shows on
  your storefront and in the buyer-side filters straight away; and if you
  tick **Homemade food** on a craft-only account, the **FSSAI licence
  number** field appears further down the same page the moment you save
  (untick every food category and it goes again). Adding a category
  doesn't publish anything — each individual listing still goes through
  the review queue.
- Visit **/sell** while signed in as a HomeKrafter. It should tell you
  you're already selling and point at Profile, rather than inviting a
  second application. The form still works if you genuinely want one.

> The trust score is never shown as a bare number to buyers. What they
> see is a tier ("Trusted kitchen") and every check behind it, met and
> unmet. A score with no working shown isn't something a shopper can act
> on.

---

## Things that are deliberately off — don't report these

| Thing | Why |
|---|---|
| **No "build your own hamper"** anywhere | Removed in M18. A hamper is now a listing a HomeKrafter assembles and prices; `/hamper` lists those. If you see a wizard, you're on an old build. |
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
| **Every gift on `/gifts` shows a hatched placeholder** | We hold no photography for the craft makers and won't generate any — the rule is real photos, real uploads, or the placeholder. They'll fill in as makers upload their own. |
| A gift showing **"delivers to your area"** rather than posting | Not every craft posts. Shipping is set per listing, not per maker — the heavy stoneware is deliberately local while the prints and jewellery post nationally. |
| Accepting a corporate quote creates **no order** | By design. Acceptance agrees a price; an admin places the orders once there's a delivery address and payment terms. The schema has no way to express a corporate order today, and faking one would put uncollected money into a home cook's payout queue. |
| The quote email **doesn't arrive** | Email provider isn't connected on staging. The link is in the server log — ask whoever's running the box. |
| Anjali's **Menu** has a snack marked **"Needs a change"** | Seeded on purpose. It is the one demo listing an admin has rejected, so the screen that shows a HomeKrafter *why* something is off the site is actually on screen somewhere. The reason under it is the admin's words, verbatim. |
| The seller's mode switch in the header is an **icon with no label** | It reads "Switch to selling" on hover and to a screen reader. The labelled version was 147px wide and pushed the cart icon off the right of the screen. The drawer below 1190px still spells it out. |
| Signing in as a HomeKrafter shows the **portal instantly, with a grey pill where the kitchen name goes** for a beat | By design as of 2026-08-11. The name arrives from its own request; the pill is the honest "still loading". What you must **never** see in that beat: the "Sign in as a HomeKrafter" wall (that was a bug — it told a signed-in cook their sign-in had failed), the word "undefined", or a *different* kitchen's name. Report any of the three. The Continue button also stays busy until the portal paints — a second click should be impossible. |
| The header nav shows only **three links** | By design as of 2026-08-13. It was six, and the row (capped at 1092px by the page container) could not also fit a usable search box — the field rendered as a small circle you had to click open. The nav now carries the three catalogues; **Occasions, Meal plans, Corporate & bulk and Snacks on WhatsApp are the four tiles directly under the hero** on the home page, and all six are in the hamburger drawer below 1190px. The search should be a **full, typable box at rest** — if it is a circle again, or if it changes size when you click it, that is a regression worth reporting. |

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
