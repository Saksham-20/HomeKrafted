# Tests

M17. Before this there was no test of any kind in either package: every
rule shipped in M15/M16 had been *verified by measurement* against a
running API, and none of it was guarded against being undone.

```
cd client && npm test          # no setup
cd server && npm test          # no setup
cd server && npm run test:e2e  # needs a database (below)
cd e2e    && npm test          # needs the app running (below)
```

CI runs all four plus typecheck, lint and both builds — see
`.github/workflows/ci.yml`. The browser suite is its own job, because it
needs the app running against a seeded database.

CI also runs a **schema drift check** (M23), which is not a test file:

```
cd server && SHADOW_DATABASE_URL=postgresql://.../scratch npm run prisma:check-drift
```

It fails when `prisma/schema.prisma` says something the migrations do not.
That gap is invisible to every layer below, because `prisma generate` reads
the *schema* — so a model edit with no migration behind it gives you correct
types, a correct client and a fully passing suite, and then simply never
reaches production, where a deploy runs `migrate deploy`. It needs an empty
database to build the comparison in and drops the schema there, so point
`SHADOW_DATABASE_URL` at a scratch database and never at a real one.

---

## The four layers, and why each one exists

**1. `client/lib/**/*.spec.ts` — pure functions (no DOM, no network).**
The modules that decide what the app is allowed to do: the schedule
generator, the channel matrix, occasion grouping, geo, currency and date
formatting, SEO metadata. `testEnvironment: node`; nothing renders React.

**2. `server/test/unit/` — pure functions and services with a stub Prisma.**
CSV escaping, the trust/achievements/completion model, availability
defaulting, settings parsing and validation. Prisma is stubbed only where
the logic under test doesn't touch it.

**3. `server/test/e2e/` — a real Nest app, a real Postgres, real HTTP.**
Every rule worth guarding on this server is enforced *by a query* — a
review needs a delivered order, a seller sees only their own rows, a
return window counts from `deliveredAt`. A mocked Prisma would let those
tests pass while the query said something else entirely, so there are no
mocks here at all.

**4. `e2e/` — Playwright, a real browser, the running app (M23).**
The layer that opens a page. Added because the 2026-08-07 audit found a
whole class of defect that passed all three layers above: a Save button
that did nothing and said nothing on fifteen screens, Place order charging
three times for three clicks, product cards focusable and un-openable from
a keyboard, and two dialogs announcing `aria-modal` while trapping no
focus. None of that is visible without a rendered DOM, a real click or a
status line. See `e2e/README.md`.

### What is deliberately not tested

**Component rendering in isolation.** jsdom plus Testing Library plus a
Next mock surface, mostly asserting that markup still looks like markup.
Where DOM behaviour genuinely matters, the browser layer is the honest
tool and it is now there.

---

## Running the e2e suite locally

It needs an **empty database of its own**. The suite truncates between
specs and never creates the database, which is what stops it being
pointed at working data by accident.

```bash
createdb homekrafted_test
cd server
export TEST_DATABASE_URL="postgresql://$USER@localhost:5432/homekrafted_test"
npm run test:e2e:setup     # prisma migrate deploy
npm run test:e2e
```

`TEST_DATABASE_URL` is read by `test/e2e/env.ts`, which also raises the
rate-limit budgets and pins every outbound provider to its stub, so a run
can never send a real WhatsApp message or charge a real card.

> The repo's own `homekrafted` database is on a divergent migration
> lineage and will not accept `migrate deploy` cleanly. Never point
> `TEST_DATABASE_URL` at it — use a separate database, as above.

`npm run test:e2e:setup` doubles as a check that the migration lineage
still applies cleanly to an empty database, which is otherwise something
that only breaks during a deploy.

### Nothing else may be connected to the test database

`resetDatabase` truncates every table in one statement, which needs an
ACCESS EXCLUSIVE lock on all of them at once. Any other session reading
any table holds that off — so a dev server left pointing at
`TEST_DATABASE_URL` does not merely slow the suite down, it blocks the
reset and the failure surfaces as `Exceeded timeout of 30000 ms for a
hook` on whichever test ran next.

