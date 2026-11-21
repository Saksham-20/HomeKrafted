# Orders, checkout and money

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Food is "coming soon" (2026-09-15) — browsable, not buyable

The launch is gifting-first (owner). `PlatformSettings.foodOrdersOpen`,
flipped on `/admin/settings` with no deploy, decides whether food can be
bought. Off: the food side stays browsable, a dismissible note sits on
`/shop`, `/meal-plans` and food product/checkout pages, and a "Coming
soon" pill rides on the landing food half and the Homemade Food tab.

- **The server is the gate** (`server/src/common/food-orders.ts`): add to
  cart, reorder, `POST /orders` from a basket filled before the switch,
  and meal-plan subscribe all refuse with **409 `FOOD_COMING_SOON`**. A
  button hidden on the web is not a closed door — the native app and
  anybody with a token reach the same routes.
- **Open unless explicitly `'false'`** — the reverse of
  `commissionEnabled`. An untouched database and every test fixture keep
  selling food; closing it is a decision somebody makes and the audit log
  records. **Production needs it switched off after deploy.**
- **The web reads it once per page load** (`components/food/
  useFoodOrdersOpen.ts`) and treats "don't know" as open — no banner, the
  ordinary button — because the server refuses either way.
- **Mock mode refuses identically**, closed unless
  `NEXT_PUBLIC_FOOD_ORDERS_OPEN=true` (the one-basket rule's reasoning).
- Snacks order over WhatsApp and are not gated; that is a separate call.

## Checkout is one page, and the area question is a pincode (2026-09-16)

- **`/cart` redirects to `/checkout`.** The basket is step 1 there,
  editable in place. The two pages listed the same lines and the cart's
  only unique job was a button to the other one. It is a **redirect, not
  a deletion**: `/cart` is in shared links and the header's basket icon,
  and a 404 on that path reads as a lost basket.
- **Nothing asks a buyer to pick from a list of sectors.** The location
  prompt and the checkout confirm both take a **pincode** (or a GPS fix).
  The twenty-one curated tricity areas were a constant in the client, so
  they could only answer for the launch city — somebody in Faridabad had
  no way to say where they were, which is M36's waitlist bug on the buyer
  side. `GET /pincodes/:pincode` returns the centroid for this, and that
  is the **only** thing it may be used for: M36 forbids writing it onto
  `Vendor.lat`/`lng`, where a 12 km error hides a real storefront from its
  own neighbourhood. A buyer's position only orders the grid.

## One basket, one maker (2026-09-14)

A cart holds one `Vendor`'s things. `POST /cart/items` answers **409
`CART_OTHER_MAKER`** otherwise, naming the maker already in the basket.

- **The whole site, not only food** (owner's call over a food-only
  version). The food argument is that the cook *is* the courier — their
  own radius, prep time and working days, so two kitchens in one basket is
  two deliveries presented as one order, and `reconcileOrderStatus`
  already refuses to drive such an order forward (M57). The cost on the
  gifting half is real and was accepted: three gifts from three makers is
  three orders.
- **The refusal names the maker, and the client offers a way out.** "You
  already have items from another maker" is not actionable. The code is
  what a screen branches on (`lib/cart/add-error.ts#isOtherMakerError`),
  never the sentence — the sentence differs every time because it carries
  a name. `ProductPurchasePanel` renders an inline two-step ("Empty basket
  & add this" / "View basket"), the portal rule against `window.confirm`
  applied to a shopper screen.
- **The hamper path is gated too.** `POST /cart/hamper-items` stores
  `hamperId` with a NULL `productId`, so the plain vendor query cannot see
  it — "add a hamper, then add anything" was the way round. A new hamper
  may not span two makers either, or one cart line quietly holds what the
  rule prevents.
- **Mock mode enforces it identically.** Local dev runs with
  `NEXT_PUBLIC_USE_MOCK=true`, so a rule the mock branch skips looks
  broken to the only people who can test it, and the replace-basket branch
  is unreachable. Same code, same sentence.
- **Never cache the maker on `Cart`.** It is one more column to keep in
  step on every remove; the cart is small and the join is free.

## Meal subscriptions (M19) — the recurring product, and its money rules

`MealPlan` (what a kitchen offers) → `MealSubscription` (one buyer's
prepaid run) → `MealDelivery` (one row per meal owed). Rules that are easy
to undo by accident:

- **A cycle is prepaid, in one wallet debit. Nothing charges in the
  background.** There is no saved card and no mandate; `creditTopupTx` is
  reachable only from the verified Razorpay webhook. Adding a daily
  auto-charge without a real UPI AutoPay/e-mandate would recreate the exact
  bug M19 opened by deleting. The prepaid model also avoids the worst
  failure on a daily-food product: "lunch didn't arrive because you were
  ₹20 short."
- **The money is posted last, inside the same transaction as the
  subscription and its deliveries.** An insufficient balance throws and
  takes all of it with it. There is no state where somebody holds a
  schedule they did not pay for — the e2e asserts exactly that.
- **`MealSubscription.pricePerMeal` is a snapshot, never re-read from the
  plan.** Reading the plan fresh would protect the kitchen and silently
  change what the buyer pays mid-cycle. A rise applies at renewal, where
  they can see it.
- **Every meal is a row.** Skip, pause and a kitchen blackout are recorded
  facts, not arithmetic on a counter — which is what makes "why do I have
  11 meals left when I paid for 14" answerable.
- **A skipped meal is owed, not lost.** The cycle grows a day at the far
  end. A buyer who paid for 24 meals gets 24 meals.
- **Cancel moves no money.** Same rule as M15 returns: auto-refund would
  make the most abusable path the most frictionless, and the loss lands on
  a home cook. An admin resolves it through `POST /wallet/adjust`.
- **A paused subscription keeps its seat** against `MealPlan.maxSubscribers`;
  a cancelled one gives it back. Somebody away for a week has not given up
  their tiffin. `maxSubscribers` is also the first place a home cook's
  stated ceiling is actually *enforced* — `VendorProfile.capacityPerDay`
  has existed since M16 and is checked nowhere.
- **`isActive` (the kitchen's switch) and `moderationStatus` (the admin's)
  stay separate**, same as `Product`. Both must pass. A hidden plan 404s
  rather than 403s, on read *and* on subscribe — hiding it in the list
  while leaving the write path open is the usual half-fix.
- **`meal-brackets.ts` never reads the clock.** Every function takes `now`
  or a start date, so a Server Component can compute a window once and ship
  it as text (the M12 React #418 lesson). `bracketStart` is a label
  (`"12:30"` = 12:30–13:00), not an instant.
- **Dated menus (M37): `MealPlanDayMenu` is the promise, `weeklyMenu` the
  rotation.** A date's menu — and the buyer's skip of it — locks at
  `PlatformSettings.menuLockTime` IST **the evening before**
  (`meals/menu-lock.ts`, pure, takes `now`; lock state is computed on
  read, never stored, no scheduler). Past the lock only the audited admin
  override (`PUT /admin/catalog/meal-plans/:id/menus/:date`) may change
  it, and it still notifies — the lock stops *silent* changes, not being
  told. A *change* to a set date messages the subscribers scheduled for
  it (`meals` category); a first-time set messages nobody. A 7-line
  `weeklyMenu` reads Monday→Sunday as the per-date fallback; any other
  count opts out — never invent weekday anchoring the data doesn't have.
  A pause leaves locked rows `scheduled` (the kitchen already planned
  them; they arrive). A blackout added after subscribe now cascades:
  affected deliveries go `unavailable` with the reason, the meal moves to
  the end of the cycle (owed, not lost), and the subscriber is told.
- **Absence is not closure**, carried over from M16: no stated
  `workingDays` means open every day, and no `prepTimeMins` means the
  90-minute default, never zero.

## A HomeKrafter's own sale (M46) — whose money it is

`Vendor.discountPct` + `Vendor.discountEndsAt`, set through
`PUT /seller/discount` (its own route — `PATCH /seller/storefront` is bio,
location and artwork; this changes the price of every listing at once).

- **The kitchen funds it.** The percentage comes off the HomeKrafter's own
  base price, before the markup commission fee is added on top — so the
  discount reaches the payout 1:1 (`product.mapper.ts`: "discount first,
  then the fee", 2026-09-16) and the HomeKrafter absorbs all of it. A
  side effect worth knowing: since the fee is a percentage of the
  discounted base, Homekrafted's own commission on that line shrinks
  during a sale too — never charged on the pre-discount figure. The
  seller screen states the discount in rupees before the input. A
  platform-funded discount is a different feature with a budget attached —
  don't quietly turn this into one.
- **`catalog/vendor-discount.ts` never reads the clock.** Every function
  takes `now` (the M12 React #418 rule), nothing expires a row, and there
  is no scheduler: a lapsed sale stops the instant the date passes.
- **`discountEndsAt` is exclusive**, the seller field says "last day", and
  the client converts both ways. Don't "simplify" that by relabelling the
  field.
- **50% ceiling, refused not clamped.** It reaches every listing at once
  and it is somebody's income.
- **Three prices, two shown.** `salePrice` (paid) struck against `price`;
  `mrp` is dropped while a storefront sale runs. Two crossed-out numbers
  beside one real one reads as a trick.
- **No client computes a discounted price.** `resolveCartLine` for the
  cart, `mapProduct` for the card — one sum, server-side, so a card and a
  checkout cannot disagree.
- **`Product.cashbackPct` is not money, and now not anything.** It was
  quoted on the product page as wallet cashback while checkout credited a
  flat platform rate on the subtotal, so a 20% listing advertised four
  times what was paid; then order cashback itself was removed
  (2026-09-19, rate 0 — see "Order cashback is off"). **The flat 5% credit
  no longer exists.** The column and the DTO/type field are **inert**, kept
  only so existing values round-trip through the forms and the API; nothing
  computes or renders from it and the form has no input. Don't re-add one
  without wiring it to a real credit.

## Deliver to ISB (2026-09-17) — the one delivery we do ourselves

`server/src/common/delivery/isb-campus.ts` is the only place that decides
what campus delivery means. `Order.deliveryMode` is `standard` |
`isb_campus` (wire value **`isb-campus`**), default `standard`, and
nothing is backfilled — no order placed before this was hand-carried
anywhere.

The owner's brief: a buyer at ISB picks "Deliver to ISB", pays no
delivery cost, and we carry it onto campus as soon as the maker has
packed it. Everything else is a courier job, and the Shadowfax
production keys are still not live — so this is the one delivery path
that works end to end today without a carrier account.

- **The server writes the destination; the request never does.** A
  campus order ships to `ISB_CAMPUS_ADDRESS`, ignoring `defaultAddressId`
  and every per-item address — including a gift recipient's. Otherwise
  free hand-delivery is claimable for an address in another state: no
  fee charged, no courier booked, and the order simply never moves.
- **The fee is zero whatever the platform charges.** `deliveryFee` is an
  admin setting that happens to be 0 today; the offer has to survive
  somebody setting it to 40, so `campusAwareShippingFee` forces it.
- **No courier is ever booked, and nothing is recorded.**
  `ShippingService.bookForOrder` returns early — not a `failed`
  consignment, because nothing failed. The kitchen marks it packed, we
  collect, the order closes by hand, exactly like the food half (M57).
- **`deliveryModeFromWire` exists because the wire value is hyphenated
  and the Prisma member is not** (`isb_campus` via `@map`). Comparing a
  request value against the enum directly compiles, typechecks and is
  never true — every campus order would quietly become a standard one
  with a fee and a courier. Parse once, there.
- **One address row per buyer, not one per order.** It carries
  `ISB_ADDRESS_LABEL` and is updated with the drop detail of the order
  being placed, so a weekly buyer keeps one "ISB campus" entry.
- **It is filtered out of every picker**
  (`client/lib/checkout/campus-delivery.ts`). It has to exist as a real
  `Address` so orders, labels and old receipts render a destination — but
  picking it under "Deliver to me" would place a *standard* order to
  campus, with a fee and a courier for a parcel we were going to walk
  over. That is the same inconsistency arriving by a second door. It
  stays visible in the address book, which displays rather than chooses.
- **Both order screens say it** — "Hand-delivered on the ISB campus" for
  the buyer, "We collect this one" for the kitchen, whose part still ends
  at packed but whose screen otherwise implies a rider is coming.
- **The buyer is not asked where on campus** (owner, 2026-09-17, reverses
  the first version of this). The spot depends on who is carrying the
  parcel and what is open, neither of which is knowable while somebody is
  paying. Checkout promises a message instead
  (`CAMPUS_PICKUP_PROMISE`), an operator names it on the live order —
  `Order.pickupSpot`, via `PATCH /admin/orders/marketplace/:id/pickup-spot`
  (scope `orders`, audited, campus orders only) — and **writing it emails
  the buyer**, through the ordinary `order` category where email is on by
  default. `campusDrop` is still accepted so a client already shipped is
  not refused; the only thing still asked for is a phone, which falls
  back to the account's and is refused if there is neither.
- **Nothing invents a spot.** NULL means nobody has said yet, and every
  surface says exactly that. The packed message names the spot if one is
  set and otherwise repeats the promise — in `CAMPUS_PICKUP_FOLLOWUP`,
  not `CAMPUS_PICKUP_PROMISE`, because "once the maker has packed it" is
  right at checkout and reads as a mistake in the message announcing that
  it has just been packed.
- **The spot reaches the buyer verbatim**, the way a moderation reason
  does (M22): those words are the only thing telling somebody where to
  walk, and a notification layer paraphrasing them sends them to the
  wrong gate. Re-sending is allowed and notifies again — a gate closes, a
  rider is rerouted, and a silent correction is worse than a second
  message.
- **ISB is the only destination checkout offers (2026-09-20, owner).**
  `client/lib/checkout/destinations.ts` holds `DESTINATION_OPEN`: "Deliver
  to me" and "Send as a gift" render **disabled with a "Coming soon"
  pill**, and ISB is what a buyer arrives on. `resolveDestination` reads
  the stored pick through the layout and the flags, so a stale `me`/`gift`
  (the initial state, or the product page's gift intent) lands on ISB, and
  the **food layout, which has no campus control, reads `isb` as `me`** — a
  food basket must never be placed as a free campus order the screen never
  offered. Reopening one is a flip in that map; all open is the old
  screen. **It is the web's gate only:** `POST /orders` still takes a
  standard order and the native app has no ISB option, so refuse it
  server-side (the `foodOrdersOpen` shape) only once both offer ISB.
  **Known gap:** step 3's gift wrap and message card travel only with
  "Send as a gift" (`giftWrap: isGift ? …` and `gift` in
  `handlePlaceOrder`), so on an ISB order they are shown and not saved.

## A dashboard figure is not a row count (2026-09-17)

**Every order is written at `pending_payment` before it is paid**, and
the cart is emptied in the same transaction — so every buyer who opens
the payment sheet and closes it leaves a row behind carrying a full
basket total nobody paid. Four figures summed those rows: a kitchen's
"Today's revenue" and "Today's orders", platform GMV and its daily
series, and the seller analytics revenue series. Measured with one paid
₹640 order and one abandoned checkout for the same item, the kitchen's
dashboard read **₹1,280**, and dev-DB GMV overstated by ₹4,084 (35%).

`server/src/common/orders/order-money.ts` is the one place that decides,
in both a Prisma `where` and a `$queryRaw` fragment. **Never inline the
status list at a call site** — the defect was four call sites each
deciding for themselves and three deciding nothing.

- **`COUNTED_ORDER_STATUSES` answers "did an order happen?"** —
  everything a buyer actually placed, cancellations included.
- **`REVENUE_ORDER_STATUSES` answers "is this money?"** — the same set
  less `cancelled`, because a cancellation refunds the buyer. `returned`
  stays in: a return moves no money on its own, an admin resolves it, so
  dropping it would understate what a kitchen is owed.
- **Neither is the payout rule.** `SellerPayoutsService` still pays on
  `delivered` alone and remains the authority on money actually earned;
  these two say what a *dashboard* may claim, which is looser and more
  immediate ("nothing delivered yet today" is not "you sold nothing").
- A cancelled order also leaves `topItems`/`unitsSold` alone — a refunded
  order must not make a listing look like a bestseller.

## Trust & money loops (M15) — don't quietly reopen these

Phase 1 of `docs/PRODUCTION-AUDIT.md` closed five loops that had been
built from one end only. Each carries a rule that is easy to undo by
accident:

- **A review needs a delivered order.** `POST /reviews` refuses anything
  else. Don't relax it to "any signed-in user" for testing convenience —
  an open review endpoint on a platform built on trusting a stranger's
  kitchen is a review-bombing surface. Seed a delivered order instead.
- **Denormalised aggregates are recomputed from rows, never
  incremented** — `Vendor`/`Product`/`Seller` `rating`+`reviewCount`
  (`ReviewAggregatesService`) and `Vendor.followerCount`. Any new path
  that hides, un-hides or deletes a review **must** call the recompute,
  or a moderator's action silently doesn't apply.
- **Cancellation closes at `packed`; returns close 7 days after
  `deliveredAt`.** Both are enforced server-side; the UI only decides
  what to *offer*. `deliveredAt` is stamped wherever an order reaches
  `delivered` (seller advance, admin override) — a new transition path
  has to stamp it too or the return window silently falls back to
  `placedAt`.
- **A return request moves no money.** An admin resolves it. Auto-refund
  would make the most abusable path the most frictionless, and the loss
  lands on a home cook.
- **Order cashback is off (2026-09-19, owner: "remove cashback from
  wallet").** `CASHBACK_RATE = 0` in `server/src/common/pricing/pricing.util.ts`
  is the switch, **kept at 0 rather than deleted**: `Order.cashbackEarned` is
  a checkout *snapshot*, and both the credit (`payWithWallet`,
  `markPaidByRazorpayTx`) and the reversal (`cancelOrder`, `refundOrder`)
  read the snapshot, never the constant. Deleting one half while a
  non-zero-snapshot `pending_payment` order exists pays or claws back money
  the other half never moved — so an order quoted a cashback before the
  removal is credited if paid and reversed if cancelled, symmetrically. The
  client and mobile shared pricing no longer export
  `CASHBACK_RATE`/`computeCashback` (pinned by a spec); no screen computes
  or promises a figure and the loyalty perks promise none. The enum value
  `WalletTransactionCategory.cashback` stays (legacy rows, and the 3%
  top-up bonus is filed under it). `cashbackEstimate`, `cashbackEarned`,
  `pendingCashback`, `lifetimeSaved` and `walletCashback` still return
  (0 or legacy) because installed native builds read them. **`lifetimeSaved`
  is a frozen running total of cashback** — no server code writes
  `LoyaltyAccount` from it, so it never drove a loyalty tier.
  `WalletBalanceCard` is the balance and nothing else.
- **A cancellation *does* refund — and must reverse any cashback the order
  was promised (legacy-only since 2026-09-19).** Cashback landed at
  `placed`; refunding the total while leaving it meant place-then-cancel
  paid the buyer, repeatably (M22). New orders snapshot `0`, so the reversal
  only fires for an order placed before 2026-09-19 or one pending payment at
  the deploy — keep it. Any new path that gives money back owes the same
  question: what else did placement hand over?
- **An order is refunded through the order's own endpoint, never by
  crediting the wallet (M26).** `POST /admin/orders/:type/:id/refund`
  flips `Order.refundStatus`, takes an `Idempotency-Key`, refuses an
  unpaid order and is audited. `POST /admin/wallet/:userId/refund` does
  none of that — the admin order screen used it for months, so the same
  order could be refunded again the next day and three clicks credited
  three times (measured: ₹2,749 → ₹7,246 on a ₹1,499 order). The wallet
  endpoint is for an adjustment that is genuinely not an order refund.
  **Any new money button owes an idempotency key minted once per
  operation, not per click** — a per-click key does nothing for the retry
  that a timeout provokes.
- **`POST /admin/payouts/:id/pay` records a settlement, it does not
  perform one.** There is no payout provider. The `reference` is the only
  link to a real transfer. Both payout decisions are one-way.
- **A customer replying to a `resolved` ticket reopens it** — the admin
  queue's "waiting on us" count depends on that being true.
