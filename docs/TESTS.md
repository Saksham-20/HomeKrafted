# Tests

M17. Before this there was no test of any kind in either package: every
rule shipped in M15/M16 had been *verified by measurement* against a
running API, and none of it was guarded against being undone.

```
cd client && npm test          # 88 tests, no setup
cd server && npm test          # 88 tests, no setup
cd server && npm run test:e2e  # 240 tests, needs a database (below)
```

CI runs all three plus typecheck, lint and both builds — see
`.github/workflows/ci.yml`.

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

## The three layers, and why each one exists

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

### What is deliberately not tested

**Component rendering.** It would need jsdom plus Testing Library plus a
Next mock surface, and would mostly assert that markup still looks like
markup. Where DOM behaviour genuinely matters — the dialog focus traps in
`MobileDrawer` and `LocationPrompt` — a browser-level test is the honest
tool, and that is still owed.

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