That is a real diagnosis, not a hypothetical: a stray
`ts-node src/main.ts` left running for two days against the test database
stalled one reset for 151 seconds and was reported as a failure in an
unrelated RBAC assertion. The reset now sets `lock_timeout = '5s'` and
names the cause instead of hanging, but the fix is still to stop the other
process. Find it with:

```sql
SELECT pid, state, query FROM pg_stat_activity WHERE datname = current_database();
```

Match a `pid` back to its owner with `lsof -nP -p <node-pid> -iTCP | grep 5432`.

---

## Running the browser suite locally

It drives the **running app**, so both servers have to be up against a
seeded database that can be thrown away. One of the specs writes an
address to the demo shopper's account (and deletes it again), so never
point this at anything real.

```bash
# 1. A seeded database and the API
cd server
export DATABASE_URL="postgresql://$USER@localhost:5432/hk_browser"
createdb hk_browser
npx prisma migrate deploy
# All four. The first three are the demo catalogue; without `seed-crafts`
# and `seed-meal-plans`, `/gifts` and `/meal-plans` render empty and read
# as product defects. `seed-browser-orders` exists only for this stack —
# see below.
npx ts-node prisma/seed.ts
npx ts-node prisma/seed-crafts.ts
npx ts-node prisma/seed-meal-plans.ts
npx ts-node prisma/seed-browser-orders.ts
PORT=4100 CLIENT_ORIGIN=http://localhost:3100 SITE_URL=http://localhost:3100 \
  THROTTLE_LIMIT=100000 THROTTLE_AUTH_LIMIT=100000 npm run start:dev

# 2. The web app, pointed at it
cd client
# NEXT_PUBLIC_SITE_URL matters: unset, `lib/seo.ts` falls back to
# https://homekrafted.in and every canonical on this local build points at
# production.
NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1 \
  NEXT_PUBLIC_SITE_URL=http://localhost:3100 PORT=3100 npm run dev

# 3. The tests
cd e2e
npm install && npx playwright install --with-deps chromium
npm test
```

**Raise the throttle, or the sweep measures nothing.** `server/.env` ships
`THROTTLE_LIMIT=20` (the code default is 120), and `node e2e/sweep.mjs` is
174 page-visits back to back — it trips the limiter within seconds and the
API starts answering "Too many requests" to the *server-side* fetches, so
routes render their error boundary instead of the page. This cost two
whole sweep runs on 2026-08-10 before it was diagnosed, and the second one
was thrown away silently: a Next error boundary can render on a **200**,
so those rows printed `ok`. The sweep now flags that as `ERRBOUNDARY`
(M28-004), but the limit still has to be raised or the run is not
coverage. The limiter itself is tested separately and does not need
exercising here.

**`seed-browser-orders.ts` is for this stack only, and is not part of the
demo dataset.** `seed.ts` plus the laundry bookings and snack orders come to
21 rows; `DEFAULT_ORDER_PAGE_SIZE` is 25. So `/admin/orders` reads "Page 1
of 1", and the spec that searches for an order deliberately buried on page
2 waits forever for a "Next" button that is correctly absent. It adds 20
`HKB*` orders, removes only its own rows on a re-run, and stays out of
`seed.ts` because those rows would otherwise appear in every tester's
order history and every screenshot.

**A green run is not proof the suite ran.** `auth.setup.ts` is a setup
project both viewport projects declare in `dependencies` — when it fails,
they **skip**, and the reporter prints "0 failed". That is how the whole
browser layer sat dead from M25 (which deleted the two-tab login form the
fixture was driving) until 2026-08-08. Check the test *count*, not just the
absence of failures. The form's selectors now live in one place,
`e2e/fixtures/sign-in.ts`, which throws a diagnosis rather than timing out.

`e2e/README.md` covers the layout and the two mistakes that cost the most
time writing it — `isVisible()` not waiting (a skipped test looks exactly
like a passing one), and every consumer page rendering two `aria-modal`
dialogs.

---

## The sweep — `e2e/sweep.mjs` (M26)

Not a test suite; a **measuring instrument**, and it fails nothing. It
opens every route in `docs/route-inventory.tsv` in every role that can
reach it, at 1280 and 390 — 172 page-visits — and records per visit: axe
violations, horizontal overflow, dead links (`href="#"`), heading-order
jumps, `h1` count, broken images, unlabelled inputs, undersized pointer
targets, console errors and — mobile only — **text controls under 16px**
(`inputzoom`, M29: the size at which iOS Safari zooms on focus and does not
zoom back), with a screenshot each.

