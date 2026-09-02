# Plan — M60: meal-subscription calendar & customisation, and chef lead time

Two owner requests (2026-09-02). Planned against what already exists —
both are smaller than they sound, because M19/M37 built most of the
subscription machinery and M16 built the lead-time column.

---

## A. Meal plans: weekly/monthly subscriptions, calendar, customisation

### What already exists (don't rebuild)

- `MealSubscription.daysOfWeek Int[]` — **"Monday to Saturday only" is
  already a column and already a picker** on the subscribe form
  (`MealPlanSubscribeClient`: day-of-week toggle row, defaults Mon–Fri).
- `MealSubscription.bracketStart` — **"dinners only" is already the
  bracket picker** on the same form; a subscription pins one 30-minute
  window.
- `mealCount` is chosen at subscribe (currently free presets, default
  12); price = `pricePerMeal × mealCount`, one prepaid wallet debit,
  rows + money in one transaction. **None of the M19 money rules change.**
- Every meal is a `MealDelivery` row; skip/pause/blackout are recorded
  facts; a skipped meal is owed at the far end; dated menus lock the
  evening before (`menu-lock.ts`).

### Gap 1 — weekly/monthly framing

`mealCount` presets don't speak the buyer's language. Reframe the picker
as **cycle options computed from the chosen days**:

- "1 week" → `daysOfWeek.length × 1`, "2 weeks" → ×2, "1 month" → ×4
  (plus keep a custom count for the buyer who wants exactly N).
- Pure function `cycleOptions(daysOfWeek, now)` in `lib/meal-brackets.ts`
  style — takes `now`, never reads the clock (React #418 rule).
- No schema change. No auto-renewal — a cycle stays prepaid and renewal
  stays a buyer action (M19: nothing charges in the background; a
  "renew" nudge notification when ≤2 meals remain is the most this adds,
  category `meals`, not `promo`).

### Gap 2 — the calendar

Buyer's subscription detail shows a list of deliveries today. Add a
**month-grid calendar**:

- Each cell renders its `MealDelivery` state: scheduled / skipped /
  blackout ("kitchen closed — moved to the end") / delivered /
  unavailable, plus the day's menu where a `MealPlanDayMenu` exists.
- Skip/unskip is a tap on a future, **unlocked** cell — lock state
  computed on read via `menu-lock.ts`, never stored. Locked cells say
  why ("menu locked yesterday 8pm").
- Client component over server-shipped data; all date math in a pure
  helper taking `now` (the M12 rule). Dialog/focus rules per the a11y
  floor if any popover is used — prefer inline cell expansion, no
  dialog.
- Kitchen side gets the mirror later (their day's cook-list already
  exists on `/seller`); not in this milestone.

### Gap 3 — per-day customisation ("Tuesdays veg only")

New table, kitchen-visible preference, **not** an enforcement engine:

```
model MealSubscriptionDayPref {
  id             String @id @default(cuid())
  subscriptionId String
  weekday        Int      // 0 = Sunday, same convention as daysOfWeek
  pref           MealDayPref  // veg | no_onion_garlic | light | note
  note           String?  // free text, shown to the kitchen verbatim
  @@unique([subscriptionId, weekday])
}
```

- Set at subscribe and editable from the subscription screen; a change
  applies from the **next unlocked day** (locked menus are already
  planned — the M37 lock stops silent changes in both directions).
- Surfaces on the kitchen's cook-list per delivery row and on the
  delivery's detail. The kitchen honours it; the platform records it.
  Auto-checking "is this menu veg" against a free-text menu would be
  invented enforcement — don't.
- Notification on change to the kitchen, category `meals`.

### Order of work

1. `cycleOptions` helper + subscribe-form reframe (client only, ½ day).
2. Calendar grid on subscription detail (client + one API read that
   already exists, 1–1.5 days).
3. `MealSubscriptionDayPref` — migration, DTO (`@BooleanField` rules,
   `forbidNonWhitelisted`), subscribe + edit endpoints, kitchen
   cook-list surfacing (1–1.5 days).
4. Docs: API.md, DATA-MODEL.md, TESTING.md; e2e for pref-edit-past-lock.

---

## B. Chef-set order lead time, visible to buyers

### What already exists

`VendorProfile.prepTimeMins` (M16) — seller edits it on
`/seller/profile`, `lib/schedule.ts` already suppresses slots inside the
lead window (`availability.prepTimeMins ?? 90`), and the storefront's
`KitchenProfile` mentions it. **The column, the enforcement seam and the
seller write path all exist.** Absence = 90-minute default, never zero.

### Gaps

1. **Seller UX**: a raw minutes number. Replace with presets the client
   named — "2 hours / 5 hours / 12 hours / 1 day / 2 days" (+ custom) —
   still writing `prepTimeMins`. No schema change.
2. **Buyer visibility** (the actual ask — "should be visible"):
   - Product page: "⏱ Order at least 5 hours ahead" line near
     add-to-cart, derived from the vendor's `prepTimeMins` by a pure
     formatter (`leadTimeLabel(mins)` — "5 hours", "1 day"; ships as
     text from the server component, no clock).
   - Kitchen card on `/shop`: same label as a small meta line.
   - Cart/checkout: the slot picker already hides too-soon slots; add
     the sentence saying *why* the first offered slot is tomorrow
     ("Anjali's Kitchen needs a day's notice") — name the right party,
     never the buyer's expectations.
3. **Server enforcement**: verify order-create refuses a slot inside
   `now + prepTimeMins` (today only the picker suppresses; the API
   should refuse too — UI decides what to *offer*, the server enforces,
   the M15 pattern). One guard in `OrdersService`, one e2e.
4. **Per-product override** (`Product.leadTimeMins?`) for cakes vs
   snacks from the same kitchen — phase 2, only if kitchens ask; the
   vendor-level value covers the stated requirement.

### Order of work

1. `leadTimeLabel` helper + product page / kitchen card / checkout copy
   (½–1 day).
2. Seller preset picker (¼ day).
3. Server-side slot refusal + e2e (½ day).
4. Docs per the upkeep table.

---

## Explicitly not doing

- Auto-renewal / mandates (M19 rule — no background charges).
- Enforcing "veg" against menu text (recorded preference, not a parser).
- A `GET /kitchens` or any new browse endpoint (M51 rule).
- Refund arithmetic changes — skip/pause/cancel money rules stay M19's.
