<!-- /autoplan restore point: ~/.gstack/projects/Saksham-20-HomeKrafted/main-autoplan-restore-20260808-175606.md -->

# M26 — Wave 0, then a full-site QA sweep: every page, every user type, judged like a product

**Status:** reviewed by `/autoplan` 2026-08-08 (CEO → Design → Eng → DX).
Successor to M23's browser sweep.
**Authority:** `docs/PRODUCTION-AUDIT.md` (severity ladder, open backlog),
`docs/LAUNCH-READINESS.md` (non-code gates), `CLAUDE.md` (rules a fix may
not break).

## 0. Start here

**Contents:** §0 start · §1 what this is · §2 done + severity · §3 environments
· §4 out of scope · **§5 Wave 0 (blocking)** · §6 route inventory · §7 depth,
**§7.1 design contract**, **§7.2 state contract** · §8 personas + arcs ·
§9 waves 1–6 · §10 ledger · §11 fix rules · §12 risks · then the review report.

```bash
./scripts/qa-up.sh          # installs, writes server/.env, creates hk_qa,
                            # migrates, runs ALL THREE seeds, writes client/.env.qa
# then, in two terminals, the two commands it prints. Open http://localhost:3100
```

**Your first task is not sweeping.** In order:

1. **Wave 0.9** — repair the browser layer. It is red on `main` today (§5.5).
2. **Wave 0.0** — create the ledger with its header row and row 1.
3. **§5.3 step 1** — restructure the spec loops *before* the route list grows.
4. Then Wave 0's remaining items by lead time (§5.1), then Wave 1.

**The card you actually hold while sweeping is §7.1 + §7.2.** Read them once,
keep them open. Everything before §5 is context; everything after §9 is
provenance.

### 0.1 When it doesn't come up

| Symptom | Cause | Do |
|---|---|---|
| `Missing required env var: JWT_ACCESS_SECRET` | no `server/.env` (gitignored) | `qa-up.sh` writes it; or `cp server/.env.example server/.env` and set both JWT secrets |
| `FATAL: role "<you>" does not exist` | Postgres is the Docker one, not a host install | `QA_DB_USER=homekrafted ./scripts/qa-up.sh`, or `brew install postgresql@16` |
| `EADDRINUSE :::3100` | a previous stack, or a second session | `lsof -ti:3100 \| xargs kill`, or run with `QA_WEB_PORT=3101 QA_API_PORT=4101` |
| `createdb: database "hk_qa" already exists` | previous run | fine — but you are sweeping last week's data. `dropdb hk_qa` for a clean pass |
| `/meal-plans` or `/gifts` is empty | only `seed.ts` ran | run `seed-crafts.ts` and `seed-meal-plans.ts` too. **This is not a product defect** |
| Canonical URLs say `homekrafted.in` on localhost | `NEXT_PUBLIC_SITE_URL` unset → `lib/seo.ts` falls back to production | set it to `http://localhost:3100`. **Not a Wave 1 finding** |
| Playwright: `Executable doesn't exist at ~/Library/Caches/ms-playwright/…` | browsers not installed | `cd e2e && npx playwright install --with-deps chromium` |
| `cd e2e && npm test` → "0 failed, N skipped" | `auth.setup.ts` targets a UI that no longer exists | **that is Wave 0.9** — see §5.5 |

## 1. What this is

Not a test-writing milestone. A **human-shaped sweep of the whole product**
— open every page as each kind of person who uses it, do what they would
do, and judge the result the way a senior product engineer judges a
competitor's site. Every iteration ends with the same four questions, and
the answers become work.

The four test layers (client unit, server unit, server e2e, browser) all
pass today. Together they still cannot answer *"is this good, and is
anything missing"* — that needs a person going through a flow end to end
and noticing that the thank-you screen never says when the food arrives.

**But a sweep can only judge what is actually connected.** The CEO review
found that on production today a stranger cannot buy anything: Razorpay is
on placeholder keys, so `payments.service.ts:142` mints `order_mock_…`,
`CheckoutClient.tsx:157` falls back to wallet-only, and topping the wallet
up runs through the same blocked path. SMS, email and WhatsApp are logged
stubs. Sweeping Waves 2–3 in that state means judging "does the buyer know
what happens next" against a `console.log`, and re-running both waves when
the keys land. **Wave 0 exists so the sweep runs once.**

### The four questions, asked after every page and every flow

1. **Will a user like this?** — first five seconds, then the next click.
2. **Is it complete?** — does the loop close, or does it dead-end?
3. **Can it be improved?** — the cheapest change with the biggest effect.
4. **What breaks it?** — empty, slow, offline, double-clicked, keyboard-only,
   390px, signed out mid-flow, deep-linked from cold.

Q4 is deliberately last and never skipped: M23 found that "Place order"
charged three times for three clicks, and every layer of the suite was green.

**Q2 and Q4 produce fixes. Q1 and Q3 produce a list.** Every defect this
project has actually caught — the triple charge, EXIF GPS in kitchen
photos, broken uploaded images, the 409 sign-in path, `"false"` evaluating
as `true` — came from Q2 and Q4. Q1 and Q3 have no ground truth and no
stopping rule, and "copy is in scope" licenses unbounded work. Each wave
therefore ends with **at most five** Q1/Q3 improvements, written down as
proposals and *not* implemented in this milestone unless they are also a
Q2/Q4 finding.

**Which question a design defect belongs to — the rule, so it is not the
sweeper's discretion.** Without this, an inverted hierarchy with the CTA
below the fold has two legal homes — a Q1 proposal that dies in a list, or
a Q4/P1 that gets fixed with a test — and the plan quietly rewards
laundering findings through Q4 to get them actioned:

> **A design defect that prevents the primary action from being found or
> performed by a class of user is Q4/P1. A design defect that makes the
> screen worse while leaving the action performable is Q1, capped.**

**A Q1 finding with no counter-proposal is not a finding.** Each one owes a
screenshot and one line of "what I expected to see instead."

## 2. Definition of done

- **Wave 0 closed** (§5) — or each unobtainable item explicitly marked
  BLOCKED with what it blocks.
- Every route in the **generated** inventory (§6) opened, in every role
  that can reach it, at 1280px and 390px, signed in and signed out — at
  the depth §7 assigns it.
- Every finding in the ledger (§9) with a severity, and every P0/P1 either
  **fixed with a regression test** or **explicitly deferred with a reason
  in `docs/PRODUCTION-AUDIT.md`**.
- Zero P0 open. Zero P1 open that is fixable in code.
- `docs/LAUNCH-READINESS.md` carries an **owner** and a **date** on every
  open gate. (M26 does not write a second checklist — see §8.)
- `CHANGELOG.md`, `docs/TESTING.md`, `docs/PRODUCTION-AUDIT.md` and any
  affected doc updated in the same commits, per `CLAUDE.md`'s upkeep table.

### Severity is defined before the fix is estimated

The old wording graded itself. P0/P1 are now externally checkable, and the
severity is written into the ledger **before** anybody estimates the fix,
so a cheap fix cannot inflate its own priority:

- **P0 — money moves wrongly, data is lost, a security boundary fails, or a
  core loop dead-ends.** (Money moving wrongly includes: charged twice,
  refunded twice, credited without payment, paid out gross when it should
  not be.)
- **P1 — a user is blocked with no workaround**, or the page is
  unreachable/unreadable for a class of user. **Measured as:** keyboard-only
  (every Tier A flow completed without a mouse), 390px (per §7.2's
  definition), and axe's structural + contrast rules. **Screen-reader
  *quality*** — as opposed to axe's mechanical checks — is explicitly
  **not measured in M26** and cannot therefore hold the DoD open; it is
  logged as owed, with zoom-to-200% and `prefers-reduced-motion`.
- **P2 — wrong or confusing, with a workaround.** Copy defects live here
  unless they cause a wrong action.
- **P3 — polish.**

**Budget: 6 working days of sweep, or 80 findings, whichever comes first.**
On hitting either, stop sweeping, close the open P0/P1s, and roll the
remainder into `PRODUCTION-AUDIT.md` Phase 3. A sweep with no cap is a
sweep that never reports.

## 3. Where this runs

| Environment | Used for | Writes |
|---|---|---|
| **local `hk_qa`** | Waves 1–5 iteration, fix loop | yes, freely |
| **`staging.homekrafted.in`** (Wave 0 stands it up) | Waves 2–5 verification, prod build behaviour, real nginx/HTTPS/cookies | yes |
| **production** | Wave 6 smoke only | **no writes**, one exception below |

Local first, staging second, production last. The last three real bugs
(uploaded photos broken since M16, sign-up short-circuiting its own confirm
step, a code minted under a purpose its verifier rejected) were all found
by driving **production** — a local stack is exactly the setup that missed
the first one for two months, because `/uploads/` is served by nginx there
and by nothing locally. Staging closes that gap without risking real rows.

**Setup is `./scripts/qa-up.sh`, committed in Wave 0.0** — not a shell block
pasted from this document. The draft's six-line block did not work: it
assumed `npm install` had been run, it did not create `server/.env` (which
is gitignored, and `env.validation.ts` refuses to boot without
`JWT_ACCESS_SECRET`), it ran **one of the three seed files**, it left
`NEXT_PUBLIC_SITE_URL` unset so every canonical on a localhost build reads
`homekrafted.in`, and it said `cd client` from inside `server/`. Measured
time to a rendering page from a cold clone: **fails**, then 25–35 minutes
of debugging. Target is eight.

The script parameterises `QA_DB`, `QA_API_PORT`, `QA_WEB_PORT` (defaults
`hk_qa` / 4100 / 3100) and must:

1. `npm install` in `server/` and `client/` if `node_modules` is absent
2. write `server/.env` from `.env.example` with freshly generated JWT
   secrets if it does not exist
3. `createdb`, `prisma generate`, `migrate deploy`
4. run **all three** seeds — `seed.ts`, `seed-crafts.ts` (`/gifts`),
   `seed-meal-plans.ts` (`/meal-plans/[slug]` and `/account/subscriptions`,
   both **Tier A**). Seeding only the first is how a sweeper opens
   `/meal-plans`, sees nothing, and files a false P1 about the product.
5. write `client/.env.qa` with `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_SITE_URL=http://localhost:$QA_WEB_PORT` and
   `NEXT_PUBLIC_USE_MOCK=false`