```bash
./scripts/qa-up.sh                      # same stack the browser suite uses
cd e2e && node sweep.mjs                # → .qa-shots/{desktop,mobile}/*.png + sweep.json
node sweep.mjs --only=/shop             # while iterating on one screen
node sweep.mjs --viewport=mobile
```

**Use it before calling a visual change done.** `a11y.spec.ts` guards the
eight routes in `e2e/tests/public-routes.ts` (seven until M27, when that
list and `presentation.spec.ts`'s were merged — they had quietly
disagreed); this one covers all 87, which is how M26 found 114 contrast
failures on the other eighty. It complements the browser suite
rather than replacing it: Playwright asserts *behaviour* and fails the
build, this measures *presentation* across everything and produces a
shortlist for a person to look at.

Three things in it are load-bearing and easy to break:

- **It seeds `hk_location_v1` in localStorage *and* the `hk_loc` cookie.**
  The cookie alone leaves the location modal over every screenshot — the
  first run photographed the same dialog 172 times.
- **It scrolls each page before measuring**, or every below-fold lazy
  image reads as broken.
- **It models WCAG 2.5.8's inline and spacing exceptions.** Without them
  every `mailto:` in a paragraph and every well-spaced checkbox is
  reported, and one false positive per page buries the real findings.

## Login timing — `e2e/login-timing-dom.mjs` (M30, extended M31)

The other instrument, and the one to reach for before claiming a sign-in
got faster. It signs a shopper and a HomeKrafter in twice each and reports
four numbers per run, measured **in the page** rather than through a
Playwright locator — the harness's selector resolution added ~470ms to
M30's first figures and sent that investigation down the wrong road.

```bash
node e2e/login-timing-dom.mjs                                   # local QA stack
LOGIN_TIMING_BASE=https://homekrafted.in node e2e/login-timing-dom.mjs   # production
```

- `destination-h1` — the heading naming the kitchen; needs `GET /seller/me`.
- `stats` — the first StatCard (`data-testid="stat-card"`); needs
  `GET /seller/dashboard`. **These are different requests**, and reporting
  only the heading made it impossible to say which one was slow. It is
  also what proved the paint gate on `/seller/me` costs nothing: the
  record lands ~30ms before the figures do.
- `sign-in-wall-flash` — `none`, or the ms at which the wall appeared.
  Anything but `none` is the M30 regression.
- The `seller/me landed` / `seller/dashboard landed` line — response
  times, so a slow *request* and a late *issue* are distinguishable.

Reference figures on the local production build after M31: shopper ~64ms,
HomeKrafter ~90ms (it was ~385ms before, nearly all of it a `loading.tsx`
Suspense throttle — see M31 in `CHANGELOG.md`). The argon2 change does not
show locally, where the machine has cores to spare; measure it on the
1 vCPU box.

## What the suite actually guards

Grouped by the rule, not by the file, because the rules are the point.

| Rule | Where |
|---|---|
| The OTP test code only works for allowlisted numbers, and never for an admin | `e2e/otp-bypass.e2e-spec.ts` |
| Suspension bites on the next request, not the next login; the OTP guess budget is per phone, not per issued code; an unexpected error doesn't describe itself to the client | `e2e/auth-hardening.e2e-spec.ts` |
| A reset link is single-use, expiring, session-revoking, and not an account-existence oracle | `e2e/password-reset.e2e-spec.ts` |
| Approval hands the HomeKrafter a working way in: a single-use 7-day set-password link sent out of band, the link never in the audit log, a duplicate application refused rather than 500ing, and re-sending kills the older link | `e2e/seller-invite.e2e-spec.ts` |
| No route file writes the brand into its own title — the root layout's `title.template` already appends it | `client/lib/seo-titles.spec.ts` |
| A new listing is `pending` and reachable from **nowhere** — not the shop, storefront, search, a direct link, a cart, a wishlist, a reorder, the snacks menu or a meal-plan list. Each door is its own spec, because a gate that closes six of seven is not a gate | `e2e/catalog-moderation.e2e-spec.ts` |
| A place-then-cancel round trip leaves the wallet exactly where it started — cancelling reverses the cashback instead of paying the buyer to cancel | `e2e/orders-lifecycle.e2e-spec.ts` |
| Nothing claims `role="button"` without handling Enter and Space — the defect that made every product card focusable and unopenable from a keyboard | `client/lib/keyboard-activation.spec.ts` |
| Nothing opens Razorpay Checkout without reading the response's `mock` flag; the public config endpoint reports honestly and leaks no key — the defect that made "Top up wallet" do nothing at all and left the page scroll-locked | `client/lib/payments-guard.spec.ts`, `e2e/money-races.e2e-spec.ts` |
| One question — what do you make — derives the application category and the vendor type; a craft-only applicant resolves to `artist` instead of the old `other`, and every accepted specialty maps to a real `VendorType` (an unmapped one is a 500 inside the approval transaction) | `unit/specialty-taxonomy.spec.ts` |
| A refusal without a reason is a 400 and changes nothing; the reason is stored, audited with before/after, and delivered to the HomeKrafter word for word | `e2e/catalog-moderation.e2e-spec.ts` |
| An edit re-queues on a material change and not on a price change; a rejected listing resubmits on any edit; a pending one cannot restamp its way to the front of the queue | `e2e/catalog-moderation.e2e-spec.ts` |
| Money writes survive being made twice at once: one payout per request, one admin decision per payout, one payable Razorpay order per order, one `SnackOrder` per WhatsApp message, and two same-named signups both succeed | `e2e/money-races.e2e-spec.ts` |
| A friend signing up with a code creates a real referral; the ₹250 lands only once their first order is **delivered**, exactly once, and never for somebody else's referral or your own code | `e2e/referrals.e2e-spec.ts` |
| A delivery address must carry a phone somebody can ring and a pincode somebody can route to — every real Indian phone format accepted, `not-a-phone` and `ABCDEF` refused with nothing stored, on create and on edit | `e2e/addresses.e2e-spec.ts` |
| No component awaits inside `try`/`finally` without somewhere to put the failure, **and no component mutates server state without a `catch`** — between them, the shape that made fifteen screens' Save button do nothing (and, with no `try` at all, sit on "Saving…" forever) | `client/lib/silent-failure.spec.ts` |
| A listing's `name` and `description` are bounded at both ends — a 5,000-character product name is refused and stored nowhere | `e2e/catalog-moderation.e2e-spec.ts` |
| One checkout creates one order — concurrently and on a sequential replay — decrements stock once and debits the wallet once, while two genuinely separate purchases still make two orders | `e2e/money-races.e2e-spec.ts` |
| `isHamper` is a filter and nothing else — a hamper still obeys availability, moderation and ownership | `e2e/hamper-listings.e2e-spec.ts` |
| Every path that writes `Order.status` messages the buyer; a new order messages each kitchen once | `e2e/order-notifications.e2e-spec.ts` |
| Two deliveries racing for one recipient both arrive — neither is lost to the preference row's unique constraint | `e2e/order-notifications.e2e-spec.ts` |
| A quote token is a bearer credential: stored only as a hash, never logged, rotated on re-send, and not-found is indistinguishable from revoked | `e2e/corporate-quotes.e2e-spec.ts` |
| Acceptance is single-use under concurrent requests, records who accepted by name, and **creates no orders** | `e2e/corporate-quotes.e2e-spec.ts` |
| Withdrawing an accepted quote's link kills the link but never rewrites the deal back to a re-pricable draft | `e2e/corporate-quotes.e2e-spec.ts` |
| A quote line must name a kitchen that exists and owns it; the token payload never exposes which kitchen supplies which line | `e2e/corporate-quotes.e2e-spec.ts` |
| A cycle is prepaid in one debit, rolled back whole if the wallet cannot cover it; the price is a snapshot; a skipped meal is owed, not lost; cancelling moves no money | `e2e/meal-subscriptions.e2e-spec.ts` |
| A capability flag is only a filter — a craft reaches `/gifts` without leaving the shop, a snack joins the menu without leaving it, and absence defaults rather than hides | `e2e/section-flags.e2e-spec.ts` |
| `GET /categories` tells a client which vertical each category is on, ordered by `sortOrder` before name | `e2e/section-flags.e2e-spec.ts` |
| A review needs a **delivered** order; aggregates are recomputed from rows, never incremented | `reviews.e2e-spec.ts` |
| A seller **cannot verify themselves** (400, not a silent strip); a changed FSSAI number clears the badge; the licence number is never published | `verification.e2e-spec.ts` |
| Cancellation closes at `packed`; returns close 7 days after `deliveredAt`; a return request **moves no money** | `orders-lifecycle.e2e-spec.ts` |
| A payout **records** a settlement rather than performing one; both decisions are one-way | `payouts.e2e-spec.ts` |
| Seller revenue is their **line-item share**, not the order total; ratios are `null`, not `0` | `seller-analytics.e2e-spec.ts` |
| Role gating across all three surfaces, and row scoping between two HomeKrafters | `rbac.e2e-spec.ts` |
| The wallet ledger comes back one capped page at a time, walks the whole history exactly once across pages, and never returns another wallet's row whatever cursor is passed — the `id` tiebreaker is what stops 60 same-millisecond rows from duplicating and skipping | `e2e/wallet-pagination.e2e-spec.ts` |
| The admin order list is a page with a real total, pages without repeating or dropping a row, and **finds by search an order that is not on the first page** — the thing a client-side filter over a page silently cannot do | `e2e/admin-orders-pagination.e2e-spec.ts` |
| Dashboard and analytics figures are aggregates computed from the rows, and the oldest day of the GMV window keeps an order placed in its small hours — the timezone shift that dropped everything before 05:30 UTC from exactly one column | `e2e/admin-analytics.e2e-spec.ts` |
| The admin user list is a page whose role, status and search all apply in SQL — a search finds an account that is not on the first page, and a filter narrows the *total* rather than only the rows | `e2e/admin-users-pagination.e2e-spec.ts` |
| The eleventh person with a given first name can still register: the code space stops being ten wide, and the overflow suffix contains nothing that can be misread aloud | `unit/referral-code.spec.ts`, and the 30-account seed in `e2e/admin-users-pagination.e2e-spec.ts` |
| What a HomeKrafter is owed multiplies by quantity, counts only delivered orders, counts only their own products, keeps paise, is ₹0 rather than NaN for an empty kitchen, and never goes negative | `e2e/seller-earnings.e2e-spec.ts` |
| A queue's badge counts the queue, not the page: filtering the catalogue to "active" or the support list to "resolved" leaves "waiting for review" and "waiting on us" where they were | `e2e/admin-queues-pagination.e2e-spec.ts` |
| A dialog claiming `aria-modal` actually moves focus in, traps Tab **and** Shift+Tab, and gives focus back to whatever opened it — and leaves the tab order entirely when closed. **All three dialogs**, including the reel viewer, which claimed it and honoured only the scroll lock until M29; and moving between reels must not run the focus-restore cleanup | `e2e/tests/focus-traps.spec.ts` |
| No dialog rolls its own focus trap — one `FOCUSABLE`, one `trapTab`, in `client/lib/focus-trap.ts`. The M16 selector's `:not([tabindex="-1"])` qualified only its last clause, so a `tabindex="-1"` *button* counted as a trap boundary and Shift+Tab escaped past it | `client/lib/focus-trap.spec.ts` |
| No visible text control is under 16px on a phone — the size at which iOS Safari zooms the page on focus and does not zoom back. All 36 of them were, until M29 | `e2e/tests/presentation.spec.ts` (8 routes, fast gate) + `e2e/sweep.mjs`'s `inputzoom` flag (all 87) |
| The portal nav strip scrolls the active item into view on a phone, in **all three** shells, and it stays there. The seller shell mounts its nav late (an async HomeKrafter resolve), so a fix verified only on account/admin passes while the surface a home cook actually uses sits at scrollLeft 0 | `e2e/tests/portal-nav.spec.ts` |
| The location prompt never opens over a staff surface or an auth form, where it used to trap focus while somebody typed a password | `e2e/tests/focus-traps.spec.ts` |
| `/admin/login` signs in as **what was typed**, not a hardcoded account | `e2e/tests/auth.setup.ts` |
| A product card opens on Enter from the keyboard; an unknown slug answers **404 in the status line**, not a soft 404 | `e2e/tests/audit-regressions.spec.ts` |
| A name has to contain something readable — spaces, tabs and newlines are refused across signup, addresses and support — and the **trimmed** value is what gets stored | `e2e/blank-names.e2e-spec.ts` |
| Platform-wide wallet liability is the same number on page two as on page one — the totals are aggregates, not a sum of the rows on screen | `e2e/admin-queues-pagination.e2e-spec.ts` |
| Filtering the payout queue to "paid" leaves ₹10,000 still showing as owed, and the corporate queue keeps its untouched count — the two remaining places a summary followed the page | `e2e/admin-queues-pagination.e2e-spec.ts` |
| `GET /products` orders a page identically whether the SQL fast path or the general path serves it — a split that would otherwise diverge invisibly, since both return plausible pages | `e2e/products-browse.e2e-spec.ts` |
| Signing in returns you to the page the gate turned you away from — and refuses a `?next=` that leaves the site or that the role cannot reach | `client/lib/auth/return-to.spec.ts`, `e2e/tests/error-paths.spec.ts` |
| Every tab stop on a page shows a focus ring — on the control or on the wrapper that reads as the field, which is where three modules deliberately put it | `e2e/tests/presentation.spec.ts` |
| Every public route passes axe's `color-contrast` and the structural WCAG rules (control names, `aria-hidden` over focusable elements, heading order, one `main`) at both viewports | `e2e/tests/a11y.spec.ts` |
| An unreachable API says "Something on our end isn't responding… us, not you" — never "check your connection", which is the incident sentence `c11b56e` deleted — while a genuinely offline browser gets "You appear to be offline"; a 429 says to wait, not `ThrottlerException`; and a browse page still renders its shell when the API is gone | `e2e/tests/error-paths.spec.ts` |
| The desktop header stays inside its 1092px budget for every role — the collapsed search slot holds ≥38px, the field expands to a typable 420px on focus and closes on Escape, and no control (the cart was 59px offscreen) leaves the container | `e2e/tests/header-capacity.spec.ts` |
| A HomeKrafter who just signed in is never shown the sign-in wall while `GET /seller/me` is in flight — the spec holds that response for 600ms to force the race — and the topbar skeleton never says "undefined" or another kitchen's name (the M17 fixture trap) | `e2e/tests/login-transition.spec.ts` |
| `GET /seller/dashboard` is requested **exactly once** during a sign-in, and lands while `/seller/me` is still held — the coupling that made it fire twice and serially, undoing M30's fix, was invisible except as latency | `e2e/tests/login-transition.spec.ts` |
| An admin-issued password is never stored in the clear once claimed, never reaches the audit log, refuses every route but the change screen until rotated, stops working the moment its owner picks their own, and takes any session an admin opened with it down too | `server/test/e2e/temp-password.e2e-spec.ts` |
| Onboarding state separates "never issued" from "issued, unused" from "chose their own", and the three admin filters are disjoint — `mustChangePassword` alone reads `false` for two of the three | `server/test/e2e/temp-password.e2e-spec.ts` |
| A duplicate application (same email as an existing HomeKrafter) is marked in the queue, and exactly the marked row is the one approval refuses | `server/test/e2e/duplicate-applications.e2e-spec.ts` |
| One HomeKrafter's detail answers with contact, storefront, listings by switch, and their **line-item share** of a shared order — never the order total — and refuses a non-admin | `server/test/e2e/admin-seller-detail.e2e-spec.ts` |
| A storefront name cannot be an email address or a phone number, a mobile normalises to E.164, an Instagram handle survives every shape people write it in, and a short real name like "Abc" is still accepted | `server/test/unit/application-fields.spec.ts`, `client/lib/sell/application-fields.spec.ts` |
| What an applicant typed reaches `VendorProfile` at approval — unverified — and an applicant who said none of it gets no empty profile row | `server/test/e2e/seller-application-fields.e2e-spec.ts` |
| Passwords hash at the OWASP argon2id reference cost and one-time codes cheaper, read back out of a real digest; a pre-M31 digest still verifies and still reports `needsRehash`, so no account is locked out and none stays on the old cost | `server/test/unit/hashing.spec.ts` |
| A HomeKrafter's token carries `sellerId` — after sign-in **and after a refresh**, where losing it would 403 the whole portal fifteen minutes into a session — `/seller/me` still names the storefront from its single collapsed query, a legacy password is upgraded on use, and verifying a code twice does not write the second time (proved with Postgres `xmin`, since `User` has no `updatedAt`) | `server/test/e2e/auth-performance.e2e-spec.ts` |
| `GET /seller/dashboard` reports today's orders and revenue for this vendor only, listing/live/low-stock counts, snack earnings from delivered orders, pickups and deliveries by **UTC** day, and zeroes rather than an error for a kitchen with nothing yet — every figure computed by hand, and the spec verified against the pre-rewrite service so it is a parity check, not a recording | `server/test/e2e/seller-dashboard.e2e-spec.ts` |
| Browse state survives Back: `/shop`'s filters, sort and page are in the URL, a filtered URL opens filtered for somebody else, nonsense params show the catalogue rather than an empty grid, and a `utm_` param survives a filter click | `client/lib/browse-params.spec.ts`, `e2e/tests/audit-regressions.spec.ts` |
| A refresh while an order is being placed leaves one order and an empty cart, on a page that says where to check | `e2e/tests/error-paths.spec.ts` |
| No public page scrolls sideways at 360/768/1180, every one has exactly one `<h1>`, the header collapses to the hamburger below the measured breakpoint, and the first Tab lands on a skip link that names a target that exists | `e2e/tests/presentation.spec.ts` |
| An indexable route builds its metadata through `pageMetadata()` or says not to index it — the shape that let `/about` inherit the home page's canonical and declare itself a duplicate | `client/lib/canonical-metadata.spec.ts` |
| CSV formula injection is neutralised on the way out of a real export | `admin-exports.e2e-spec.ts` |
| Absence is never a closure: no working days = open every day, no prep time = 90 minutes | `availability.e2e-spec.ts` |
| `GET /settings/public` is an **allowlist** — the commission rate is never published | `settings.e2e-spec.ts` |
| `"false"` never means `true` on any boolean field | `boolean-coercion.e2e-spec.ts` |
| An approved HomeKrafter can actually sign in, and `GET /seller/me` returns **their** kitchen | `seller-onboarding.e2e-spec.ts` |
| An area that cannot be resolved is **unapprovable** — including legacy rows and typos, not just the literal `"other"`; nothing is created on refusal | `seller-application-area.e2e-spec.ts` |
| Auto top-up **credits nothing** — an enabled rule plus a qualifying debit produces no `topup` row; the API refuses `enabled: true` and caps both amounts | `wallet-auto-topup.e2e-spec.ts` |
| The two copies of the tricity area table are **identical** | `test/unit/geo-parity.spec.ts` |
| The channel matrix — snacks have no cart, full meals have no menu | `client/lib/channel.spec.ts` |
| The scheduler's lead time, closed days and blackouts | `client/lib/schedule.spec.ts` |