6. mint one corporate quote and print its URL — `/corporate/quote/[token]`
   is Tier A, the token is stored **only as a hash**, and no seed creates
   one, so today the route cannot be opened at all
7. print the two long-running commands rather than trying to run them
   (`start:dev` blocks; this needs two terminals)

Both client modes are run: `npm run dev` to iterate, and **`npm run build
&& npm start` for the final pass of each wave** — SSR/ISR, `revalidate`,
static prerender and the soft-404 trap (`CLAUDE.md`: never a `loading.tsx`
over a route that can `notFound()`) only behave truthfully in a production
build.

**Production, Wave 6:** signed-out, read-only — status codes, canonical
URLs, redirects, HTTPS, console errors, and real uploaded images rendering.

**The one deliberate write, written out honestly.** The draft said "upload
a photo through a throwaway HomeKrafter account and delete it after."
Neither half is one write: creating that account means an admin approving
an application, which writes `User`, `Seller`, `Vendor`,
`SellerApplication` and an audit row — and once 0.3 lands, **sends an
invite by email and SMS from the production sender to a fake address**. And
"delete it after" is not possible through the product: nothing deletes
upload files yet, so it needs `rm` on `/var/lib/homekrafted/uploads` over
SSH. **So: use an already-approved kitchen, upload one photo, verify it
renders, and accept one orphaned file** — cheaper, honest, and it still
performs the exact action that found the M25 bug after nine milestones of
it being invisible. Nothing local reproduces it.

**Also on production, but forced rather than real:** Wave 5's throttled-API
pass uses `page.route` to force the 429, the way `error-paths.spec.ts`
already does. `AUTH_THROTTLE` defaults to 20/60 s keyed on client IP, so a
six-day sweep from one address either generates false P1s at the real limit
or makes the 429 unjudgeable at the CI-raised one. Say it here, or somebody
"fixes" a rate limit that is working correctly.

Driving is done with the Playwright MCP browser and the gstack `/qa` and
`/design-review` skills (§7) — real clicks, real keyboard, real
screenshots, not source-reading.

## 4. Out of scope

Native apps (`app/`), image CDN / stored upload variants, multi-city
expansion, rebuilding laundry (withdrawn, M19), take-rate **collection**
(the decision is in Wave 0; the plumbing is not), and recruiting real
HomeKrafters — that is M27's job and the CEO review's strongest
recommendation, deliberately not folded in here because it changes the
milestone's goal rather than its scope.

---

## 5. Wave 0 — what must be true before a sweep means anything

Blocking. Each item is hours, not days, and each one otherwise invalidates
a judgement made later.

| # | Item | Why it blocks | If it cannot be obtained |
|---|---|---|---|
| **0.0** | **Create `docs/M26-QA-LEDGER.md`** (header row + row 1), `scripts/qa-up.sh`, and `docs/route-inventory.tsv` as a **coverage** file (§10.1) | The draft described all three and assigned none of them to anybody, so the first sweeper would have designed them mid-sweep. | Not blockable. |
| **0.9** | **Repair the browser layer — it is red on `main` today** (§5.5) | It is the milestone's one permanent deliverable, and it fails as *skipped*, which reads exactly like passing. | Not blockable. |
| 0.1 | **Razorpay TEST keys + webhook secret** | Without them checkout is wallet-only and the wallet cannot be funded. Every Wave 2 verdict would describe a demo, not a product. | Waves 2 and 6 mark every payment judgement **OWED**; the sweep does not claim checkout works. |
| 0.2 | **Flag `POST /auth/social/:provider` off, server-side** — six required parts in §5.2. JWKS is *not* the hours-scale alternative the draft assumed | It issues an admin session for a posted email, confirmed exploitable. Running six waves of QA over a site whose admin account is takeable is a bad use of the window. | Not applicable — the flag needs nothing. This item cannot be blocked. |
| 0.3 | **SendGrid + Twilio keys** | An approved HomeKrafter cannot be reached today, and every "was the buyer told" judgement in Waves 2–3 is made against a log line. | Waves 2/3 mark notification judgements **OWED**; the seller-invite flow is verified against the logged stub only, and says so. |
| 0.4 | **Error monitoring + one funnel** — Sentry on both processes, one privacy-light analytics script, funnel: home → product → cart → order | There is **no** Sentry, analytics or error stream anywhere in the repo (verified: zero dependency in either `package.json`). Q1 "will a user like this" is one person's opinion now and after launch, and `LAUNCH-READINESS` §3 already calls this the largest ops gap. | Sweep proceeds; every Q1 answer is explicitly labelled opinion. |
| 0.5 | **`staging.homekrafted.in`** — own database, stub provider keys, `noindex` + HTTP basic auth | Waves 2–5's hostility pass (expired sessions, deep links, throttled API, soft-404s) behaves differently behind real nginx and real cookies. Without the auth gate and `noindex` it is a public, unverified second copy of the site. | Waves 2–5 run locally; Wave 6 grows a second read-only prod pass and the plan records the reduced confidence. |
| 0.6 | **Decide the take rate** | `commissionPct` deducts nothing, `Payout.amount` is gross, 5% cashback lands on every order, shipping is ₹49 flat below ₹999. Every conversion improvement this milestone makes has negative expected value until it is decided. The decision is a conversation; the plumbing stays out of scope. | Recorded as a standing blocker with the number left open; no conversion work is reverted for it. |
| 0.7 | **Reconcile the docs that are now wrong** — `docs/TESTING.md` still tells an approved HomeKrafter to use the **Phone tab** of `/login?role=seller` (line ~148) forty lines after saying the tabs are gone, and §8 names that file as the source of truth for the persona that has broken twice; `CHANGELOG.md` has no M22/M23/M24 entry and its newest-but-one heading is `[M21] … (in progress)` holding what `CLAUDE.md` calls M23; `PRODUCTION-AUDIT.md` L3 says `/gallery` is "publicly routable in production" when `gallery/page.tsx:57` 404s it; `CLAUDE.md` and `PRODUCTION-AUDIT.md` M3 both claim the axe suite covers "every public route" when it covers 7 | A milestone promising "nothing missing" cannot start on a ledger that misnames what shipped, and two of these would have sent the sweep chasing non-bugs. Under an hour. | Not blockable. |
| 0.8 | **Generate the route inventory** (§6) and **unify the two browser route lists** (§7) | The DoD rests on "every route opened". Hand-maintained lists are this repo's known drift mechanism. | Not blockable. |

**Wave 0's own exit check:** place one order end to end on staging with a
Razorpay test card, confirm the buyer and the kitchen both receive a real
message (**email**, see 5.1 on SMS), and confirm the admin cannot be signed
into via `/auth/social`.

### 5.1 What Wave 0 actually costs, and what it is blocked on

"Each item is hours, not days" holds for 0.6 and 0.7 and for nothing else.
The eng review priced them against the repo:

| Item | Real cost (human) | Claude Code | Why it is not hours |
|---|---|---|---|
| 0.1 Razorpay test keys | 0.5 d | 1–2 h | Config is trivial; the **test webhook needs a public non-production URL**, so it is gated on 0.5 |
| 0.2 social flag | 0.5 d | 2–3 h | Guard + e2e assertion + three docs + purging the stub `SocialAccount` rows |
| 0.3 SendGrid | 1–2 d | 1 h | Domain authentication: SPF/DKIM records, DNS propagation, sender verification |
| 0.3 Twilio, India | **weeks (calendar)** | 1 h | Transactional SMS to Indian numbers needs **TRAI DLT registration** — entity, header, and per-template approval queues |
| 0.4 Sentry + funnel | 1 d | 4–8 h | Next instrumentation, Nest filter, source maps, per-environment tags, sampling, `beforeSend`, and a DPDP consent decision |
| 0.5 staging | **blocked**, then 1–2 d | 6–10 h | Second box, DNS, TLS, DB, seed, basic auth with webhook carve-outs, and parameterising `ecosystem.config.cjs` + `scripts/deploy.sh`, which hardcode ports 3000/4000 and health-check `127.0.0.1:4000` literally |
| 0.6 take rate | a conversation | — | Correct, and the only item with **no artifact** — so it will silently not happen unless it lands as a number in `LAUNCH-READINESS.md` §3b with a date and an owner |
| 0.7 docs | 0.5 d | 3–4 h | Three retroactive CHANGELOG entries in a file whose entries run 100–400 lines |
| 0.8 inventory + spec unification | **1.5–3 d** | 6–12 h | The `find | sed` is thirty minutes. §5.3 is the actual work |

**Realistic Wave 0: 3–5 hands-on human-days, 25–40 Claude-Code-hours, and
2+ weeks of calendar time** dominated by DLT registration and one hosting
credential. §2's six-day sweep budget starts *after* that.

**The dependency graph terminates in one blocked node.** `staging.homekrafted.in`
needs a hosting-provider credential — the same one the load-test twin has
been blocked on, where the record reads "nobody has handed one over, and I
cannot provision without it; the existing SSH key reaches production only."
Co-tenanting staging on the production box is not the fallback: it is 1 vCPU
/ 3.8 GB with a 2 GB swapfile, `deploy.sh` already caps the client build at
`--max-old-space-size=3072` so it cannot OOM the machine, and pm2 restarts
at 600–800 MB. A staging `next build` beside production is an outage.

**Therefore: local-only is the default path, and staging is an upgrade.**
0.5 moves to the front of Wave 0 with the credential named as its blocker
and a person assigned to obtain it. If it does not arrive, Waves 2–5 run
locally, 0.1's webhook is exercised against a tunnel rather than a real
host, and the plan records the reduced confidence rather than pretending
otherwise. **Two Wave 0 items therefore ship on the same day they are
started (0.2, 0.7) and everything else has a lead time** — sequence
accordingly.

### 5.2 The social-login flag, in six parts

The draft offered "JWKS verification, or the flag" as equal options. They
are not. There is **no** `jose`, `google-auth-library`, `jwks-rsa` or
`passport` in `server/package.json` — nothing to verify a token with. The
client never obtains an id-token: `AuthContext.tsx:583` mints a nanoid into
`localStorage` (`hk_social_account_ids_v1`) and posts it as
`providerAccountId`. Real verification is a Google Identity Services /
Sign in with Apple integration with nonce handling, it needs the OAuth
client ID and Apple service ID `CLAUDE.md` says nobody has, and the existing
`SocialAccount.providerAccountId` rows are fabricated strings that will
never match a real Google `sub` — so a naive fix falls through to the
email-match branch and **the takeover survives it**. 3–5 human-days, and
blocked. The flag is the right call:

1. **The endpoint fails closed server-side, defaulting to off.** It is
   `@Public()` and directly curl-able, so removing the buttons is not a fix.
   It must **404**, not 403 — a 403 confirms it exists.
2. **An e2e assertion that it 404s**, in `server/test/e2e/`. Without it a
   future session reads the DTO's "swapping in real verification only
   changes the service body" comment as an invitation and flips it back.
3. **The buttons.** `SocialSignIn` has exactly one call site,
   `LoginClient.tsx:442`. One line.
4. **`docs/API.md` and `docs/ARCHITECTURE.md`** both document the endpoint
   and must say "disabled" in the same commit.
5. **Purge the stub `SocialAccount` rows**, so re-enabling later cannot
   resurrect a fabricated link.
6. **`LAUNCH-READINESS.md` §0.4 stays open.** The flag closes the
   *exposure*, not the *gate*.

### 5.3 What 0.8 actually involves before the route list may grow

Extending the two specs over ~31 public routes breaks them mechanically,
and this is the residue §12 says to protect — so it lands **first**, in
this order:

1. **Restructure the loops.** `presentation.spec.ts` iterates routes
   *inside* a single test (8 navigations × 3 widths in one test), and
   `playwright.config.ts` sets no `timeout`, so the 30 s default applies.
   At 31 routes that is 93 navigations in three tests: a guaranteed timeout
   before it finds one real bug. One test per route per width, and an
   explicit `timeout` in the config.
2. **A resolver column.** 18 of 87 routes are dynamic and cannot be
   navigated without a fixture. Three are hostile to one:
   `/corporate/quote/[token]` is stored **only as a hash** and must be
   minted per run; `/admin/orders/[type]/[id]` needs a two-segment fixture;
   every `/seller/*/[id]` is row-scoped, so Anjali's session on Ravi's
   pickup 404s — *correct behaviour*, reported as a failure. Routes with no
   resolver are marked `UNRESOLVED` **in the file** and skipped loudly, so
   "every route opened" stops being a claim the inventory quietly
   contradicts.
3. **An `EXPECTED_404` set, asserted.** `/laundry` calls `notFound()`
   unconditionally and `/gallery` does under `NODE_ENV=production` — which
   is exactly the mode every wave's final pass and CI's browser job run in.
   Assert they 404; an exclusion list would throw the behaviour away.
4. **A required-role column.** `middleware.ts` gates only `/seller/*` and
   `/admin/*`. `/account/*`, `/wallet`, `/cart` and `/checkout` render a
   signed-out client state, so "renders at 200" passes while testing
   nothing — and `/checkout` with an empty cart renders the empty branch
   forever, which means the money screen this plan cares most about is the
   one Tier B can never reach without a cart-seeding step.
5. **Land the axe extension in two commits.** Today: 125 tests. At ~31
   public + ~56 signed-in routes it is ~236 a11y assertions, and the last
   time `color-contrast` met new surfaces it found `--hk-muted` failing at
   306 call sites. Land it first as a **non-blocking reporter** writing
   into the ledger with one `Dupe-of` root cause per token or component,
   then flip it to build-failing once triaged. Otherwise the 80-finding
   budget is spent before a human opens a page.
6. **Fix the generator's regex.** `sed 's|/([a-z]*)||g'` works only because
   both route groups are lowercase; use `s|/([^/]*)||g`.
7. **`a11y.spec.ts`'s `getByRole('heading', { level: 1 })`** is unqualified
   and throws a strict-mode violation on any page with two `<h1>`s. `.first()`
   plus a separate per-route count assertion.

### 5.5 The browser layer is broken on `main`, and nothing said so

Found by the DX review, verified in source. **M25 collapsed the login form
to one field; the fixture that every browser test depends on still drives
the old two-tab form.**

- `e2e/tests/auth.setup.ts:23` clicks `getByRole('tab', { name: 'Email' })`.
  There are **zero** `role="tab"` elements anywhere in `client/`.
- Line 30 wants a button named `/continue with email/i` or
  `/sign in to sell/i`. `LoginClient.tsx:423` renders **"Continue"**.
- `e2e/tests/error-paths.spec.ts` carries the same dead selectors in six
  places.
- `.github/workflows/ci.yml:143` sets `JWT_SECRET`; `env.validation.ts:10`
  requires **`JWT_ACCESS_SECRET`** — so the CI browser job's API never
  boots, and it surfaces 120 s later as a `wait-on` timeout rather than a
  named error.

**The failure mode is the worst available:** three 30-second timeouts in
the `setup` project, then both viewport projects **skip**. The run reports
"0 failed" — so this has been silently red since M25 and every session
since has read the browser layer as green.

Wave 0.9, blocking, before 0.8's restructure:

1. Rewrite `auth.setup.ts` and `error-paths.spec.ts` against the one-field
   form: fill `getByLabel(/mobile number or email/i)`, fill the password,
   click `getByRole('button', { name: /^continue$/i })`.
2. Add the **409 → code** branch and a fourth storage state minted through
   the invite link. That is the brand-new HomeKrafter's only door, it is
   the persona §8 flags as having broken twice, and no fixture uses it.
3. `ci.yml`: `JWT_SECRET` → `JWT_ACCESS_SECRET`.
4. Make any setup failure name itself: *"Sign-in form changed —
   auth.setup.ts targets a UI that no longer exists. See docs/TESTING.md
   'How to log in'."* A skipped project must never again look like a pass.

### 5.4 Staging's own attack surface

`noindex` + basic auth is the start, not the list:

- **Basic auth blocks the two inbound webhooks** — `payments.controller.ts`'s
  `POST webhook` is the *only* path that can `creditTopupTx`, and WhatsApp
  needs a `GET` verification handshake. Behind `auth_basic` both 401, so
  Wave 0's own exit check cannot pass. Carve both out (`auth_basic off;`);
  they are signature-verified.
- **Rotate the seeded admin password.** A staging seeded from `prisma/seed.ts`
  carries `admin@homekrafted.example` on the shared demo password, which
  `LAUNCH-READINESS.md` §0.1 already says to treat as compromised.
- **Unset `OTP_TEST_CODE` / `OTP_TEST_PHONES`.** They are in the `.env`
  template; with them set, basic auth is the only thing between the
  internet and an account-minting bypass.
- **Verify the canonical by curling the built page.** `NEXT_PUBLIC_*` is
  inlined at build time and `client/.env.production` defaults
  `NEXT_PUBLIC_SITE_URL=https://homekrafted.in` — a staging build that
  inherits it emits **production** canonicals, OG URLs and JSON-LD, which
  is the reverse of the risk `noindex` was added for.
- **Tag Sentry per environment and drop synthetic traffic.** Waves 1–5 fire
  thousands of errors at 0.4's new Sentry from a QA browser. Without
  `SENTRY_ENVIRONMENT` and a `beforeSend` dropping Playwright/MCP user
  agents, either the quota dies in Wave 1 or real production errors are
  buried under sweep noise.

---

## 6. Route inventory — generated, not written

`find client/app -name page.tsx` returns **87 files**. The pre-review draft
of this section said 85, listed seller as 18 (it is 21) and admin as 24 (it
is 23) — a plan whose first DoD line is "every route opened" cannot
maintain its own list by hand.

Wave 0.8 commits a generator and a check that fails when the inventory and
`client/app` disagree:

```bash
find client/app -name 'page.tsx' \
  | sed 's|client/app||; s|/page.tsx$||; s|^$|/|' \
  | sed 's|/([a-z]*)||g' | sort -u > docs/route-inventory.txt
```

Groups (counts from the filesystem, not by hand): **public/anonymous ~31**
· **shopper 12** · **HomeKrafter 21** · **admin 23**.

**Error surfaces, reached deliberately:** `/product/nope`,
`/storefront/nope`, `/guides/nope`, `/collections/nope`,
`/corporate/quote/garbage`, `/laundry` (must 404), a thrown render error,
and a signed-out deep link into each of the three dashboards.

**`/gallery` needs no decision.** `client/app/gallery/page.tsx:57` calls
`notFound()` when `NODE_ENV === "production"` — it is already gated.
`PRODUCTION-AUDIT.md` L3 ("publicly routable in production") is stale and
`DESIGN-SYSTEM.md` is right; correcting L3 is a Wave 0.7 line, not a Wave 1
judgement call.

---

## 7. Depth — full human attention where money and trust live

87 routes × 2 viewports × signed-in/out is ~340 page-states before roles.
Enumerating all of them at human depth is how a sweep runs out of budget at
40% and reports nothing. Two tiers, same coverage claim:

**Tier A is derived from the persona table (§8), not written beside it.**
Every persona's *primary job route* is Tier A by construction. The
pre-review draft hand-wrote a money-and-trust list and thereby tiered three
personas' own routes to smoke-only: the meal subscriber was asked "why 11
meals when I paid 14" about `/account/subscriptions`, which would only ever
have been checked for a 200 and an `<h1>`. Same DRY argument the plan
already won in §6 — apply it once more.

**Tier A — full human depth, all four questions, both viewports:**
`/` · `/shop` · `/product/[slug]` · `/cart` · `/checkout` ·
`/account/orders/[id]` · `/wallet` · `/storefront/[vendor]` · `/sell` ·
`/login` · `/search` · `/snacks` · `/meal-plans/[slug]` ·
`/account/subscriptions` · `/collections` · `/corporate/quote/[token]` ·
`/seller/listings` · `/seller/listings/new` · `/seller/orders` ·
`/seller/payouts` · `/admin/sellers` · `/admin/payouts` · `/admin/support`
— plus `LocationPrompt`, which is the product's *first* interaction and was
in neither tier.

**Tier B — automated smoke, everything else:** renders at 200, no console
error, no horizontal overflow at 360/768/1180, axe `color-contrast` +
structural rules, has an `<h1>`, no dead internal link. Extending the
existing `e2e/tests/a11y.spec.ts` and `presentation.spec.ts` over the
generated inventory covers Tier B **permanently**, which the manual half
never does.

**The two route lists are unified in Wave 0.8.** `a11y.spec.ts` lists 7
routes, `presentation.spec.ts` lists 8 (it has `/hamper`, a11y does not),
and `CLAUDE.md` plus `PRODUCTION-AUDIT.md` M3 both claim the axe suite runs
over "every public route". Both docs are wrong by a factor of four. One
derived list, shared by both specs, drift fails the build, and the two
sentences get corrected in the same commit.

### 7.1 The design contract — what to look *for*, not what not to break

The repo already has a written visual contract (`handoff/design-system/`,
`docs/DESIGN-SYSTEM.md`, `CLAUDE.md`'s token gaps and a11y floor). The
pre-review draft cited it only in §11, as things a *fix* must not break —
the inverse of a judgement criterion, which is why Q1 had no ground truth.
Phrased as things to find, on every Tier A route:

**The five-second read, in order.** Before scrolling, at both widths, name:
(1) the `<h1>` — does it say what this page is in the buyer's words, not
the module's; (2) the primary action — exactly one, above the fold at
390px, the thing this persona came for; (3) the trust signal this page owes
— price, rating, verified badge, or delivery expectation; (4) everything
else. Cannot name 1–3 in five seconds → that is the finding, and the
failing item's number is its title.

**Then the grammar:**

- **Type roles.** Fraunces = display and prices · Plex Sans = body and
  controls · Plex Mono = eyebrows, uppercase, `.12–.22em`. The house
  pattern is **eyebrow → title → body** (it is literally what
  `RouteSkeleton` draws). Any inversion is a P2.
- **Colour roles.** White-first: canvas `#F4F3F0`, cards `#FFFFFF` +
  `1px #ECEAE4`. No beige/cream fills. Gold never carries words
  (`--hk-gold-text-sm` does). Terracotta is prices/remove only.
- **Touch.** 44px minimum tap target. This is a phone-first food product
  and the criterion appears nowhere in the automated tier.
- **Images.** `ImageSlot` `alt` defaults to a *filename* — axe checks
  presence, which always passes, so alt **quality** is a human job. Check
  `sizes` on avatars and thumbnails, and `priority` on the LCP element only.
- **Naming.** Copy says HomeKrafter; `seller` is code. A user-facing
  "seller" is a finding.
- **Withdrawn modules.** No live copy may name laundry as something a buyer
  can still do. **One already does** — see §10.
- **Voice.** `app/not-found.tsx` is the reference: specific, blames nobody,
  two ways out. Straight vs curly apostrophes are inconsistent across
  `client/components/`; pick one in Wave 1 and make the other a P3.

### 7.2 The state contract — five states, each with a definition

"Check the empty states" was four words in the pre-review draft, and
**loading was not mentioned once**. Every Tier A screen owes:

- **Loading** — shape-matched (`RouteSkeleton`) on route transitions; a
  client fetch inside a settled page shows a skeleton *in the slot that
  will fill*, never a bare "Loading…" line, never a layout that jumps when
  data lands. One `aria-live="polite"` announcement, not one per block.
  **Ruling:** the skeleton is the standard; `OrdersListClient`'s bare text
  is the deviation and is a P2.
- **Empty** — three required parts: **what is missing** (a noun), **why**
  (new account / filter too narrow / genuinely none), **the way out** (one
  action). `"No orders in this status."` fails all three.
- **Error** — inline, adjacent to the control that failed, `role="alert"`,
  named in the user's terms, retry without re-entering data. Never
  `error.message` verbatim on a consumer surface.
- **Degraded** — a capability that is off because a provider key is missing
  must *say so*, not vanish and not lie. **Sweep `/wallet` and `/checkout`
  with Razorpay still unset, before Wave 0.1 lands** — that is what a real
  visitor sees today, and Wave 0 is about to hide it forever.
- **In-flight** — every money button (top-up, place order, subscribe,
  payout request, admin pay, admin approve) changes its own label within
  100ms of the click. A button that only disables is a **P1**: it is the
  direct cause of the double-submit Wave 5 is hunting.

**"Usable at 390px" means:** the primary action is reachable without
horizontal scroll and within one viewport-height of the `<h1>`, and every
tap target is ≥44px. Otherwise P1. Tier B measures `scrollWidth` only, so
without this line "unreadable at 390px" has no agreed meaning.

**Sweeping is delegated, not re-invented.** `/qa` (exhaustive tier) and
`/design-review` already do per-surface browser QA with a fix loop, tiering
and before/after health scores. This plan's own contribution is the persona
matrix (§8), the ledger (§9) and the fix rules (§10) — not a second
description of how to click through a website.

---

## 8. The people, and what each one is trying to do

Accounts, passwords, the OTP allowlist and the expected landing per role
are already in `docs/TESTING.md` — that file is the source, and this table
does not restate the credentials.

| Persona | Account | The job they came to do |
|---|---|---|
| **Cold visitor** | none | "Is this real, and can it deliver to me?" Declines the location prompt (most people do; the catalogue must still work). |
| **First-time buyer** | fresh signup | Signs up in the one-field form, adds to cart, **pays with a Razorpay test card**, tracks the order, gets a real message. |
| **Returning shopper** | Ananya | Reorder, wishlist, follow, review a delivered order, cancel one, return another, top up the wallet, redeem a referral. |
| **Meal subscriber** | Ananya | Buys a cycle, skips, pauses, resumes, cancels; checks the arithmetic ("why 11 meals when I paid 14"). |
| **Snack buyer** | any | Menu → pre-order slot → WhatsApp with the slot in the message, and never a cart (channel rule). |
| **Corporate buyer** | quote token only | Opens a quote with no account, accepts once, re-opens a spent link. |
| **Applicant** | none | `/sell` — one question, submits, gets a real acknowledgement. |
| **Brand-new HomeKrafter** | approved during the sweep | Has no password by design. Must get in: the 409 → code route, and the set-password link **actually delivered** (0.3). This flow has broken twice. |
| **Established HomeKrafter** | Anjali / Meera / the two craft studios | Lists an item (→ `pending`), is rejected with a reason, fixes it, resubmits, takes an order, requests a payout, reads analytics, fills the profile meter. |
| **Ex-laundry HomeKrafter** | Ravi | Historical pickups must still render with the module withdrawn. |
| **Admin** | admin | Approves a kitchen, moderates with reasons, answers a ticket, settles a payout, adjusts a wallet, rolls an occasion date, exports CSV, flips a flag. |
| **Keyboard-only / screen-reader user** | any | Every persona above, without a mouse. |

### 8.1 Two arcs, because a jobs table is not an emotional arc

The table above answers Q2 and is useless for Q1 — every cell is a verb
list, and not one names a doubt or a point where the person leaves. The two
that decide whether this marketplace works get written out in beats, each
with an expectation the sweeper can be wrong about:

**The cold visitor who declines location.** (1) The prompt is the product's
*first* interaction, before the hero has earned anything — judge its copy,
its timing, and whether "skip" carries the same weight as "allow". (2)
Declining is a small act of distrust: does the site acknowledge it
("showing everything — set your area anytime"), or just look normal and
quietly wrong? CLAUDE.md's rule is "the API returns the full catalogue
**and the UI says so**"; the draft verified only the first clause. (3) Is
the area picker findable afterwards, or is the core filter gone for good?
(4) Does the page silently get worse — distance gone, sort order now
arbitrary, unexplained? (5) Does a card promise delivery it cannot make?
That last one is the most damaging first impression this product can give.

**The brand-new HomeKrafter, after the door.** (1) Minute one: eight nav
modules, every counter zero, a completion meter — one obvious next action,
or eight equal doors? Does zero-everything read as "you're new" or "this is
broken"? (2) First listing goes `pending` (M22): do they understand it is
invisible to buyers, for how long, and who is looking? This is where a home
cook decides the platform is real or a black hole, and the draft checked
the state transition rather than the comprehension. (3) Rejection: the
reason reaches them verbatim by rule — does it reach them **on the listing,
where they can act**, or only in a notification they may never open? (4)
Day two, nothing has happened: does the product distinguish "you're set up
and waiting" from "something is wrong"? Today it renders the same zeros.
(5) The phone: `/seller/listings/new` at 390px, one-handed, uploading a
photo of a kitchen counter, is the actual job.

Three more arcs get one sweep each and no more: **post-purchase waiting**
(§1's own example — "the thank-you screen never says when the food
arrives"), **the rejected applicant** (a real person told you about their
kitchen and was turned down), and **the buyer whose kitchen doesn't deliver
to them** (the most common tricity outcome).

**One outside pass, before Wave 1.** Walk two competitor checkouts (IGP or
FlowerAura for gifting; a real home baker on Instagram DM for food) and
note what they do that we don't. §1 sets the bar at "judge it like a
competitor's site" and the pre-review draft named no competitor — in the
tricity the real incumbent for home food is Instagram + WhatsApp at a 0%
take rate and zero onboarding friction, which is a supply-lock-in problem
this sweep cannot fix but should at least see.

---

## 9. Waves 1–6 — each ending in judgement

Each wave: **sweep → judge (four questions) → triage → fix → regression
test → re-sweep the fixed surface.** No wave starts before the previous
wave's P0s are closed.

**Wave 1 — Discovery (anonymous).** All public routes, both viewports,
Tier A/B per §7. Judge: does the home page explain what this is in five
seconds; is the first product reachable in two clicks; does declining
location still leave a shoppable site; do price, rating and delivery
expectation agree across card → listing → cart. Includes SEO metadata /
canonical / JSON-LD per route, `sitemap.ts` and `robots.ts` matching the
generated inventory, and the `/gallery` decision.

**Wave 2 — Buying (shopper).** Signup → browse → cart → **card checkout**
→ order → **real notification** → status → cancel (refund *and* cashback
reversal) → return (moves no money) → review (needs a delivered order) →
reorder → referral credit. Then the meal-subscription lifecycle. Judge:
does every screen say what happens next and when; is any money movement
unexplained.

**Wave 3 — Supply (HomeKrafter).** Apply → admin approves → **invite link
actually delivered** → first sign-in → storefront + profile completion →
list an item → moderation round trip with a verbatim reason → availability,
working days, blackout, prep time → order fulfilment → payout request →
analytics. Judge from the home cook's side: could someone non-technical run
their business from this in a week, on a phone.

**Wave 4 — Oversight (admin).** Every queue, every mutation, every export.
Judge: can one person operate the marketplace from here; is any destructive
action unlabelled or unconfirmed; does every refusal capture a reason; does
the audit log answer "who did this".

**Wave 5 — Hostility.** Applied to the flows above, not to pages in
isolation: 390px, keyboard-only + focus traps + skip link, screen-reader
names, **double-click and rapid resubmit on every money button** (top-up,
place order, subscribe, payout request, admin pay, admin approve),
back/forward and deep links, expired session mid-checkout, throttled and
failing API, empty states on a brand-new account, 5,000-character inputs,
and §6's error surfaces — verified in the **production build**, where
soft-404s appear, and on **staging**, where real nginx does.

**Wave 6 — Production reality.** Signed-out read-only smoke, plus the photo
upload described in §3. Then run `/canary` after the last batch of fixes
deploys — it exists, and the draft cited it as covered while assigning it
to no wave, which is the definition of a 2 a.m. Friday.

**No k6 on production.** The draft said "re-run the ramp against realistic
volume". `load/README.md:20` says that ramp "will take the site down, and
pm2 will restart-loop under memory pressure, which means it can stay down
after the run ends"; realistic volume is `load/volume.sql` seeding ~2,000
products, which is a catalogue-corrupting **write** on a pass defined as
read-only; and the p95 2.06 s figure was measured on seeded volume, not on
this box, so "confirm it held" has no baseline. The ramp belongs to the
throwaway twin, gated on the same hosting credential as 0.5.

Then **add `owner` and `date` columns to every open gate in
`docs/LAUNCH-READINESS.md`.** That file already *is* the
non-code gate list, with the exact env var, what it blocks and what it
degrades to; writing a second one produces two lists that disagree inside a
month.

---

## 10. The ledger

`docs/M26-QA-LEDGER.md`, appended live:

```
ID | Wave | Route/flow | Persona | Viewport | Severity | Rule | What happened | Expected | Evidence | Dupe-of | Fix / deferred + why
```

Four columns the draft lacked, each earning its place: **Viewport** (a
390px-only defect and a both-widths defect are different bugs),
**Rule** (the `CLAUDE.md` / `DESIGN-SYSTEM.md` / §7.1 line it violates —
what makes a finding arguable rather than asserted), **Evidence** (a
screenshot path; the plan mandates real screenshots and the draft then
discarded them), and **Dupe-of** — because "every seller empty state is a
bare sentence" is *one* finding with N call sites, not eleven findings, and
that single ambiguity decides whether an 80-finding budget terminates.

Each wave also opens a `## Wave N — proposals (max 5)` section for the
capped Q1/Q3 items, which otherwise have nowhere to live: six waves × five
proposals is up to thirty pieces of thinking with no container.

Severity per §2, written before the fix is estimated. A finding is closed by
a diff or by a written deferral, never by an opinion. At the milestone's
end the ledger is reconciled into `docs/PRODUCTION-AUDIT.md` and stops being
a separate living document.

### 10.1 Coverage lives in a different file, because the ledger cannot hold it

**The ledger records what was found, not where you stopped.** A clean route
produces zero rows — indistinguishable from a route nobody opened. On day 3
of a six-day sweep, interrupted, the DoD's first line ("every route opened,
in every role, at both viewports") is unanswerable. That is not an edge
case on a six-day sweep; it is Tuesday.

`docs/route-inventory.tsv` is therefore a **checklist**, generated by
`scripts/route-inventory.sh` (which `cd`s to the repo root — the draft's
one-liner used relative paths under a `CLAUDE.md` rule that says web
commands run from `client/`, so it would have written
`client/docs/route-inventory.txt` and found nothing):

```
route	tier	roles	resolver	expected_status	swept_1280	swept_390	notes
/checkout	A	consumer	seed:cart	200	2026-08-11	2026-08-11
/meal-plans/[slug]	A	anon	seed:meal-plans	200	—	—
/corporate/quote/[token]	A	anon	mint:qa-up.sh	200	—	—
/laundry	B	anon	—	404	—	—	EXPECTED_404
```

Git-diffable, answers "what's left" with `grep -c '\t—\t'`, and gives the
6-day / 80-finding budget a denominator it otherwise lacks. The `resolver`
and `UNRESOLVED` concepts §5.3 invents live **here**, where a human can
read them, not only inside a spec file.

**Each wave closes with a `## Wave N — closed <date>` heading** carrying the
P0 count and the swept-route count. "No wave starts before the previous
wave's P0s are closed" needs something to be true *of*.

### 10.2 Two sweepers at once

Likely shape here is a person and an agent session, and they collide five
ways: one appended markdown file, unprefixed finding IDs, hardcoded ports
3100/4100, one `hk_qa`, and a shared `e2e/.auth/*.json` storage state.

- **The ledger is single-writer.** A second sweeper files into
  `docs/M26-QA-LEDGER-<name>.md`, merged at wave close.
- **Finding IDs are prefixed per sweeper** — `A-001`, `B-001`.
- **The second stack runs parameterised:**
  `QA_DB=hk_qa2 QA_WEB_PORT=3101 QA_API_PORT=4101 ./scripts/qa-up.sh`.
- **Tier B shares the sweep stack** (`E2E_BASE_URL` already defaults to
  :3100) and one of its specs writes an address to the demo shopper —
  re-seed before a Tier A pass over `/account`.

**Row 1 is already written.** Found while reviewing this plan, verified in
the source: `client/components/account/OrdersListClient.tsx:49,70` — a
brand-new buyer's orders page is subtitled "Marketplace orders and laundry
bookings, in one place" and its empty state reads "bookings made on Laundry
will show up here." Laundry was withdrawn in M19 and `/laundry` 404s. The
first screen a new account sees points at a module that does not exist.
**P2.** (The `laundry` filter chip at `:18` stays — historical bookings
still render, which is exactly why the models were kept.)

## 11. Rules for fixes made during the sweep

- **A P0/P1 fix lands with a test in the layer that would have caught it.**
  Browser-only defect → a spec in `e2e/`; a query-enforced rule →
  `server/test/e2e/`. This is the M23 rule and the reason the browser layer
  exists.

  **And the test must be shown red against the parent commit.** CI can
  check that the suite is green and that a source commit also touched a
  spec; it cannot check that the spec is in the right layer, and — the part
  that matters — it cannot check that the spec **fails without the fix**.
  This repo already knows that failure mode: `docs/TESTS.md` says "a number
  recorded from a run locks in whatever the code did, including the bug."
  So the ledger's Fix column records the command that reproduces the
  failure on the parent commit — stash the fix, run the new spec, paste the
  red output. A reviewer checks that in ten seconds; no CI job can.

- **Three specs are owed by rules this plan invents**, and a rule with no
  test is a preference: (1) the **degraded-provider** copy — force
  `GET /payments/config` to `{cardPayments:false}` via `page.route` and
  assert the honest message plus the refusal, because once 0.1 lands, that
  branch never renders in CI again and rots silently; (2) the **in-flight
  label** on all six money buttons, which is the M23-shaped defect that
  created this layer; (3) **an order survives a failed notification** —
  `CLAUDE.md` mandates `void notify()` so a paid order never rolls back,
  and once 0.3 lands real providers nothing asserts it.

- **Fix `e2e/tests/auth.setup.ts` in the same wave.** Both viewport projects
  depend on it, so one rotated demo password fails every test as a 30 s
  hook timeout. Catch the 401 and throw "demo credentials rejected — see
  docs/TESTING.md". Add a fourth storage state minted through the **invite
  link**, since Wave 3's persona is the one that "has broken twice" and the
  current fixture signs in through a door that persona does not have.
- **No fix may violate `CLAUDE.md`.** In particular: the moderation
  allowlist (`PUBLICLY_LISTED`, never `{ not: 'hidden' }`), gold never as
  text, uploads never optimised by `next/image`, `.rotate()` before the
  metadata strip, cancel reverses cashback, a return moves no money, a
  seller cannot self-verify, `@BooleanField()` on every boolean DTO field.
  A rule that turns out to be *wrong* is a proposal to the owner, not an
  edit.
- **Scope discipline:** a finding that is a Phase 3/4 backlog item is
  logged and left.
- **Copy is in scope at P2**, and only reaches P1 when it causes a wrong
  action.

## 12. Risks

- **The sweep finds more than one milestone of work.** Held by the §2
  budget and the severity predicates.
- **Wave 0 depends on procurement.** Every item has a documented "if it
  cannot be obtained" branch, so the milestone degrades instead of
  blocking. 0.2, 0.7 and 0.8 need no procurement at all.
- **Staging is a second public copy of the site.** `noindex` + basic auth is
  part of 0.5, not a follow-up.
- **A local stack is not production.** Which is the whole reason for 0.5 and
  for Wave 6's single real upload.
- **The real constraint is not page quality.** It is that nothing has ever
  been sold: zero real buyers, zero real HomeKrafters. This milestone makes
  the product ready to be used; it does not get it used. That is M27, and
  the CEO review argues it should have been M26.

---

# GSTACK REVIEW REPORT

Generated by `/autoplan` on 2026-08-08, branch `main`, commit `a0335d7`.
Codex voice: **[codex-unavailable — usage limit until Sep 3]** in all
phases; every dual-voice step ran **[subagent-only]**, with each factual
claim verified against the repo before it was accepted.

## Phase 1 — CEO Review (SELECTIVE EXPANSION)

### What already exists (0B)

| Sub-problem the plan states | Already exists | Verdict |
|---|---|---|
| Drive a browser through user flows | `/qa`, `/qa-only`, `/browse`, Playwright MCP | **Delegate** — the plan re-described these in prose |
| Designer's-eye judgement pass | `/design-review` | Delegate |
| Browser regression net | `e2e/` — 6 specs, desktop + Pixel 7, `auth.setup.ts` | Extend |
| Contrast + structure sweep | `e2e/tests/a11y.spec.ts` | Extend — **7 of ~31 public routes** |
| Overflow sweep | `e2e/tests/presentation.spec.ts` | Extend — **8 routes, and it disagrees with a11y on `/hamper`** |
| Personas, demo accounts, OTP allowlist | `docs/TESTING.md` | Reuse, do not restate |
| Severity ladder + flow walkthroughs | `docs/PRODUCTION-AUDIT.md` §3 | Reuse |
| Non-code launch gate checklist | `docs/LAUNCH-READINESS.md` §0/§1/§3/§4 | **Reuse** — the plan promised to write a second one |
| Load behaviour | `load/` — k6 50→200→500→1000 ramp | Re-run |

### NOT in scope

Native apps · image CDN / stored upload variants · multi-city · rebuilding
laundry · take-rate **collection** plumbing (the decision is Wave 0.6) ·
recruiting real HomeKrafters (M27) · cohort/retention analytics ·
real support conversations (Phase 3) · notification template/provider
hardening beyond "a message actually arrives".

### Dream state delta

```
CURRENT                          THIS PLAN                        12-MONTH IDEAL
feature-complete, deployed,  ->  a stranger can pay; every    ->  QA is continuous: derived route
4 test layers, zero sweep,       route × persona driven at        matrix gates every deploy, canary
no monitoring, 4 non-code        assigned depth; P0/P1 closed     after, providers real, take-rate
gates open, admin takeable       with a test each; gates owned    collected, supply self-serve
```

The sweep itself is a one-time artifact. The residue that survives into M27
is: the generated route inventory, the unified browser route list, Sentry +
one funnel, and a spec per P0/P1. Those are the deliverables to protect if
the budget runs out.

### Error & Rescue Registry — the sweep's own failure modes

| Codepath | What can go wrong | Rescued? | Rescue action | What the operator sees |
|---|---|---|---|---|
| `prisma migrate deploy` on a new QA DB | local lineage divergence | Y | use a fresh `hk_qa`, never the dev DB | documented in `docs/TESTS.md` |
| `e2e/auth.setup.ts` | demo password rotated | N ← **GAP** | fail with "demo credentials rejected", not a timeout | currently a 30 s hook timeout |
| Wave 6 prod pass | an accidental write | N ← **GAP** | signed-out session only; the single upload is scripted and deletes itself | nothing today prevents it |
| Staging box | env var left at the production value | Y | `docs/DEPLOY.md:183` already warns | — |
| A sweep fix | silently breaks a `CLAUDE.md` rule | Y | `client/lib/*.spec.ts` + `server/test/e2e` are the guard; run both before each fix lands | red suite |
| Ledger | finding recorded, fix never lands | N ← **GAP** | DoD reconciliation into `PRODUCTION-AUDIT.md` closes it | — |
| Wave 0 procurement | a key cannot be bought | Y | per-item "if it cannot be obtained" branch (§5) | wave marked OWED |

### Failure Modes Registry

| Failure | Likelihood | Impact | Mitigated by |
|---|---|---|---|
| Sweep judges stubbed payment/notification flows and is re-run | was **High** | High | Wave 0 (0.1, 0.3) — **closed by this review** |
| Admin account taken over mid-sweep via `/auth/social` | Med | Critical | Wave 0.2 — flag or JWKS, needs no procurement |
| Staging indexed by Google as a second Homekrafted | Med | High | Wave 0.5 `noindex` + basic auth |
| Budget consumed by Q1/Q3 opinion work | High | Med | §1 five-proposal cap; §2 budget |
| Route inventory drift → "every route opened" is false | **Confirmed already true** | High | Wave 0.8 generator + CI check |
| Conversion work done at a negative unit economic | High | Med | Wave 0.6 take-rate decision |
| Sweep uploads saturate 1 vCPU (image pipeline is inline on the request) | Med | Low | keep Wave 3/6 uploads to single photos |

### Decision Audit Trail

| # | Phase | Decision | Class | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | CEO | Approach **B + C's durable half**: delegate sweeping to `/qa` + `/design-review`, require a spec per P0/P1 and a derived route matrix | Auto | P1, P4 | Reuses tiering/fix-loop/health scores; the automated half survives into M27 | A (findings don't survive), C alone (no finding for days) |
| 2 | CEO | **Wave 0 blocks the sweep** | **USER GATE** | — | Owner chose "Wave 0 first, then the full sweep" at the premise gate | Sweep-now; reframe-to-first-transaction |
| 3 | CEO | Route inventory generated from the filesystem + CI drift check | Auto | P4 | The hand-written list was already wrong: 87 files, seller 21 not 18, admin 23 not 24 | Hand-maintaining it |
| 4 | CEO | One derived route list shared by `a11y.spec.ts` and `presentation.spec.ts`; drift fails the build; correct the two docs claiming "every public route" | Auto | P4, P2 | The lists already disagree on `/hamper`, and two docs assert something false | Patching a11y for one milestone |
| 5 | CEO | Two-tier depth: full human depth on ~15 money/trust routes, automated smoke on the rest | Auto | P1, P3 | Same coverage claim, a fifth of the cost, and the automated half is permanent | Enumerating ~340 page-states by hand |
| 6 | CEO | Sentry + one analytics funnel into Wave 0 | Auto | P2 | Verified zero monitoring dependency in either package; Q1 is otherwise opinion forever | Deferring to Phase 3 |
| 7 | CEO | Delete the duplicate gate checklist; add `owner`/`date` to `LAUNCH-READINESS.md` | Auto | P4 | That file already carries every env var, what it blocks and its degraded behaviour | A second list |
| 8 | CEO | Staging must be `noindex` + basic auth | Auto | P1 | Otherwise it is a public unverified copy of the site with real-looking data | Open staging |
| 9 | CEO | Q1/Q3 capped at five proposals per wave, not implemented | Auto | P3, P6 | Every real defect this project caught came from Q2/Q4; Q1/Q3 have no stopping rule | Unbounded "copy is in scope" |
| 10 | CEO | `CHANGELOG.md` M22–M24 reconciliation as Wave 0.7 | Auto | P1 | Newest-but-one heading is `[M21] … (in progress)` holding what CLAUDE.md calls M23 | Leaving it |
| 11 | CEO | Wave 6 does one real photo upload on production, then deletes it | Auto | P1 | Exactly the action that found the M25 bug after nine invisible milestones | Pure read-only |
| 12 | CEO | One competitive pass before Wave 1 | Auto | P1 | The plan set its bar at "judge like a competitor's site" and named no competitor | Skipping it |
| 13 | CEO | Severity predicates + a 6-day / 80-finding budget | Auto | P3 | The old DoD was self-graded and uncapped | Unbounded sweep |
| 14 | CEO | Recruiting real HomeKrafters → **deferred to M27** | Auto | P3 | The strongest CEO recommendation, but it substitutes the owner's stated goal rather than scoping it | Folding it into M26 |

### Sections 1–11 — what was examined

- **§1 Architecture.** The "system" here is the QA apparatus: three
  environments, four test layers, one fix pipeline. New coupling: Wave 0
  binds the milestone to external providers, so each item carries a
  degradation branch. Single points of failure: the seeded DB and
  `auth.setup.ts`. Rollback: every fix is a commit on a branch;
  `scripts/deploy.sh` + pm2 is the revert path. No new production
  component is introduced except Sentry and staging.
- **§2 Error & Rescue.** Registry above. Three GAPs found, all cheap.
- **§3 Security.** Four findings: `/auth/social` (High/Critical, now Wave
  0.2), staging exposure (Med/High, now 0.5), the prod pass running as an
  authenticated admin (Med/High, now signed-out-only), and Razorpay
  webhook-secret handling on a real key (Low/High, `DEPLOY.md` env
  section, never committed). `OTP_TEST_CODE` must not be set on staging
  with an admin-reachable number.
- **§4 Data flow & interaction edge cases.** The plan's Wave 5 already
  covers the matrix; the gap was that the money buttons were unnamed. Now
  enumerated: top-up, place order, subscribe, payout request, admin pay,
  admin approve. Admin queues' "results change mid-page" is already
  guarded by the pagination e2e specs.
- **§5 Code quality (of the plan as an artifact).** Three DRY violations
  against existing files — the route inventory, the persona table
  (`TESTING.md`), the gate checklist (`LAUNCH-READINESS.md`). All three
  now point at the source instead of copying it.
- **§6 Test review.** See the Eng phase's test diagram.
- **§7 Performance.** The k6 ramp exists and previously exposed a full
  table scan at 2,017 products (p95 2.06 s); Wave 6 re-runs it to confirm
  the index held. Note for Wave 3/6: `image-pipeline.ts` re-encodes inline
  on the request on a 1 vCPU box — bulk uploads are not a sweep activity.
- **§8 Observability.** The headline finding: **nothing exists.** Zero
  Sentry/analytics dependency in either package. Now Wave 0.4.
- **§9 Deployment.** Environment parity was the plan's weakest point
  (premise P3) and is now Wave 0.5. Post-deploy verification already has a
  home in `/canary`; M26 does not add a new mechanism.
- **§10 Trajectory.** Reversibility 5/5 — this milestone produces tests,
  config and docs. Debt introduced: one more living document (the ledger),
  retired at the end by folding it into `PRODUCTION-AUDIT.md`. Debt
  retired: the hand-maintained route lists.
- **§11 Design.** Deferred to Phase 2 below.

### CEO completion summary

| | |
|---|---|
| Mode | SELECTIVE EXPANSION |
| Findings | 17 from the independent voice; 5 verified against the repo and load-bearing |
| Premise gate | Passed **with revision** — Wave 0 now blocks the sweep |
| Auto-decisions | 13 |
| Deferred | Real-supply recruitment (M27), take-rate plumbing, cohort analytics |
| Biggest change | The plan would have certified a checkout no stranger can complete |

## Phase 2 — Design Review

**Initial rating: 4.0/10 on design completeness** — an excellent
engineering QA plan and a weak design QA plan that did not know the
difference. Every engineering criterion was unpasteable (§11's fix rules,
Wave 0, the money-button list, "why 11 meals when I paid 14"); every design
criterion was boilerplate any Next.js project could paste in (`<h1>`,
overflow, contrast, 390px) — all four already automated in Tier B, which
made Tier B the entire design bar.

**DESIGN.md status:** the repo has a real one (`handoff/design-system/` +
`docs/DESIGN-SYSTEM.md`). The plan cited it once, in §11, as things a *fix*
must not break — the inverse of a judgement criterion. That inversion was
the root cause of most findings below.

### Pass scores

| Pass | Before | After | What changed |
|---|---|---|---|
| 1. Information architecture | 4 | 8 | §7.1's five-second read order + the eyebrow → title → body grammar the repo already encodes in `RouteSkeleton` |
| 2. Interaction state coverage | 3 | 8 | §7.2 state contract. Loading was **not mentioned once** in the draft; degraded, in-flight, offline, stale and `pending`-moderation were all absent |
| 3. User journey / emotional arc | 4 | 7 | §8.1 writes out the two hardest arcs in beats; three more named with one sweep each |
| 4. Specificity (anti-slop) | 6 | 8 | The design half now names this product's own rules — gold-as-text, terracotta, the type triad, 44px, `ImageSlot` alt/sizes/priority, HomeKrafter vs seller |
| 5. Design-system alignment | 2 | 8 | §7.1 exists at all |
| 6. Responsive & a11y | 5 | 7 | "Usable at 390px" now has a definition; tap targets named. Zoom-to-200%, reduced-motion and SR *quality* remain owed (logged) |
| 7. Unresolved design decisions | — | — | Eight divergence points surfaced; five ruled below, three deferred |

```
DESIGN LITMUS — CONSENSUS
═══════════════════════════════════════════════════════════════
  Question                              Claude  Codex  After fixes
  ───────────────────────────────────── ─────── ────── ───────────
  1. Is "good design" falsifiable?      NO      N/A    YES (§7.1/7.2)
  2. All interaction states specified?  NO      N/A    YES (§7.2)
  3. Each persona's arc covered?        NO      N/A    PARTIAL (2 of 5 in beats)
  4. Criteria specific to THIS product? NO      N/A    YES
  5. A11y bar concrete + measurable?    NO      N/A    PARTIAL (zoom/motion/SR owed)
  6. Responsive bar concrete?           NO      N/A    YES (390px defined)
  7. Two sweepers, same verdict?        NO      N/A    LIKELY (5 of 8 ruled)
═══════════════════════════════════════════════════════════════
Codex: [codex-unavailable]. Single critical finding from one voice flagged regardless.
```

### Rulings made (so two sweepers agree)

1. **Q1 vs Q4 routing** — prevents the action → Q4/P1; merely worse → Q1,
   capped. Without it the plan rewarded laundering design findings through
   Q4 to get them actioned.
2. **Loading idiom** — skeleton in the slot that will fill is the standard;
   `OrdersListClient`'s bare "Loading your orders…" is the deviation, P2.
3. **Empty state** — three required parts, so "is a bare sentence a
   finding" stops being an argument.
4. **"Usable at 390px"** — primary action within one viewport-height of the
   `<h1>`, no horizontal scroll, 44px targets.
5. **One root cause = one finding** with N call sites (`Dupe-of`), which is
   what makes the 80-finding budget terminate.

Deferred: whose taste settles a five-second test (mitigated — every Q1
finding now owes a screenshot and a counter-proposal); the competitor pass
becoming named criteria rather than notes; straight vs curly apostrophes
(39 vs 5 in `client/components/`) — Wave 1 picks one, the other is P3.

### Design decisions logged

| # | Decision | Class | Principle |
|---|---|---|---|
| 15 | Tier A derived from the persona table, not written beside it | Auto | P4, P1 |
| 16 | §7.1 design contract — the repo's own rules as things to look *for* | Auto | P1, P5 |
| 17 | §7.2 state contract — five states, each defined | Auto | P1 |
| 18 | Q1-vs-Q4 routing rule stated explicitly | Auto | P5 |
| 19 | Skeleton is the loading standard; bare text is a P2 | **Taste** | P5 |
| 20 | Ledger gains Viewport / Rule / Evidence / Dupe-of; waves get a proposals section | Auto | P1 |
| 21 | "Usable at 390px" defined; 44px tap targets named | Auto | P5 |
| 22 | `/gallery` needs no decision — it is gated; `PRODUCTION-AUDIT` L3 is stale | Auto | P4 |
| 23 | Sweep `/wallet` + `/checkout` **before** Wave 0.1 lands, to record the degraded state | Auto | P1 |
| 24 | The Laundry empty-state copy bug filed as ledger row 1 | Auto | P1 |

## Phase 3 — Eng Review

Every factual claim spot-checked by the independent voice held: 87 route
files, seller 21 / admin 23, `/hamper` in `presentation.spec.ts` and not in
`a11y.spec.ts`, CHANGELOG jumping M25 → `[M21] … (in progress)`,
`PRODUCTION-AUDIT` L3 stale, ledger row 1 at `OrdersListClient.tsx:49,70`,
zero Sentry/analytics dependency, no `jose`/`google-auth-library`/`jwks-rsa`
in `server/package.json`, `AuthContext.tsx:583` minting a nanoid as
`providerAccountId`, `load/README.md:20`, `/laundry` calling `notFound()`
unconditionally.

**The plan was not wrong about what is broken. It was wrong about what
fixing it costs**, in three places that all pointed at one missing
resource — a hosting credential.

### Architecture of the QA apparatus

```
                      ┌──────────────────────────────┐
   the sweeper ──────▶│ Playwright MCP · /qa          │
                      │ /design-review                │
                      └───────────┬───────────────────┘
                                  │ drives
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
  ┌───────────┐            ┌─────────────┐            ┌─────────────┐
  │ local     │            │ staging     │            │ production  │
  │ hk_qa     │            │ (BLOCKED —  │            │ (read-only, │
  │ :3100/:4100│           │  credential)│            │  1 upload)  │
  └─────┬─────┘            └──────┬──────┘            └──────┬──────┘
        │                         │ needed by 0.1's webhook  │
        │                         │ and Wave 5's "real nginx"│
        └─────────────┬───────────┴──────────────────────────┘
                      ▼
              ┌───────────────┐        ┌──────────────────────┐
              │ ledger        │───────▶│ fix + spec in the    │
              │ (findings)    │        │ layer that'd catch it│
              └───────────────┘        └──────────┬───────────┘
                                                  ▼
                    ┌─────────────────────────────────────────┐
                    │ 4 layers: client unit · server unit ·   │
                    │ server e2e · e2e/ (Playwright) + CI     │
                    └─────────────────────────────────────────┘

  SPOF 1: one VPS — staging cannot co-tenant (1 vCPU, build capped at 3072MB)
  SPOF 2: e2e/auth.setup.ts — both viewport projects depend on it
  SPOF 3: a fourth concurrent database (hk_qa) beside test/browser/dev
```

**Coupling introduced:** Wave 0 binds the milestone to five external
services. Each now carries a degradation branch (§5) so the milestone
degrades rather than blocks. **What breaks first:**
`presentation.spec.ts`'s in-test loops against the 30 s default timeout,
then the extended axe wall, then the 18 dynamic routes.

### Findings folded into the plan

| # | Severity | Finding | Where it landed |
|---|---|---|---|
| C-1 | Critical | The dependency graph terminates in one node — staging — blocked on a hosting credential the repo already recorded as unobtainable; co-tenanting on the production box is an outage | §5.1 — local-only is now the default path, staging is an upgrade with a named blocker |
| C-2 | Critical | Wave 6's k6 re-run contradicts `load/README.md` ("it will take the site down"), writes ~2,000 products on a read-only pass, and has no comparable baseline | Wave 6 — line struck, ramp returned to the throwaway twin |
| C-3 | Critical | Of 0.2's two branches only the flag is achievable; JWKS needs a library that isn't installed, an id-token the client never obtains, credentials nobody has, and a `providerAccountId` migration — without which **the takeover survives the fix** | §5.2 — six-part flag spec |
| H-1 | High | `presentation.spec.ts` loops routes *inside* a test and the config sets no `timeout`; at 31 routes it times out before finding a bug | §5.3 step 1 |
| H-2 | High | 18 of 87 routes are dynamic and unnavigable without fixtures; three are hostile to one | §5.3 step 2 — resolver column, `UNRESOLVED` declared in the file |
| H-3 | High | `/laundry` and `/gallery` 404 by design in exactly the mode every wave's final pass runs | §5.3 step 3 — `EXPECTED_404`, asserted |
| H-4 | High | The extended axe suite lands red (~236 assertions; `--hk-muted` previously failed at 306 call sites) and eats the 80-finding budget before a human opens a page | §5.3 step 5 — reporter first, build-failing second |
| H-5 | High | "A fix lands with a test in the layer that would have caught it" is unenforceable by CI — it cannot check the spec **fails without the fix** | §11 — red-against-parent-commit evidence in the ledger |
| H-6 | High | 0.1 permanently deletes the degraded-provider branch and leaves nothing behind | §11 — forced-config spec |
| H-7 | High | The in-flight-label rule is invented and untested | §11 + test plan #3 |
| H-8 | High | Twilio to Indian numbers needs TRAI DLT registration — **weeks**, not hours | §5.1 — SMS expected stubbed through M26 |
| M-1…M-12 | Medium | DB-name guard; strict-mode `<h1>`; role column; cookie-vs-localStorage location fixture; generator regex; staging webhook carve-outs; staging admin password + `OTP_TEST_*` + build-time canonical; Wave 6's "one write" is four; throttle fights the sweep; Sentry needs env tags + `beforeSend`; 0.6 needs an artifact; `auth.setup.ts` failure message + invite-link state | §5.1–§5.4, §3, §11 |

### Test diagram + plan

Written to
`~/.gstack/projects/Saksham-20-HomeKrafted/main-test-plan-20260808-181500.md`.
**Ten of thirteen guarded behaviours are owed a test; nine are new files or
restructures.** Three of them exist only because this plan invented a rule
(degraded copy, in-flight label, order-survives-failed-notification) — and
a rule with no test is a preference.

```
ENG DUAL VOICES — CONSENSUS TABLE
═══════════════════════════════════════════════════════════════
  Dimension                            Claude   Codex   Consensus
  ──────────────────────────────────── ──────── ─────── ─────────
  1. Architecture sound?               PARTIAL  N/A     FLAGGED → fixed (§5.1)
  2. Test coverage sufficient?         PARTIAL  N/A     FLAGGED → fixed (§5.3, §11)
  3. Performance risks addressed?      NO       N/A     FLAGGED → fixed (k6 struck)
  4. Security threats covered?         PARTIAL  N/A     FLAGGED → fixed (§5.2, §5.4)
  5. Error paths handled?              PARTIAL  N/A     FLAGGED → fixed (§11)
  6. Deployment risk manageable?       NO       N/A     **PARTIAL** — see below
═══════════════════════════════════════════════════════════════
Codex: [codex-unavailable]. Single critical finding from one voice flagged regardless.
```

**Row 6 is the one that stays open.** Reversibility was scored 5/5 on
"every fix is a commit", but `scripts/deploy.sh` runs `migrate deploy`,
production's `_prisma_migrations` lineage is already divergent, and backups
are **local disk only with nothing copied off the box**. Eighty findings of
fixes will not all be schema-free, and `git revert` is not a rollback for
one that carried a migration. M26 adds `/canary` to Wave 6, which closes
the *detection* half; the **backup-offsite and migration-rollback halves
are not in this milestone's scope and are now named as a launch gate** in
`LAUNCH-READINESS.md` rather than assumed.

### Eng decisions logged

| # | Decision | Class | Principle |
|---|---|---|---|
| 25 | Local-only is the default path; staging is an upgrade with the credential named as its blocker | Auto | P3, P6 |
| 26 | Strike the k6 re-run from Wave 6 | Auto | P1 |
| 27 | The social flag is the only branch; JWKS is a blocked feature build | Auto | P3, P5 |
| 28 | §5.3's seven-step ordering — restructure before the route list grows | Auto | P1, P5 |
| 29 | Axe extension lands as a reporter first, build-failing second | **Taste** | P3 |
| 30 | The layer rule requires red-against-parent evidence in the ledger | Auto | P5 |
| 31 | Three new specs for the rules this plan invents | Auto | P1 |
| 32 | Wave 6 uses an existing kitchen and accepts one orphaned file | Auto | P3 |
| 33 | SMS expected stubbed through M26 (DLT lead time) | Auto | P6 |
| 34 | Backup-offsite + migration-rollback named as a launch gate, not fixed here | Auto | P3 |

## Phase 3.5 — DX Review

The developer here is a future session — a person or an agent — picking
this up cold. **The plan is the product and its runbook is the API.** The
independent voice rated it **8.5/10 as a specification and 4.1/10 as a
developer experience**, and found the review's single biggest defect while
doing it: §5.5, the browser layer red on `main` since M25. Every claim was
verified in source before it was accepted.

### Developer journey — cold start, as the draft was written

| Stage | Draft | After |
|---|---|---|
| Find "what do I do first" | ~8–10 min (1,060 lines, no TOC, runbook at line 123 under "Where this runs") | §0, first screen |
| Install | never mentioned | `qa-up.sh` step 1 |
| Boot the API | **fails** — no `server/.env`, `JWT_ACCESS_SECRET` missing | script writes it |
| Seed | 1 of 3 seeds → `/meal-plans` and `/gifts` empty, both Tier A | all three |
| Web app | `cd client` from `server/`; `NEXT_PUBLIC_SITE_URL` unset → production canonicals on localhost | script writes `.env.qa` |
| Open a page | 25–35 min after debugging | ~8 min |
| First finding | ~45 min | ~12 min |
| Run Tier B first | +30–90 min on a silent skip, no error pointing at the cause | named in §0.1, fixed by 0.9 |

**TTHW: fails → 25–35 min (debugged) → target 8 min.**

### DX scorecard

| Dimension | Before | After |
|---|---|---|
| Getting started / TTHW | 3 | 8 (`qa-up.sh` + §0; 8 min is asserted, not yet measured) |
| Command ergonomics + ledger format | 4 | 7 (script + parameterised ports; ledger stays markdown by choice) |
| Error messages | 5 | 8 (§0.1's eight symptom→cause→command rows) |
| Documentation findability | 3 | 7 (TOC, §0, "the card is §7.1+§7.2") |
| Escape hatches | 5 | 8 (coverage TSV, wave sign-off, single-writer ledger) |
| Consistency | 7 | 8 (`TESTING.md`'s stale Phone-tab line added to 0.7) |
| Progressive disclosure | 4 | 7 (§0 states the doing order; §5.1/§5.3 still sit below what they correct) |
| Upgrade / resumability | 2 | 8 (§10.1 + §10.2) |

**Overall 4.1 → 7.6.**

```
DX DUAL VOICES — CONSENSUS TABLE
═══════════════════════════════════════════════════════════════
  Dimension                            Claude   Codex   After fixes
  ──────────────────────────────────── ──────── ─────── ───────────
  1. Getting started < 5 min?          NO       N/A     ~8 min (target)
  2. Commands copy-paste correct?      NO       N/A     YES (script)
  3. Error messages actionable?        NO       N/A     YES (§0.1)
  4. Docs findable?                    NO       N/A     YES (§0 + TOC)
  5. Resumable after interruption?     NO       N/A     YES (§10.1)
  6. Safe to run concurrently?         NO       N/A     YES (§10.2)
═══════════════════════════════════════════════════════════════
Codex: [codex-unavailable].
```

### DX decisions logged

| # | Decision | Class | Principle |
|---|---|---|---|
| 35 | **Wave 0.9 — repair the browser layer first.** It is red on `main` and reports as skipped | Auto | P1 |
| 36 | `scripts/qa-up.sh` replaces the pasted shell block; ports and DB parameterised | Auto | P5, P3 |
| 37 | All three seed files, and a minted corporate quote, in setup | Auto | P1 |
| 38 | §0 quick start + TOC + "the card is §7.1/§7.2" | Auto | P5 |
| 39 | §0.1 failure table — eight symptoms, each with the command | Auto | P1 |
| 40 | `route-inventory.tsv` as a coverage checklist, not a list | Auto | P1 |
| 41 | Ledger is single-writer; second sweeper gets their own file and ID prefix | Auto | P3 |
| 42 | `docs/TESTING.md`'s stale Phone-tab instruction added to 0.7 | Auto | P2 |
| 43 | Review report stays in this file rather than splitting to `M26-QA-PLAN-REVIEW.md` | **Taste** | P3 |

## Cross-phase themes

Four concerns surfaced independently in two or more phases. Independent
recurrence is the strongest signal this review produced.

**1. Hand-maintained lists drift, and this repo's docs already assert
things that are false.** CEO: the route inventory (85 vs 87, seller 18 vs
21), `CHANGELOG.md` missing M22–M24, `CLAUDE.md` + `PRODUCTION-AUDIT.md`
claiming the axe suite covers "every public route" when it covers seven.
Design: `PRODUCTION-AUDIT` L3 calling `/gallery` publicly routable when it
404s. Eng: two spec route lists disagreeing on `/hamper`. DX:
`docs/TESTING.md` telling an approved HomeKrafter to use a Phone tab forty
lines after saying the tabs are gone. **Every list a human maintains by
hand in this repo has drifted.** That is why 0.8 generates the inventory
and 0.7 is an hour of corrections, not a chore.

**2. The plan asserted rules it had no way to enforce.** Eng found three
invented rules with no test (degraded copy, in-flight label, order survives
a failed notification) and that the layer rule itself is unenforceable by
CI. Design found five judgements with no definition. DX found the fixture
those tests run on is broken. **A rule with no test is a preference**, and
this plan was going to ship nine of them.

**3. Lead time was underestimated everywhere it mattered.** CEO: severity
self-graded and uncapped. Eng: Wave 0 priced in hours, actually 3–5
human-days and 2+ weeks of calendar (DLT registration, one hosting
credential). DX: the setup block does not boot at all. The pattern is
consistent — **the plan costed the typing, not the waiting.**

**4. Something declared "already covered" was covered by nothing.** CEO
wrote that post-deploy verification "already has a home in `/canary`" and
no wave ran it. Eng found reversibility scored 5/5 against a divergent
migration lineage and local-only backups. DX found the browser layer
reporting green while skipping. **"It exists" and "it runs" are different
claims**, and this plan made the first three times.

## Implementation tasks

Ordered by the doing order in §0, not by phase.

- [ ] **T1 (P1, human ~0.5 d / CC ~2 h) — `e2e/`** — Wave 0.9: rewrite
  `auth.setup.ts` + `error-paths.spec.ts` against the M25 one-field form;
  add the 409 → code branch and an invite-link storage state; fix
  `ci.yml` `JWT_SECRET` → `JWT_ACCESS_SECRET`; make a setup failure name
  itself. *Surfaced by: DX. Files: `e2e/tests/auth.setup.ts`,
  `e2e/tests/error-paths.spec.ts`, `.github/workflows/ci.yml`.*
- [ ] **T2 (P1, ~2 h / ~30 m) — `scripts/`** — Wave 0.0: `qa-up.sh`,
  `route-inventory.sh`, `docs/M26-QA-LEDGER.md` with row 1,
  `docs/route-inventory.tsv` as a coverage file.
- [ ] **T3 (P1, ~0.5 d / ~2 h) — `server/src/auth/`** — Wave 0.2: the
  six-part social-login flag (§5.2), including the e2e 404 assertion and
  purging stub `SocialAccount` rows.
- [ ] **T4 (P1, ~1 d / ~4 h) — `e2e/`** — §5.3 steps 1–7: restructure the
  loops, add `timeout`, resolver + `UNRESOLVED`, `EXPECTED_404`, role
  column, `.first()` on the `<h1>` locator, regex fix. **Before** the
  route list grows.
- [ ] **T5 (P2, ~0.5 d / ~3 h) — `docs/`** — Wave 0.7: three CHANGELOG
  entries, `PRODUCTION-AUDIT` L3 + M3, the two "every public route"
  claims, `TESTING.md`'s Phone-tab line.
- [ ] **T6 (P1, external) — ops** — Wave 0.5 hosting credential (names a
  person), 0.1 Razorpay test keys, 0.3 SendGrid then Twilio/DLT.
- [ ] **T7 (P1, ~1 d / ~6 h) — both processes** — Wave 0.4: Sentry with
  per-environment tags and a `beforeSend` dropping Playwright/MCP agents,
  one funnel, and the DPDP consent decision.
- [ ] **T8 (P2, ~3 h / ~1 h) — `e2e/`, `server/test/e2e/`** — the three
  owed specs: degraded provider copy, in-flight money-button labels,
  order survives a failed notification.
- [ ] **T9 (P2, a conversation) — `LAUNCH-READINESS.md` §3b** — Wave 0.6,
  the take rate, as a number with a date and an owner.
- [ ] **T10 (P2, ~2 h) — `client/components/account/`** — ledger row 1:
  the Laundry empty state and subtitle on `/account/orders`.