### Two worth calling out

**`geo-parity.spec.ts`** is the only test that spans both packages.
`client/lib/geo.ts` and `server/src/common/geo.ts` each carry a copy of
the tricity area table because the two packages have no shared build;
CLAUDE.md has always said they must stay identical, and nothing checked.
A kitchen's coordinates are stamped from the server's copy, a buyer's
from the client's, so a drift of a few metres silently mis-sorts the
catalogue with no error anywhere. The client copy is read as text and
parsed — importing across the package boundary would need a build step
and a tsconfig reaching outside `server/`.

**`boolean-coercion.e2e-spec.ts`** exists because of a bug this suite
found. See `BooleanField` in
`server/src/common/decorators/boolean-field.decorator.ts`.

---

## Writing a new test

- **Compute the expected value by hand, then assert it.** A number
  recorded from a run locks in whatever the code did, including the bug.
  Every expectation in `schedule.spec.ts` was arithmetic on paper first.
- **Prefer an e2e test for anything expressed as a query.** Scoping,
  eligibility and windows are all query-shaped.
- **Assert the refusals too.** Half of what these specs cover is a 400,
  403, 404 or 409 — a feature that works and cannot be misused are two
  separate claims.
- **No snapshots for rules.** A snapshot goes green under `-u`, which is
  exactly the reflex someone has while changing the thing it guards.
- Fixtures live in `server/test/e2e/harness.ts`. Add the smallest row
  that makes a rule reachable, not a realistic one.
