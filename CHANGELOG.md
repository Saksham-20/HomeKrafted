# Changelog

All notable changes to the Homekrafted build are logged here, one entry
per milestone. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [M27] — Two account takeovers, a money button that lied, and the cloud storage seam — 2026-08-09

Started as "fix what the production audit found". The review before the
build found two things the audit had not, and both were worse than
anything on the list.

### Fixed — social sign-in handed out sessions for a posted email address

`POST /auth/social/:provider` never verified a Google or Apple id-token.
It read `email` off the request body and issued a session for whatever
account matched — including the admin. Confirmed live, twice: once by the
2026-08-06 audit and again on 2026-08-09 immediately before the fix.

`SocialTokenVerifier` now verifies against the provider's published keys
before anything is looked up. Details that are load-bearing rather than
incidental:

- **One JWKS key set per provider, built once.** Constructed per request,
  `jose`'s ten-minute cache never survives to be used — every sign-in
  would hit Google, and Google throttling us would become a total sign-in
  outage.
- **Audience is a list.** `server/` is shared with the native apps and
  Google issues a client id per platform. A single-string audience passes
  every test written on the web id and fails closed on the first mobile
  build.
- **An unknown key id answers 503, not 401.** It is what a forgery with a
  made-up `kid` looks like *and* what a legitimate token looks like mid
  key-rotation. The two are indistinguishable, so the tie goes to the real
  user: 503 says "try again" and the next attempt works.
- **`providerAccountId` and `email` are deleted from the DTO**, not
  ignored. With `forbidNonWhitelisted` the old takeover body is now a
  structural 400 — an ignored field can be quietly re-read by a later
  change; a rejected one cannot.

Unset client id means the provider is simply off (503, no button), so
**this closed with no keys and no accounts**.

### Fixed — and verifying the token was not enough on its own

`register` never sets `emailVerified`. So an attacker could register
`victim@gmail.com` with a password of their choosing and wait: the
victim's first genuine Google sign-in was link-by-email'd straight into
the attacker's account, with the attacker's password still on it.

Auto-linking now requires an already-verified account. Otherwise the
sign-in **seizes** it — every refresh token revoked, `passwordHash`
nulled, address stamped verified, because the provider has just proved who
owns it. Admins are refused outright, matching `verifyOtp`'s refusal of the
OTP test-code bypass.

### Fixed — the admin status override would have told buyers they were refunded

M26 deferred this control as "a feature, not a repair". Reviewing the
endpoint before building the UI found why that was lucky: `overrideStatus`
writes a status and messages the buyer, and does nothing else. The real
cancel path refunds the wallet, restocks every line, reverses the cashback
placement credited and stamps `cancelledAt`, in one transaction. An admin
choosing "cancelled" would have sent a cancellation notice against no
money at all.

`cancelled` and `returned` are now refused server-side — not merely absent
from the dropdown, because the endpoint is reachable with curl — with a
message naming the path that does move money. Three more on the same
method: a no-op guard (re-selecting the current status notified the buyer
again), `deliveredAt` stamped once (re-applying `delivered` silently
restarted the seven-day return window), and `expectedStatus` making it a
compare-and-set (two admins both wrote, last one winning silently). The
audit row records what it changed *from*, which is the question a dispute
actually asks.

The control itself shipped: an inline two-step confirm following
`ProductModerationRow`, stating in as many words that no money moves.

### Fixed — Sentry would have installed cleanly and reported nothing

`AllExceptionsFilter` is a global `@Catch()`, so it terminates every error
before `@sentry/nestjs`'s own filter runs. Without
`@SentryExceptionCaptured()` on it, Sentry boots, accepts the DSN, passes
a `beforeSend` unit test and stays silent forever — a failure you discover
the week you need it. `test/unit/sentry-capture.spec.ts` fails if the
decorator is removed.

The scrub is a privacy control, not tidiness: while Twilio and SendGrid
are stubs this server writes **working OTP codes to its own log**, and
Sentry's defaults collect console output as breadcrumbs. So: 5xx only, no
request bodies, no headers or cookies, no breadcrumbs, and email / phone /
bare-code redaction. Boot logs whether it armed, because a quiet error
reporter looks exactly like an application with no errors.

### Added — Google Cloud Storage behind the existing driver seam

`STORAGE_DRIVER=gcs` switches new uploads to a bucket; local disk stays the
default and old relative URLs keep resolving from nginx indefinitely. Three
decisions worth keeping:

- **`application`-purpose uploads never reach the public bucket.** That
  purpose carries FSSAI licences and identity documents. A
  `PurposeRoutingDriver` keeps them on local disk, so `GcsDriver` needs no
  idea what an FSSAI licence is and `UploadsService` needs no idea there is
  more than one backend.
- **`ImageSlot.isUpload` is structural** — `/uploads/` or any absolute URL
  — rather than compared against a `NEXT_PUBLIC_*` build-time inline. That
  variant would have thrown `Invalid src prop` on every page with a
  HomeKrafter photo the first time somebody deployed without it set.
- **`scripts/sync-uploads-to-cloud.mjs`** copies the archive and rewrites
  the stored URLs across all ten columns that can hold one (including
  `LaundryBooking.photos`, the `String[]` that would have been missed). It
  refuses to report success while any row still points at the old prefix,
  because deleting the local archive early is unrecoverable.

### Added — `/admin/audit`

`GET /admin/audit` has recorded every admin mutation since M8 with no
screen in front of it, while `docs/PRODUCTION-AUDIT.md` listed an audit log
among the panel's features. Now true. Its filters are exactly what the
endpoint supports — action and date filters were cut rather than faked in
the browser over one page of fifty, which would have lied on the one screen
whose whole job is being complete.

### Added — moderation SLA on the dashboard

The count said a queue existed; nothing said how long somebody had been in
it. Two cards above the KPI grid, each linking to the queue that clears it,
with an explicit all-clear instead of "0 days".

### Fixed — smaller things

- Approve/Reject had no busy state, and Reject fired immediately: one
  misclick permanently rejected a real applicant. Both now guarded.
- Wallet top-up had no in-flight state across an `await` that spans the
  whole payment-widget session. "Waiting for payment…", amount controls
  disabled, reset in a `finally`.
- The corporate enquiry detail was the admin dead-end M26-015 missed;
  three screens kept a bare `Loading…`; the quote-line grid never stacked
  on a phone.
- `UPLOAD_MAX_BYTES` documented 5 MB in `.env.example` while the code used
  12 MB.
- 503 and 502 responses were labelled `INTERNAL_ERROR`.

### Not done, deliberately

Commission collection, cohort analytics, refund-to-card, payout execution
and stored image variants remain owner decisions or backlog. The take-rate
**decision** now carries a date rather than a number.

## [M26] — The QA sweep, and the test layer that had stopped running — 2026-08-08 (in progress)

`docs/M26-QA-PLAN.md` is the plan for a full-site sweep: every route, every
role, judged with four questions. It was reviewed before it was started,
and the review found that the layer the sweep depends on had been dead for
a milestone.

### Fixed — the browser suite reported "0 failed" while running almost nothing

`e2e/tests/auth.setup.ts` is a Playwright *setup project*, and both viewport
projects declare it in `dependencies`. M25 collapsed the sign-in form to one
field; the fixture still clicked `getByRole('tab', { name: 'Email' })` and a
button named "Continue with email". There are zero `role="tab"` elements in
`client/` and the button reads "Continue" — so two of three setup steps
timed out at 30 seconds each, and every dependent test **skipped**. A skip
is not a failure, so the run printed "0 failed" and read as green.

`.github/workflows/ci.yml` could not have caught it either: it set
`JWT_SECRET`, while `server/src/config/env.validation.ts` requires
`JWT_ACCESS_SECRET`. The API never booted, and the job failed two minutes
later as a `wait-on` timeout rather than as "you did not set a secret".

- **The form's selectors now live in one place** — `e2e/fixtures/sign-in.ts`
  — instead of being copy-pasted across the setup and six blocks of
  `error-paths.spec.ts`. That duplication is why it drifted. It anchors on
  the placeholder rather than the label, because the label *relabels itself
  as you type* (`Mobile number or email` → `Email address`), and it throws a
  named diagnosis instead of timing out.
- **Before:** 2 failed, 30.4 s, everything downstream skipped.
  **After:** 129 passed, 22.8 s.

### Fixed — a filter helper used the instant check its own README warns about

`openFilters` in `audit-regressions.spec.ts` probed with `isVisible()`,
which answers false on a page still hydrating. The click never happened and
the failure surfaced 30 seconds later at whichever checkbox the test wanted.
Mobile-only, because above the sidebar breakpoint the filters are always
rendered and there is no toggle to miss. Three tests.

### Added — a test for the door an approved HomeKrafter actually uses

`e2e/tests/auth-form.spec.ts`. `POST /auth/continue` answers **409** when an
account exists with `passwordHash: null`, and `auth-continue.e2e-spec.ts`
pins the server half. Nothing pinned the browser half — that the form turns
that 409 into the code step rather than "incorrect password" for a password
that never existed. Also asserts "Use a code instead" is offered *before*
any failure, not only after one.

### Fixed — a new buyer's first screen advertised a module withdrawn six milestones ago

`/account/orders` was subtitled "Marketplace orders and laundry bookings, in
one place", its empty state read "bookings made on **Laundry** will show up
here", and a Laundry filter chip sat above both. Laundry was withdrawn in
M19; `/laundry` calls `notFound()` unconditionally.

The fix is not deleting the word — somebody with six bookings still needs to
find them, which is exactly why the models were kept. All three are now
conditional on the account having a booking, so the offer is made only to
the people it is true for. The empty state also gained the third part it
owed: a way out. Ledger `M26-004`, guarded by
`e2e/tests/withdrawn-modules.spec.ts`.

### Added — `scripts/qa-up.sh` and a route inventory that cannot drift

The documented setup did not work on a cold clone: it assumed `npm install`,
never created `server/.env` (gitignored, and the API refuses to boot without
`JWT_ACCESS_SECRET`), ran one of the three catalogue seeds so `/gifts` and
`/meal-plans` came up empty and read as product defects, and left
`NEXT_PUBLIC_SITE_URL` unset so every canonical on a localhost build pointed
at production. `qa-up.sh` does all of it, parameterised (`QA_DB`,
`QA_API_PORT`, `QA_WEB_PORT`) so two sweepers can run side by side.

`scripts/route-inventory.sh --check` fails the build when `client/app` and
`docs/route-inventory.tsv` disagree. The inventory is a *coverage* file, not
a list: a clean route produces no ledger row, which is indistinguishable
from a route nobody opened, so `swept_1280` / `swept_390` columns are what
answer "what is left".

### Added — `prisma/seed-browser-orders.ts`, for the browser stack only

The admin-orders search test needs an order buried on page 2. The documented
demo dataset produces 21 rows against a page size of 25, so there is no page
2 and the test waited for a "Next" button that was correctly absent. Twenty
`HKB*` orders, idempotent, removing only its own rows — kept out of
`seed.ts`, where they would appear in every tester's order history.

### Added — `e2e/sweep.mjs`, the machine half of the sweep

Every route in `docs/route-inventory.tsv`, in every role that can reach it,
at 1280 and 390 — 172 page-visits — recording axe violations, horizontal
overflow, dead links, heading-order jumps, `h1` count, broken images,
unlabelled inputs, undersized pointer targets and console errors, with a
screenshot per visit.

It does not replace opening pages and looking at them; it is what makes
looking at them affordable. Nobody notices a 4.4:1 contrast ratio or an
h2→h4 jump across 87 routes by eye, and those are exactly the defects that
survive a visual pass. Three properties were worth the effort to get right:
it seeds `hk_location_v1` **and** the `hk_loc` cookie (setting only the
cookie leaves the location modal over every screenshot, which is how the
first run photographed the same dialog 172 times); it scrolls each page to
force lazy images before measuring, without which every below-fold image
reads as broken; and it models WCAG 2.5.8's *inline* and *spacing*
exceptions, without which one false positive per page buries the real ones.

### Fixed — an admin could refund the same order twice, and could not open it at all

Two defects on one screen, `/admin/orders/[type]/[id]`, found by opening it.

**The refund button did not use the refund endpoint.** It posted a raw
wallet credit to `POST /admin/wallet/:userId/refund` with an
operator-typed amount, no `Idempotency-Key`, and `refId` set to the order
*number* rather than its id. That path sets no `refundStatus`, so the same
order could be refunded again the next day with nothing on the screen
saying it already had been, and a retry after a timeout credited twice.
Reproduced against the running API: three calls on a ₹1,499 order took the
wallet from ₹2,749 to ₹7,246. `POST /admin/orders/:type/:id/refund` —
idempotent, audited, guarded on `refundStatus`, refuses an unpaid order —
already existed and was unused. M23 fixed this exact class on the buyer's
"Place order"; the admin path was never revisited.

The amount field is gone with it. It looked like a partial-refund control
and behaved like one, but nothing downstream knew the order had been
refunded at all. A partial adjustment is a different act with a different
reason and keeps its own screen at `/admin/wallet/[userId]`.

**The screen could not open an order older than the newest 25.** It
resolved its header — customer and HomeKrafter names, which the `Order`
table does not carry — by fetching page 1 of `GET /admin/orders` and
finding the row in the browser. Anything below the fold of that page
rendered "Order not found." for a record the API returns happily, and the
refund control lives on that screen. Same shape as `8298b4b`
(`/admin/catalog/[id]` resolving out of the *public* catalogue). New
`GET /admin/orders/:type/:id/summary`, built by the same row-builders the
list uses so the two can never disagree.

`server/test/e2e/admin-order-detail.e2e-spec.ts` covers both: red on the
parent (4 failed), green after.

### Fixed — gold as text, on every surface the a11y suite does not visit

114 axe `color-contrast` nodes across 24 page-visits. `--hk-gold` carrying
words measured **2.88:1** on the product page's maker line, 3.2:1 on the
gift-wrap label, the `/sell` section labels, the wallet and referral
eyebrows, the seller editors. `--hk-whatsapp` under white on the button
that starts every Snacks order was 3.09:1. Terracotta on tinted panels,
3.77–4.09:1.

`CLAUDE.md` has said "gold is never for text" since M1 and
`--hk-gold-text-sm` exists for exactly this — but the 2026-08-08 contrast
pass fixed the seven routes in `a11y.spec.ts`'s `PUBLIC_ROUTES` and
nothing else, which is finding M26-006 cashed out: what is not measured is
not fixed. 31 stylesheets moved to the text-safe tokens. Zero contrast
violations remain on any production route.

Three star-rating rules keep `--hk-gold` deliberately, with the reason in
the file: a filled star is a graphic (WCAG 1.4.11, 3:1, and it measures
3.2:1), the rating is stated in text beside it, and a muddied star stops
reading as a rating.

### Fixed — the photo upload could not be operated from a keyboard

`ImageUpload`'s file input sat inside its `role="button"` dropzone: two tab
stops for one control, the second announced as an unnamed file button.
42 axe nodes across 18 page-visits — every listing, menu, meal-plan,
storefront and profile editor, which is every screen where a HomeKrafter
adds the photograph their listing lives or dies by.

Worth recording for the next person: `tabIndex={-1}` plus `aria-hidden` is
**not** enough, and axe says so in as many words — "a negative tabindex on
an element inside an interactive control does not prevent assistive
technologies from focusing the element". The input has to stop being a
descendant.

### Fixed — a phone showed one product per screen

`repeat(auto-fill, minmax(200px, 1fr))` cannot fit two columns into a
358px content width, so every browse grid collapsed to one card per row: a
501px card on an 844px screen, 4864px of scrolling for six products. The
announcement strip wrapped to three lines on top of that, so with the
header there were 193px of chrome and the first product started 588px down
the opening screen.

Two-up under 640px across all eight browse grids and the loading skeleton;
the announcement strip is one swipeable line on a phone. Card 501→335px,
page 4864→2745px, first product 588→523px, no horizontal scroll at 390 or
320.

### Fixed — smaller things the sweep turned up

- **`/shop` offered filters that could only return nothing.** Facets with a
  count of zero were fully live — a tap, a page load, an empty grid. Dimmed
  and disabled now, never hidden (a zero is information, and a list that
  reshuffles as stock changes is one nobody can learn), and never disabled
  while *checked*, or the filter that emptied the grid could not be undone.
- **Six admin "not found" screens were dead ends** — one line in a centred
  card, no heading, no reason, no way onward. `/admin/orders/[type]/[id]`
  reported zero headings to a screen reader. One `NotFoundCard` now says
  what happened, why it might have, and offers the way back; the order
  detail also gained an `h1` in its success state, where the reference had
  been a `span`.
- **Six App Store / Google Play links went nowhere** — both hrefs defaulted
  to `"#"` and the promo data stored `"#"`. A missing href renders a badge
  rather than a link now: same shape, no pointer, no tab stop, "coming
  soon" in the accessible name. Shipping day is a data change.
- **`/account/notifications` still offered four Laundry switches** for a
  module withdrawn in M19 — the one screen M26-004 did not reach. Shown
  only to an account that actually has laundry notifications, on the same
  reasoning as there.
- **Header icon buttons rendered at 16px wide** despite declaring 38 —
  `width` is a suggestion inside a flex row and the search field was
  winning. Plus nav links at 23px, footer legal links at 18px, chips at 28.
- Heading-order jumps on `/storefront/[vendor]` and `/seller/reviews`; an
  unnamed support chat input; an unnamed product select on
  `/admin/collections/new`.
- **The admin order screen stopped citing an unshipped milestone.** "Status
  overrides are still M8 scope" was on the page for a feature
  `PATCH /admin/orders/:type/:id/status` has implemented and audited since
  M8. The control itself is deferred — it is a new audited write, not a
  repair — and recorded as M26-018 so it is not lost.

## [M25] — One sign-in field, and no photo leaves EXIF behind — 2026-08-08

Two things stood between this build and onboarding real chefs. Both were
in front of a HomeKrafter within their first two minutes on the site.

### Fixed — an uploaded photo published the cook's home address

`POST /uploads` stored the bytes it was given. A phone photo carries an
EXIF block, and a phone photo taken in a home kitchen carries **GPS
coordinates** in it — so a HomeKrafter's public listing image handed their
home address to anyone who ran `exiftool` on the URL. On a platform whose
sellers are individuals cooking at home, that is the most consequential
thing in this release.

`server/src/uploads/image-pipeline.ts` (sharp/libvips) now re-encodes every
accepted upload before it ever reaches the storage driver:

- **all metadata stripped**, with `.rotate()` applied *first* so the EXIF
  orientation is baked into the pixels rather than lost with the tag —
  otherwise every portrait phone photo would store sideways;
- longest edge capped at **2000px**, output always **WebP q82**. A
  straight-from-phone JPEG lands at roughly a tenth of its size;
- **decompression bombs refused** (`limitInputPixels`, ~90MP). A byte-size
  limit never caught these — the whole trick is that the file is small.

WebP rather than AVIF is a CPU decision, not a quality one: AVIF costs
seconds per image and this runs inline on a 1 vCPU box.

Storage stays **local disk on the VPS** (`STORAGE_DRIVER=local`,
`/var/lib/homekrafted/uploads`, served by nginx). `UPLOAD_MAX_BYTES` rose
5MB → **12MB**, because nothing that size is stored any more and 5MB
rejected an ordinary photo off a modern phone — which meant the *first*
thing a new HomeKrafter tried on the site failed.

### Changed — sign-in was a 2×2 grid of tabs; it is now one field

`/login` asked the visitor to classify themselves twice before typing
anything: Shopper/HomeKrafter, then Phone/Email. The role axis was the
worse of the two — a HomeKrafter who also buys is both, and the account's
own `role` decides the landing page regardless, so the question never
affected the outcome.

Now: **one box, one password, one button.** `POST /auth/continue` parses
the identifier (`identifier.util.ts`, India-default region so a bare
`9845012345` works), normalises it — E.164 for numbers, lowercase for
addresses, so one person cannot become two accounts — and decides for
itself whether this is a sign-in or a sign-up. `/signup` renders the same
screen. `RoleChoice` and `SignupClient` are gone; `register`/`login` are
untouched and still serve the native clients.

**The approved-HomeKrafter door stayed open, and is now pinned by a test.**
An account minted by approval has `passwordHash: null`, so the obvious
implementation answers "incorrect password" to every real kitchen on their
first visit. `/auth/continue` returns **409**, not 401, for that case and
the form switches to the code route — plus "Use a code instead" is always
visible, not only after a failure.

### Added — codes go to email as well as SMS, and verification is recorded

`POST /auth/otp/{request,verify}` take `{ identifier }` and pick the
channel; `{ phone }` is still accepted, because narrowing a shipped
request value breaks a client that cannot be redeployed. A successful
verify stamps `User.emailVerified` / `phoneVerified`.

Those columns are **records, not gates** — nothing checks them before
letting an account act. Delivery needs Twilio and SendGrid keys that are
still unset, so gating on an undeliverable code would block every real
sign-up. Rows predating the migration were backfilled to `true`: they had
no way to verify, and an un-satisfiable prompt is a nag with nothing
behind it.

`PhoneOtp` became `OtpChallenge` and its `phone` column reads as
`destination` — a pure Prisma rename via `@@map`/`@map`, **zero SQL**, so
that an email address is not sitting in a column called `phone` for the
next person to copy.

### Fixed on the day, by driving the deployed site

Three things that no check here could see, two of them found only because
the milestone was tested in production rather than declared done:

- **Uploaded photos rendered broken, and had since M16.** `next/image`
  resolves a local `src` against its own server; `/uploads/` is served
  only by nginx, so the optimiser fetched its own 404 page and returned
  `400`. `ImageSlot` now skips the optimiser for `/uploads/` — safe
  because the upload pipeline above already produced a capped WebP.
- **Sign-up skipped its own confirmation step.** Signing up signs you in,
  and the "already signed in" card returned early, making the code step
  unreachable. Guarded by `signed-in-short-circuit.spec.ts`.
- **The confirmation step handed out a code it could not accept.** The
  post-sign-up code was minted under a `verify` purpose while `verifyOtp`
  reads `login`, so the box rejected its own code. Purposes unified;
  pinned by an e2e that round-trips whatever code sign-up actually issues.

### Tests

+66 (`image-pipeline`, `identifier` on both sides, `auth-continue`
end-to-end, the short-circuit guard). The EXIF/GPS strip, the 409
HomeKrafter path and the code round-trip are the three worth keeping
green.

## [M21] — Production audit: browser sweep, hardening, load testing — 2026-08-06 (in progress)

The first time this build has been driven in a real browser or put under
load. `docs/PRODUCTION-AUDIT.md` item 21 and `docs/LAUNCH-READINESS.md` §5
had both named these as owed and neither had ever been scoped.

### Fixed — the contrast floor had been reviewed, never measured

`e2e/tests/a11y.spec.ts` runs axe over every public route and twelve
signed-in ones, at both viewports. It failed on all of them the first
time it ran.

- **`--hk-muted` is 3.50:1 on the canvas.** `tokens.css` documents it as
  "meta, captions" — body text — and it is used 306 times across 135
  files: every product card's maker line, every filter heading, every
  price-range label, the shop's breadcrumb and subtitle. `--hk-muted-2`
  is 4.14:1 and fails the same way. Both corrected in
  `tokens.extend.css`, which is the one place that file overrides
  `tokens.css` rather than adding to it — re-pointing 306 call sites at a
  new name would leave the failing token in place for the 307th.
- **Gold as text is 2.88–3.2:1.** `CLAUDE.md` carved out "pure decoration
  (eyebrows, view all)", which does not survive contact with the pages: an
  eyebrow labels a section, "View all" is a link, and `.maker` is the
  HomeKrafter's name on every card. The carve-out is deleted; small gold
  text takes `--hk-gold-text-sm`, itself darkened because it measured
  4.49:1 on the gold tint — one hundredth short.
- **White on the WhatsApp green is 3.09:1** on the 10px channel badge;
  terracotta on its own tint is 3.77:1, which is where "Cancelled" and
  "Returned" live in both order queues; the footer's legal row was
  4.18:1.
- **The header's wallet link had no accessible name** below the mobile
  breakpoint, where the balance is hidden and only the icon remains.

Every fix is a colour value or an `aria-label`; no layout moved.

### Fixed — two money fields took focus and showed nothing

`globals.css` rings everything on `:focus-visible`, and nine modules
override it with `outline: none` — usually correctly, because the input
is borderless inside a styled wrapper and the ring belongs on the
wrapper. `WalletClient` was the one that never put it back, so tabbing
into the box where somebody types an amount of money, and into the
auto-top-up thresholds, moved focus somewhere invisible. The tab-order
walk in `presentation.spec.ts` now asserts every stop shows a ring.

### Fixed — an unreachable server spoke browser, not English

A rejected `fetch` — API stopped, nginx down, a phone in a lift — has no
status and no error envelope, so it never reached the error handling in
`lib/api/http.ts` and propagated as a raw `TypeError`. Nineteen screens
render an error's `message` directly, so people saw "Failed to fetch" or
"Load failed" in the same red text a refused password uses: it reads as
the server rejecting what was typed, so the natural response is to edit a
form that was never wrong. It is now an `ApiError` with status `0` and
code `NETWORK_ERROR` carrying a sentence somebody can act on.

### Added — sign-in returns you to where you were sent from

The edge gates on `/seller/*` and `/admin/*`, and a session expiring
mid-request, all sent people to a login screen and threw the destination
away. They now carry `?next=`, interpreted in one place
(`lib/auth/return-to.ts`) under two rules: it must be a same-origin
relative path — an unvalidated one is an open redirect that makes our own
domain the referrer for a credential-harvesting page — and it must be
somewhere the signed-in role can actually reach, or the gate bounces them
straight back out and the round trip reads as a failed sign-in.

### Fixed — browsing lost its place the moment you opened a listing

Every filter on `/shop`, the sort and the page number lived in component
state and never touched the address bar. Sort by price, tick a category,
go to page 2, open a product, press Back: unsorted, unfiltered page 1 —
measured, not inferred. Two more followed from the same cause. A narrowed
catalogue could not be sent to anybody, because the URL said `/shop`
whatever was on screen. And `?category=`, which every category tile on the
home page links to, seeded the sidebar once and was never rewritten, so
un-ticking it left the URL still claiming the filter and a refresh
silently put it back.

`client/lib/browse-params.ts` is the encode/decode, kept pure so the
Server Component's first render and the client's rewrites read the same
rules. It parses defensively — `sort=cheapest`, `page=-3`, `minPrice=abc`
and an inverted range all resolve to the default, because the failure to
avoid is not a crash but a page that quietly filters itself to nothing.

The write is a debounced `router.replace`. `push` would make every
checkbox a history entry; `window.history.replaceState` needs no round
trip and is what Next documents for search params, and **it does not
survive Back** — the App Router restores its own `renderedSearch`, and
instrumenting it showed `popstate` firing with `location.search` already
reset to `""`. Keys the rewrite does not own are preserved: the first
click on a filter had been deleting `utm_source` off every shared link.

### Fixed — a refresh mid-payment left you staring at an empty cart

Forced with a real order: the POST reaches the server, the response is
held, the page is reloaded. The order lands and the cart is cleared with
it — which is the property that matters, because a buyer cannot re-place
what is no longer there. But the screen they come back to said only "Your
cart is empty", with nothing on it about whether ₹489 had moved. It now
says a refresh mid-payment can land you here and links to the order list,
because the state it explains outlives a toast.

**True offline is a navigation, and it is not handled.** Clicking a link
with the network off falls back to a hard load and Chrome's own error
page; there is no service worker and no offline shell. In-page actions do
speak our language — `error-paths.spec.ts` now asserts that through the
real network stack, not only through an aborted route.

### Fixed — `/about` told Google it was the home page

It hand-rolled a bare `Metadata` object with no `path`, so Next emitted
no `alternates.canonical` and the route inherited the root layout's,
which points at `/`. The only public route on the site with a wrong
canonical, and invisible on the rendered page.
`client/lib/canonical-metadata.spec.ts` now scans every route file:
metadata is built through `pageMetadata()` or the route says
`index: false`.

### Fixed — auth

- **Suspension now takes effect on the next request, not the next login.**
  `assertNotSuspended` ran only where a session *starts*, so an
  already-issued access token kept working for the rest of its 15-minute
  TTL. Confirmed against a running server: a suspended account still read
  `/wallet` and still wrote through `PATCH /users/me`. `JwtAuthGuard` now
  re-checks `User.suspended` per request, at the cost of one primary-key
  lookup on authenticated routes. A TTL cache in front of it would
  reintroduce the exact staleness being closed.

- **The OTP guess budget is per phone number, not per issued code.**
  `MAX_ATTEMPTS` counted against one `PhoneOtp` row and requesting a new
  code minted a fresh row with `attempts: 0` — five guesses, request, five
  more, indefinitely, against a six-digit space. Attempts are now summed
  across a rolling 15-minute window per number (10), and the number of
  codes one phone can be *sent* is capped too (5), which was separately
  uncapped: somebody else's phone buzzing all night on our SMS bill.

- **An unexpected error no longer describes itself to the client.**
  `AllExceptionsFilter` returned `exception.message` verbatim for any
  non-`HttpException`, so a `PrismaClientKnownRequestError` handed over
  table, column and constraint names. Kept outside production, where a
  500 you cannot read is a 500 you debug with `console.log`.

- **`GET /admin/exports/:kind` answers an unknown kind with a 400.** The
  `switch` had no `default`, so it returned `undefined` and the caller
  destructured `{ filename }` off it — a mistyped URL produced a 500
  reading "Cannot destructure property 'filename' of '(intermediate
  value)' as it is undefined", which is both bugs in one response.

### Fixed — money paths under concurrency

Five writes that were correct when walked once and wrong when walked twice
at the same time. All five are the same mistake — a read that establishes
a fact, then a write that assumes it still holds — and none is reachable
by clicking through the UI yourself, which is why all five shipped. Each
is now covered by a spec that races real in-flight requests.

- **A HomeKrafter could request the same earnings twice.** Two concurrent
  `POST /seller/payouts/request` calls both read "nothing pending" and
  both created a `pending` payout for the full balance. The
  `Idempotency-Key` header does not cover it: it de-duplicates a repeat of
  *one* request, and a double-click sends two. The request now takes a
  `FOR UPDATE` lock on the `Seller` row before reading — a lock rather
  than a partial unique index because Prisma's schema language cannot
  express `WHERE status = 'pending'`, so that index would live only in raw
  migration SQL and read as drift on every `migrate dev`.

- **Two admins could both decide one payout**, the second silently
  overwriting the first's `reference`, `decidedById` and `decidedAt` — so
  a payout settled under a real UTR could end up on record as rejected, or
  as paid under a reference nobody sent. `Payout.reference` is the only
  link to a transfer that happened outside this system, so losing that
  write loses the paper trail for real money. Both decisions now go
  through a conditional `updateMany` that puts `status: 'pending'` in the
  WHERE clause; the loser gets a 409 naming the outcome that won.

- **One order could open two payable Razorpay orders.** Every call to
  `POST /payments/razorpay/order` minted a fresh one, so a reload or a
  second tab left two live payment pages against the same `Order`. A buyer
  who paid both was charged twice and credited once — the webhook
  transitions the order on the first capture, and the second finds nothing
  to apply itself to. Now: an unlocked read catches the ordinary duplicate,
  and a genuine race is settled under a `FOR UPDATE` lock on the `Order`
  row. Minting happens *before* the transaction on purpose — the
  alternative holds a row lock across an HTTP call to Razorpay. Top-ups
  are deliberately not de-duplicated: two ₹500 top-ups are two legitimate
  top-ups and both credit.

- **A redelivered WhatsApp message created a second `SnackOrder`.** Meta's
  Cloud API retries any delivery it does not get a timely 200 for, and the
  handler had no dedup at all, so one customer list became two orders and
  a HomeKrafter cooked it twice. Inbound messages now claim
  `WebhookEvent(provider: 'whatsapp', eventId: 'message:<wamid>')` inside
  the same transaction as the orders — the shape the Razorpay webhook
  already used. Outbound confirmations moved after the commit, so a send
  to Meta no longer holds the transaction open for a network round trip.

- **Two people with the same first name could not sign up at the same
  time.** `generateReferralCode` is deterministic on the first name, so
  every "Priya" computes `PRIYA250`; the check-then-insert told both
  callers it was free and the loser died on a unique violation — a 500 on
  the signup form. Found because the payout spec registers its two admins
  in parallel. There is no gap-free way to reserve a value you have not
  inserted, so the insert is now the reservation and a lost race tries the
  next candidate; the pre-check stays as a fast path. The retry is
  narrowed to `referralCode`, so a duplicate *email* still reports itself
  as one.

### Added — load tests, and the thing they immediately found

`load/` — k6 scripts (`browse.js`, `mixed.js`, a shared `lib.js`) with the
50 → 200 → 500 → 1000 ramp `docs/PRODUCTION-AUDIT.md` asks for. A single
static binary, so nothing is added to either package's dependency graph.

**The first run was a false pass, and that is the finding.** Against the
16-product seed, 1000 VUs held p95 at 4.55 ms with zero errors — which
would have been reported as "the catalogue scales fine". Loading 2,017
products and re-running the identical ramp gave **p95 2.06 s**, tripping
the threshold.

A single request was still only 40 ms. The cost was that `GET /products`
read every matching row to return twenty, and concurrency multiplied it
until the connection pool queued. The pagination work earlier in this
release removed the *relation* hydration for the whole catalogue but left
that scan, and no amount of testing on seeded data would have shown it.

Two changes, both measured:

- **A SQL fast path for the default browse.** No search term, no price
  range, no coordinates, `most-loved` — which is the first request every
  visitor makes — is now `ORDER BY rating DESC, reviewCount DESC, id
  LIMIT 20` straight from the database. Everything else falls through to
  the general path, which still filters and sorts in application code
  because price and distance are not columns.
- **An index that actually serves it** (`Product(moderationStatus,
  isAvailable, rating DESC, reviewCount DESC, id)`). The `DESC` markers
  are load-bearing: an ascending index cannot serve a descending scan
  without the sort step being removed. Postgres went from a sequential
  scan of 2,016 rows plus a top-N sort to a 20-row index scan, 0.14 ms.

Result on the same ramp: **p95 2.06 s → 745 ms, zero errors, throughput
167 → 336 req/s.** Per request, 40 ms → 4 ms.

A split like this introduces a risk that is invisible — both paths return
plausible pages, and only a boundary or an ordering tie reveals they
disagree. `products-browse.e2e-spec.ts` runs the same query down both
paths (`minPrice=0` filters nothing but forces the general one) and
asserts identical ordering on page one and page two. Verified to fail when
the two tie-breakers are made to differ.

**What is still slow, stated rather than fixed:** search, price sort and
price filter all take the general path and cost ~28 ms against 2,000
listings — seven times the fast path. Doing better needs full-text search
(`tsvector`) for the first and a denormalised price column for the other
two. Both are real changes with real trade-offs, not a tuning pass.

**No production run.** `homekrafted.in` is one 1 vCPU / 4 GB VPS running
the Next server, the API and Postgres together with pm2
`max_memory_restart` at 600M/800M. 500–1000 VUs against it would not
stress it, it would take it down — and under memory pressure pm2 
restart-loops, so it can stay down after the load stops rather than
recovering. `load/README.md` says so at the top. Local numbers are an
upper bound on the code, not a prediction of that box.

### Fixed — the payouts queue reported nothing owed when you filtered it

Same shape as the support and catalogue badges, on the one screen in the
panel that is entirely about money somebody is waiting for. `summary` was
reduced over the loaded rows, so clicking "Paid" made the header read
`pendingCount: 0, pendingTotal: ₹0` — while three HomeKrafters waited on
₹14,010. Reproduced against a running server before the fix and after it.

`GET /admin/corporate-inquiries` had it too: filtering to "quoted" made
"how many nobody has touched" read zero.

Both summaries are aggregates now, both lists page, and both orderings
gained a unique final key — payouts tie on `periodEnd` by construction,
because they are cut for the same fortnight.

The payouts screen also stopped recomputing its own totals after a
decision (`pendingCount - 1`, `pendingTotal - amount`). That is the
"increment a denormalised aggregate" pattern this codebase rejects
everywhere else, and it would drift the moment two admins worked the queue
at once. It re-reads instead.

### Changed — the wallet oversight screens page, and their totals stopped following the page

`GET /admin/wallet` read **every wallet on the platform** — one per user,
each with a transaction-count subquery — and reduced over the array in
JavaScript to produce total liability, wallet count and lifetime saved.
`GET /admin/wallet/:userId` returned that user's entire ledger, the same
unbounded read the buyer-facing endpoint had.

Both are pages now, and the three money totals are aggregates that
**ignore the page**: a "total liability" summing only the twenty-five
wallets on screen is a platform-wide figure quietly meaning something
else, which is the same failure as the queue badges earlier in this
release. The e2e asserts page two reports the same liability as page one.

The balance list ties on every row when every wallet holds the same amount
— a brand-new platform, or one where nobody has topped up — so the
ordering gained a unique final key. Ledger paging is by cursor for the
usual reason: it grows at the end being read from.

While in there: the wallet detail screen footnote still told an admin that
what they were looking at was "mock-persisted for this session only — M8
makes this a real ledger". M8 shipped a long time ago. It now describes
what the screen actually is.

### Fixed — a name made entirely of spaces

`@MinLength(1)` counts **characters**, and `"   "` is three of them. So
every name-shaped field accepted pure whitespace and stored it verbatim:
`POST /auth/register` with `{"name": "   "}` returned 201, and that account
then rendered as a blank on the admin user list, in the wallet liability
table, as the `customerName` on every order row an admin sees, and as the
`refereeName` on a referral.

Found in a browser rather than by reading code — a row on `/admin/wallet`
with a balance, a transaction count, and no name at all.

`@TrimmedString(min, max)` (`server/src/common/decorators/`) trims *before*
validating and keeps the trimmed value, so `"  Ananya Iyer  "` is stored as
`"Ananya Iyer"`. Validating a trimmed copy and then saving the padded
original would pass every test and keep the bug — a leading space also
sorts an account to the top of every admin list, and makes "Ananya" and
" Ananya" look like two different people.

Applied to the fields other people read: the account name, profile name,
listing and menu-item names, the four address fields, a support ticket's
subject, a collection title, and the corporate company/contact names.
**Every existing upper bound is unchanged** — this adds a floor, not a
ceiling. The two exceptions are `companyName` and `contactName`, which had
no upper bound at all and now have one, closing the same unbounded-text
hole this audit closed on listings.

It follows `@BooleanField()`'s shape deliberately: that decorator exists
because a bare `@IsBoolean()` was the bug, and this one exists because a
bare `@MinLength(1)` is.

### Added — a fourth test layer: a real browser, the running app

`e2e/`, Playwright, wired into CI as its own job against a seeded stack.
`docs/PRODUCTION-AUDIT.md` item 21 and `docs/LAUNCH-READINESS.md` §5 have
both asked for this since M15; nothing in the repo had ever opened a page.

It exists because this audit found a whole class of defect that **passed
all 460 server tests and all 114 client ones**: a Save button that did
nothing and said nothing on fifteen screens, Place order charging three
times for three clicks in one second, product cards that were focusable
and un-openable from a keyboard, and two dialogs announcing `aria-modal`
while trapping no focus at all. None of that is visible without a rendered
DOM, a real click, or a status line.

Twenty-seven tests across a desktop and a 390px project, covering the two
focus traps `docs/TESTS.md` has named as owed since M16, the `/admin/login`
credential check, keyboard-operable product cards, the real 404 status on
an unknown slug, the admin search that has to reach page 2, and the queue
badges.

**The first browser test ever run against this app immediately failed on a
real bug.** `LocationPrompt` is mounted in the root layout, which the staff
surfaces share, so it opened over `/admin/login` — a focus-trapping modal
asking an admin which neighbourhood to deliver their groceries to, holding
Tab while they tried to type a password. It is now suppressed on `/admin`,
`/seller`, and the auth and checkout routes, where the visitor already has
a task in hand. Nothing is lost by waiting: `asked` is only recorded when
somebody actually answers, so the prompt simply appears on the next page.

Two things about writing these are worth keeping, and are in
`e2e/README.md` because both cost real time:

- **`isVisible()` does not wait.** On a page that is still hydrating it
  returns `false`, and the natural next line is `test.skip()` — so the test
  goes green having checked nothing. That happened twice here, and both
  times it looked exactly like a pass.
- **Every consumer page renders two `aria-modal` dialogs** (the mobile
  drawer, present but hidden on desktop, and the location prompt), so the
  obvious locator matches both and trips strict mode.

### Changed — the HomeKrafter list pages too

`GET /admin/sellers` is the slowest-growing list in the panel — bounded by
supply headcount rather than by customers or orders — and was still an
unbounded `findMany`. "Small today" is what every one of these had in
common. Now a page of 25 with `specialty` and `q` applied in SQL.

`specialty` is matched with `has`, not equality, so a HomeKrafter who bakes
*and* pickles appears under both tags — which is the entire point of the
field being a list, and is asserted rather than assumed. It stays a
discovery filter and never an access decision (`CLAUDE.md`, M12).

### Fixed — two admin queues whose own badge lied when you filtered them

`GET /admin/catalog/products` read every listing with its relations;
`GET /admin/support/tickets` read every ticket with its whole message
thread. Both are now pages of 25, with status, vendor and search applied in
SQL.

The pagination is the smaller half. **Each queue leads with a count of what
is waiting, and each derived that count from whatever rows it happened to
have loaded** — so narrowing the view changed the number. On support,
clicking "Resolved" made the header report `open: 0, in progress: 0,
awaiting reply: 0`: a support queue telling an admin that nobody is waiting,
on the one screen whose entire job is telling them who is. On the
catalogue, filtering to "Active" reported nothing waiting for review, which
is how a HomeKrafter waits a week for a listing nobody knows is queued.
Both are now their own queries, deliberately unscoped, with tests that
filter to something else and assert the badge did not move. Confirmed in a
browser: three seeded tickets, filter to Resolved, list narrows to one and
the header still reads "Waiting on us 2".

`awaitingReply` is "the newest message came from the customer", which is a
per-row lookup rather than a column — so it is a raw `COUNT` with a
correlated subquery rather than reading every thread into memory. Writing
that query surfaced two things worth recording: the status literals must be
the **database's** spelling (`SupportTicketStatus` declares
`in_progress @map("in-progress")`, and the Prisma-side name is not a member
of the enum type — a 500, caught by the test), and a DTO on a `@Query()`
validates *every* key in the query string under `forbidNonWhitelisted`, so
leaving `status` off the support DTO made filtering the queue 400.

The catalogue keeps "pending first, oldest submission first, then decided
newest first". Postgres cannot express that in one `ORDER BY` without a
`CASE` Prisma will not emit, so it stays two queries — but a page is now
cut out of the concatenation arithmetically instead of by materialising
both halves and slicing, and a page wholly inside one half reads only that
half.

Both orderings gained a unique final key on `id`. Listings created in the
same second and tickets sharing an `updatedAt` after a bulk status change
are the normal case, not a contrivance, and that is exactly when a page
boundary starts showing one row twice and dropping another.

A third subtitle was lying under a filter — "0 listings across every
vendor", on the Waiting tab of a catalogue holding seventeen.

### Fixed — the eleventh Priya could not create an account

A referral code is a first name plus a suffix, and the suffix was
`250 + attempt` with the caller trying exactly ten attempts. That is not
collision handling — it is a hard ceiling of **ten accounts per first
name, ever**. The eleventh person called Priya to sign up got
`409 Could not allocate a unique referral code — please retry`, and
retrying could never succeed, because the space was permanently exhausted.
On a marketplace whose market is India, with a signup form as the front
door.

Past the ten readable codes the suffix is now random, drawn from an
alphabet with `O`/`0`, `I`/`1` and `S`/`5` removed — a referral code is
read off one screen and typed into someone else's phone, and a misread
character is a friend who never gets credited. The first ten people with a
name still get `PRIYA250`…`PRIYA259`; the rest get `PRIYA` plus four
characters. Verified against the running server: thirteen registrations as
"Priya Audit" all returned 201, where 11 through 13 previously did not.

Found by an audit test that seeded thirty accounts for an unrelated
pagination check and could not get past the tenth — `createActor` names
every account the same thing, which turned out to be the exact production
scenario. The test deliberately still registers through the API rather
than writing rows through Prisma, which would have hidden it again.

### Fixed — the admin user list returned every account on the platform

`GET /admin/users` is the one query on this server that grows with the
entire customer base, and it had no limit; the screen filtered and
searched the array in the browser. Now a page of 25, with `role`, `status`
and `q` applied in SQL — search had to move for the same reason it did on
the order list, or an admin looking up the person on the phone to them is
told no such account exists.

Two subtitles were quietly lying under a filter: "44 accounts across every
role" became "6 accounts across every role" when filtered to HomeKrafters,
and the order list did the same. They now say "match these filters" unless
nothing is filtered.

### Fixed — a HomeKrafter's earnings were summed in JavaScript

`computeDeliveredEarnings` loaded **every** delivered line item, booking
and snack order a kitchen had ever had onto the heap to add up three
numbers — on the read behind both the dashboard and the payout request.
Now aggregates; the marketplace leg needs raw SQL because it multiplies by
a column, and it runs on the transaction client so a payout request still
reads inside its own transaction.

This number decides how much real money leaves a real bank account, and
**nothing asserted its arithmetic** — the payouts suite covers the state
machine around a payout, not the sum that sizes one. Eight tests now do,
each computed by hand: quantity is multiplied, only `delivered` counts,
only this kitchen's own products count, paise survive, an empty kitchen is
₹0 rather than NaN, and the balance never goes negative. Three of them
fail if the quantity multiplier is dropped.

### Fixed — three admin screens that read the whole platform

`GET /admin/orders` read three whole tables — every marketplace `Order`,
every `LaundryBooking`, every `SnackOrder`, each with relations — on every
visit, and `/admin/orders` then filtered and searched the result in the
browser. It is now a page: `{ items, page, pageSize, total }`, 25 a page,
with `?q=` and `?type=` applied in SQL.

**Search had to move with it.** A page plus a client-side filter means
"search the rows you happen to be looking at" — an admin typing a real
order reference would be told no orders match, because the order was on
page 2. The e2e for this searches for exactly that order.

Paging a union of three unrelated tables is done by reading `page ×
pageSize` from each and merging: any row in the newest N globally must
also be in the newest N of its own table, so this is exact, and it reads
at most 3N rows rather than three tables. Deep pages cost proportionally
more, so `page` is capped at 40 — search is the tool for finding one old
order. The CSV export keeps its wider read but gained a 20,000-row ceiling
and applies its date range in the query rather than filtering afterwards.

`GET /admin/dashboard` and `GET /admin/analytics` loaded the same three
tables to compute sums and counts. They are now aggregates: six
`aggregate`/`count` calls for the dashboard, and one grouped `UNION ALL`
for the daily GMV series.

**That rewrite shipped a bug, which is why it has its own test.** The
window boundary was bound as a JS `Date`, and the driver applied the
connection's timezone on the way in — on `Asia/Kolkata` this moved the
start of the window forward 5½ hours, so the oldest day of the chart
silently lost every order placed before 05:30 UTC while every other day
stayed correct. Found by running the same aggregate by hand in psql and
comparing: the two disagreed on exactly one day (₹1,427 against ₹1,847).
The fix casts a literal so both sides stay in the frame the data is stored
in, and the regression test fails when it is reverted.

### Fixed — every request looked like it came from the same person

`app.set('trust proxy', 1)` in `server/src/main.ts`. Production serves the
API through nginx on the same box, so Express saw `127.0.0.1` as the
client for **every** request on the internet and `@nestjs/throttler` keyed
its buckets on that: one shared budget for the whole world. Two failures
in one, pulling opposite ways — the first few visitors in a window
exhausted the limit and everyone else got a 429 they had done nothing to
earn, while the `/auth/*` limit that exists to stop credential stuffing
counted an attacker's guesses in the same bucket as everybody's ordinary
sign-ins, so it could neither protect nor be tuned.

`1`, not `true`. `true` trusts the whole `X-Forwarded-For` chain, which
means any caller can prepend a forged address and mint a fresh rate-limit
bucket on demand — a worse hole than the one being closed. One hop is
exactly what sits in front of us today. `docs/DEPLOY.md` now says so, and
says it becomes `2` if a CDN is ever added.

### Fixed — four missing indexes, one of them the seller portal's

Migration `20260807100000_m23_order_indexes`. Found by reading each
`findMany`'s `where` + `orderBy` against the index list rather than by
guessing, and measured on a scratch database loaded with 50,000 orders and
150,000 order items (single connection, warm cache):

| Query | Before | After |
|---|---|---|
| Buyer order history (`OrdersService.list`) | 0.067 ms | 0.053 ms |
| Seller order list (`SellerOrdersService.list`) | 9.573 ms | 4.319 ms |
| Vendor "delivered" count (`VendorProfileService.stats`) | 7.275 ms | 1.170 ms |
| Admin order list, `placedAt desc` | 1.809 ms | 0.067 ms |

- **`OrderItem.productId` had no index at all**, and it is the column the
  entire seller portal is defined in terms of: a HomeKrafter's orders are
  "orders containing one of my products". `SellerOrdersService.list` and
  `assertOwned`, `SellerAnalyticsService` and `VendorProfileService.stats`
  all scope that way, so every one of them scanned the whole `OrderItem`
  table — meaning each kitchen's dashboard got slower with every order
  placed by *anyone else on the platform*. The worst kind of slow, because
  it never shows up in development.
- **`Order.userId` became `Order(userId, placedAt)`.** Nothing queried by
  `userId` alone; every buyer-facing read sorts `placedAt desc`, so the old
  index found the rows and then left Postgres to sort them by hand. The
  measured win is small at seeded volume and grows with orders per buyer —
  it costs nothing because it *replaces* the old index rather than joining
  it.
- **`Order.placedAt`** for the admin and seller lists, and **`Order.status`**
  for the dashboard's status buckets and the vendor stats counts.
- **`PhoneOtp(phone, purpose, consumedAt, createdAt)`** replaces
  `PhoneOtp(phone)`, matching what `OtpService.verify` actually runs. On
  the phone column alone, every verification attempt re-read and re-sorted
  every code ever sent to that number — on the hot path of the only
  sign-in an approved HomeKrafter has.

The migration also drops a stray `DEFAULT CURRENT_TIMESTAMP` that M20 left
on `CorporateInquiry.updatedAt` (added so `ADD COLUMN ... NOT NULL` could
backfill, never declared in the schema). Prisma's `@updatedAt` has always
supplied that value, so the default had never once been used — but it
meant every `prisma migrate diff` emitted phantom drift.

### Fixed — ten more screens that swallowed a refusal, and a "Saving…" that never ended

The class from the previous entry, asked from the other side: a component
that **changes something on the server** must have a `catch`. Ten more
files failed that, none of them caught by the first rule — because they
had no `try` at all.

That shape is worse than silent. `SellerListingEditorClient` awaited
`createSellerListing` bare, so a rejected save left the promise rejected,
`setSaving(false)` never ran, and the button sat on **"Saving…" forever**
while a HomeKrafter watched the listing they had just written up go
nowhere. Same in the menu editor, and in all three `handleAdvance`
screens — a HomeKrafter marking an order packed got a permanently
spinning button and an order that had not moved.

`HomePromoEditorClient` was different and worse again: `setSaved(band.id)`
ran unconditionally, so a **failed** save still displayed "Saved." That is
home-page copy, and an admin would have walked away believing it had
changed.

Also fixed while in there: the listing form's own pre-check omitted
`description`, which the server requires — so submitting without one
produced the raw class-validator string *"description must be longer than
or equal to 1 characters"* on the screen a home cook writes their first
listing on.

### Fixed — a payout Amount box that was thrown away

`POST /seller/payouts/request` takes **no amount** — the server computes
the whole pending balance itself and never trusts a client-submitted
figure. The screen collected one anyway: an Amount input, validated as
"greater than zero", disabled the button until it was filled, and then
called the endpoint with no body. A HomeKrafter with ₹6,210 pending could
type 1,000, press the button, and get a request for ₹6,210.

The origin is in the api layer's own doc comment: the parameter was
"kept on the signature only so the call site doesn't need to change;
ignored". The call site duly built a form around it.

The field is gone, replaced by what actually happens — the pending figure,
in words, plus the fact that settlement is by hand. The parameter is gone
from the signature too.

The same handler had no `catch`, and this endpoint's *normal* answer on
this very screen is a 409: one payout may be pending at a time, and one
already was. So the button sat on "Requesting…" forever, on the screen a
HomeKrafter uses to ask for their money. It now says "A payout request is
already pending for this account".

Three admin handlers had the same gap — suspending an account and setting
a verification badge, neither of which may fail quietly: an admin who
believes they have locked an account or verified a kitchen, and has not,
is the wrong person to leave uninformed.

### Fixed — unbounded text on every listing

`CreateListingDto.name` and `.description` carried a `@MinLength(1)` and
**no upper bound at all**. A 5,000-character product name was accepted and
stored, and that string is rendered on every card, every grid, the admin
queue and every order line. The only thing that had ever bounded it was
Express's 100 KB body limit, which is not a product decision.

Capped across the DTOs a person can actually reach: listing name (120),
description (4000), sku, weight label and category id; menu item name and
description; collection title, description and image URL; the admin
refund title, wallet-adjust reason and status override. Both boundaries
are tested — a cap nobody has checked from below tends to be off by one.

### Fixed — a referral programme built from neither end

Found by opening `/account/referrals` and reading what the buttons did.

**Nothing created a `Referral`.** `POST /auth/register` accepted
`referredByCode` and `User.referredByCode` stored it, and no code path in
the server ever read that column. Every row on the page came from the
seed. So a real person could copy their code, watch a friend sign up with
it, and the invite would never appear — under a page promising "you both
get ₹250".

**And the reward was a button.** `POST /referrals/:id/apply-credit`
credited ₹250 of real wallet money gated on nothing but the row existing,
and the page shipped a card headed *See it in action* with **"Apply
referral credit (demo)"** wired straight to it. A shopper granting
themselves a wallet credit — the same shape as the open review endpoint
M15 closed, and a demo affordance moving real money on a production
screen, which `CLAUDE.md` (M17) already forbids.

- **Signup records the referral.** A matching code creates a
  `status: joined` row inside the signup transaction. An unknown code is
  ignored silently — a mistyped code must not fail a signup, and
  reporting a miss would make registration an oracle over the code space
  (same reasoning as `forgotPassword`).
- **Self-referral is refused, and it was reachable.** Codes are derived
  from the first name (`ANANYA250`) and the referrer lookup runs *inside*
  the signup transaction, after the row is inserted — so somebody signing
  up as "Ananya" and guessing `ANANYA250` found their own brand-new
  account. On a live programme that is ₹250 for registering.
- **The credit requires the friend's first order to be *delivered*.**
  Not placed: a place-then-cancel round trip would otherwise pay ₹250 for
  nothing, the exact hole M22 closed on cashback. Each refusal names
  which condition is unmet.
- **The demo card is gone** from the consumer screen.

Nine specs. What is *not* built here: nothing pays the referral out
automatically when that first order lands — the endpoint is now safe to
leave reachable, but somebody still has to call it. **That trigger is a
product decision and is left for the owner**, deliberately unimplemented
rather than guessed at.

### Fixed — five screens where Save did nothing and said nothing

One shape, found five times: `try { await save() } finally { setBusy(false) }`
with no `catch` anywhere in the file. The server refused with a perfectly
clear sentence, the UI showed none of it — form still open, button
un-greyed, the only trace an unhandled rejection in a console nobody has
open. Pressing Save appeared not to work.

- **Profile** — an invalid email or phone returned "email must be an
  email; phone must be a valid phone number" and the screen showed
  nothing.
- **The address book** — same, plus no client-side check at all.
- **Notification preferences** — worse than silent. The switch was flipped
  *before* the request and never put back, so a failed save left the page
  showing a preference the server had rejected, on the one screen whose
  whole job is "what may we send you".
- **Support** — somebody types out a problem they are having, presses
  send, and the message is dropped without a word.
- **The seller dashboard** — a failed load fell through to a render where
  every `?? 0` turned "we could not reach the server" into **"Today's
  orders 0 · Today's revenue ₹0 · Pending payout ₹0"**, indistinguishable
  from a quiet morning. A home cook deciding whether to cook today is
  precisely who must not be shown invented zeroes. It now says the numbers
  are missing, not zero.

Each now catches and shows the server's own sentence via
`apiErrorMessage()` — `ApiError.message` is already the right text,
including the wait-and-retry copy `http.ts` composes for a 429 — with a
plain fallback for a genuine network failure. The two optimistic toggles
revert.

`client/lib/silent-failure.spec.ts` makes `finally` imply `catch` across
`components/` and `lib/`. It is deliberately coarse: a handler that should
genuinely ignore a failure can still write an empty `catch` with a line
saying why, which records the decision rather than leaving the question
unasked. It found the fifth offender, which a grep had missed.

### Fixed — an address nobody could deliver to

`POST /users/me/addresses` validated `phone` and `pincode` as "a non-empty
string" and nothing else. `phone: "not-a-phone"` with `pincode: "ABCDEF"`
was accepted, stored, listed in the address book and shippable at
checkout — confirmed against a running server.

The cost lands entirely on the HomeKrafter. A delivery is routed by
pincode and rescued by phone, so a malformed pair means a home cook who
has already cooked the food, set out to deliver it, and has no way to find
or call the buyer.

- `phone` is `@IsPhoneNumber('IN')`, **not** the region-less form. Without
  a region class-validator demands strict E.164, which rejects a bare
  `9845012345` — the way the number is actually typed. Refusing the common
  format would have been a worse bug than the one being fixed. Measured:
  `'IN'` takes `9845012345`, `+919845012345`, `098450 12345` and
  `98450-12345`, and still refuses `not-a-phone` and `12345`.
- `pincode` is `/^[1-9][0-9]{5}$/` — six digits, never leading zero (the
  first digit is the postal region, 1–8, 9 being Army Postal Service).
  A format check, not a lookup against codes we serve: coverage is a
  delivery-radius question, decided elsewhere and for a reason a buyer can
  read.
- `PATCH /users/me` gets the same phone rule, so the address form no
  longer accepts what the profile form rejects.
- The edit path inherits it through `PartialType`, asserted anyway — a
  future rewrite giving updates their own DTO would otherwise reopen the
  hole on the path people use to *correct* a bad address.

23 specs. The client says it too, naming the field rather than
round-tripping a combined message, but the server is the authority.

### Fixed — clicking Place order twice bought it twice

Found by clicking it three times.

`POST /orders` accepted no `Idempotency-Key`, and nothing else on the
server deduplicated a checkout. The only thing between a shopper and a
duplicate purchase was `CheckoutClient`'s `placing` flag — a React state
update, which does not disable the button until the next render. Three
clicks inside one task produced **three orders, three stock decrements and
three wallet debits**: ₹894 taken for one ₹298 purchase, each duplicate a
real unit of inventory a home cook no longer has.

`POST /orders/:id/pay` had been idempotent since M8, which is what made
this look covered. It was not — paying twice was prevented, *ordering*
twice was not, and each duplicate order carried its own payable total.
Worse, the web client had never sent a key to that endpoint either, so
even the protection that existed was unused.

A real mouse double-click did not reproduce it, because React happened to
re-render in the ~50 ms between the two clicks. That is a timing accident,
not a guard: held Enter on a focused button, a slow render on a cheap
phone, or a client retry over a flaky connection all land in the same
place.

- **`POST /orders` accepts `Idempotency-Key`**, wrapped in the same
  machinery the wallet endpoints already use.
- **The key is checked before the cart validation**, not after. The first
  call empties the cart, so a sequential replay — a refresh, a retry —
  otherwise failed with `400 Cart is empty` for an order that had actually
  succeeded. `IdempotencyService.replay()` exists for exactly this shape.
- **Checkout mints one key per attempt** and keys the wallet payment on
  the order id. A failed attempt retries under the same key (the server
  does not consume a key whose work threw); a new purchase means a new
  mount and a new key.
- **A synchronous `useRef` guard** flips before any await, so the clicks
  never both reach the network. That is the fast guard; the key is the one
  that holds across renders, tabs and reconnects.
- **The kitchen is notified inside the transaction**, so a replayed key
  returns the stored order without messaging anyone twice about an order
  they already have.

Four specs, including that two genuinely separate purchases still produce
two orders — collapsing those would be worse than the bug.

### Fixed — "Top up wallet" did nothing, silently, forever

Found by clicking it.

`POST /payments/razorpay/order` returns `mock: true` when the server has
no usable Razorpay keys — it minted an `order_mock_…` id locally instead
of calling Razorpay. Both callers read every other field of that response
and dropped this one, then handed the fake id to the real `checkout.js`
SDK with the placeholder key.

That does not fail loudly, which is why it survived. Razorpay answers
`401`, the widget sets its own container to `display: none`, and **neither
the success handler nor `modal.ondismiss` ever fires** — so the promise
awaiting one of them stays pending and the SDK's scroll lock
(`document.body { overflow: hidden }`) is left behind. Measured in the
browser: no modal, no error, no toast, no console message, and the page
quietly stops scrolling. At checkout the same path ran *after* creating a
real `Order`, stranding it at `pending_payment`.

This is the state of every deployment there has ever been, production
included — `docs/LAUNCH-READINESS.md` §1 has always listed the Razorpay
keys as unset. So the two money entry points have been dead the whole
time, presenting as live.

- **`GET /payments/razorpay/config`** (public) reports whether a card
  payment can actually complete. A client checks it *before* offering the
  option rather than after creating something it cannot collect. Derived
  from the server's env, not `NEXT_PUBLIC_RAZORPAY_KEY_ID` — the key that
  decides whether a payment captures is that one, and the two can
  disagree. It answers one boolean and discloses no key.
- **The wallet's Add money card** is replaced with "not available yet"
  when payments are off — the same shape as the paused auto-top-up card
  beside it, and for the same reason: a dead control under a promise that
  is false is worse than an honest absence. The auto-top-up card's own
  copy ("top up manually above") is now conditional too, since it would
  otherwise point at something that isn't there.
- **Checkout disables the Card / UPI tile** and, when the wallet cannot
  cover the total, refuses the order *before* creating it, saying exactly
  why. Falling back to Razorpay for an uncovered balance was only ever
  correct while Razorpay could collect.
- Both call sites also check `mock` on the response itself. The config
  fetch is the gate; this is the second lock on the same door.

The client fetch **fails closed** — an unreachable API reads as "not
available" rather than routing a shopper into the hang.

Two guards, because there are two ways to undo this: an e2e spec asserts
the endpoint is public, honest and key-free, and
`client/lib/payments-guard.spec.ts` asserts no caller of
`openRazorpayCheckout` ignores `mock` — verified by deleting the check and
watching it fail.

**Also fixed here:** a typed top-up amount that wasn't a positive number
was silently swapped for the selected chip. Typing `-100` and pressing Top
up opened a **₹500** charge with nothing said. Whatever is in the box is
now what gets charged, or the form refuses it.

### Fixed — cancelling an order paid you

Found by doing it in a browser and checking the wallet afterwards.

Cashback is credited the moment an order reaches `placed`. Cancelling
refunded the full order total and **left that credit alone**, so a
completed place-then-cancel cycle left the buyer up by the cashback: a
₹1,029 order moved the wallet 1250 → 221 → 272 → **1301**, a ₹51 gain for
buying nothing. Nothing bounds how many times that runs — two API calls,
repeatable indefinitely, and it drains the promotional budget without a
single sale. The same loop also incremented `lifetimeSaved`, which drives
loyalty tier, so it bought tier progression for free too.

Cancellation now reverses the cashback in the same transaction as the
refund, and unwinds `lifetimeSaved` by the same amount. It is affordable
by construction — it runs immediately after crediting the full total
back, and cashback is a fraction of that total, so the balance can never
be short however the buyer spent in between. The reversal is marked
`skipAutoTopupCheck`, because taking a promotion back is an accounting
correction and must not trip an auto-top-up that charges someone's card.

The spec asserts the invariant — a place-then-cancel round trip leaves
the wallet exactly where it started — rather than the presence of a
reversal row, which would pass while the arithmetic stayed wrong.

### Fixed — no product could be opened from a keyboard

Found by pressing Enter, which is the only way it could have been found.

`ProductCard` was a `<div role="button" tabIndex={0} onClick>` — the
prototype's div+onClick technique, kept deliberately so the wishlist and
add buttons would not nest inside an `<a>`. The reasoning was sound and
the result was still broken: React's `onClick` on a div does **not** fire
for Enter or Space, and nothing supplied an `onKeyDown`. Every product
card on every grid — shop, gifts, storefront, home rails, occasion pages —
was focusable and could not be activated. A keyboard-only user could tab
through the entire catalogue and open nothing. Measured in a browser:
mouse click navigated, Enter and Space did not.

It had survived every review because it is invisible three ways. The
element is focusable, so it looks reachable. `role="button"` makes an
automated audit report a button. And every mouse test passes.

The card is now a real link — a stretched `<Link>` on the title whose
`::after` covers the card. That keeps the whole surface clickable, keeps
the two buttons out of the anchor (they sit above it in z-order, verified
by hit-testing), and makes the destination a genuine URL: openable in a
new tab, copyable, and activated by Enter like every other link on the
web. The div variant survives for the dev gallery, which has no
destination, and now carries the key handler it always owed.

`client/lib/keyboard-activation.spec.ts` scans every component for the
same shape and fails on any `role="button"` without an `onKeyDown` —
verified by reintroducing the bug.

### Changed — the marketplace stopped being food-first in its own type system

Owner request: *this marketplace is for everything that is homemade.* It
was not, and the problem was in the enums rather than the copy, so it
reached the apply form, the admin filters, discovery and the storefront.

- **`SellerSpecialty` had five food values and one `crafts` bucket** for
  the entire non-food half. A candle maker, a potter, a jeweller and an
  illustrator all submitted the same tag — no buyer could filter between
  them and no applicant could say what they made. Added `beverages`,
  `candles`, `ceramics`, `textiles`, `jewellery`, `art_prints`,
  `bath_body`, `stationery`, `home_decor`, `personalised`.

- **Existing `crafts` rows were deliberately not remapped.** Nothing
  records whether a given one pours candles or throws pots, and a guess
  would print the wrong thing on a real person's storefront. The value
  stays valid, relabelled "Other handmade", and those sellers can re-pick.

- **The apply form stopped asking applicants to classify themselves.**
  `SellerApplicationCategory` (`maker | baker | artist | home_chef |
  other` — its own schema comment said "the platform is food-first") was
  a second, coarser taxonomy overlapping the first, and its only consumer
  was `Vendor.type`, which is **rendered on no screen**: a question put to
  every applicant to fill a column that feeds another column nobody reads.
  Both are now derived from what they make. The field stays accepted so a
  shipped native client keeps working.

- **`/admin/sellers` could not filter to a single non-food HomeKrafter.**
  Four of its five filters were food and the fifth was `laundry`, a module
  withdrawn in M19. The list is now built from the specialty groups, so a
  new value appears without anyone remembering to add it.

- **A candle maker is no longer asked for a food licence.** The FSSAI
  number field and its unmet verification badge showed on every
  HomeKrafter's profile — on the screen that decides whether they finish
  setting up, a requirement they cannot meet for a product it does not
  apply to. Gated on `makesFood()`, which is the one legitimate thing to
  branch on a specialty for: it decides what a form *asks*, never what
  anyone can *reach*.

- **Copy swept**: `/sell`'s title was "Sell your homemade **food**", the
  seller dashboard said "how your **kitchen** is doing", the storefront
  banner asked for "a wide shot of your kitchen or your food", and the
  profile's photo section was "Inside your kitchen" (now workshop, for
  someone who doesn't cook). The eighteen specialty chips are grouped
  into the two halves rather than presented as one wall.

### Added — a listing is reviewed before it is public, and a refusal says why

Owner request, on priority. Before this, `Product.moderationStatus`
defaulted to **`active`**: a listing was live the instant it was saved, and
moderation was retrospective takedown. `ModerateProductDto` accepted an
action and *nothing else* — there was no field for a reason, nowhere to
store one, and **no notification of any kind**. A listing could be hidden
and its owner was never told, nor why; they would find out by noticing
their orders had gone quiet.

- **`pending` and `rejected` joined the enum**, and `pending` is now the
  default on `Product`, `MealPlan` **and** `Snack` — the last of which had
  no moderation column at all, the one catalogue an admin could not touch,
  sitting beside two that were gated. Existing rows stay `active`: the
  migration changes a column default and runs no `UPDATE`, because applying
  an approval gate retroactively would delist a live catalogue and take
  every kitchen's income with it. Verified against the audit database — 16
  live listings, all still `active`, default now `pending`.

- **Every public filter flipped from a denylist to an allowlist, and this
  was the whole risk.** Each browse query said `moderationStatus: { not:
  'hidden' }`, which was exactly equivalent to an allowlist while `hidden`
  was the only bad state. It stopped being equivalent the moment `pending`
  existed: shipping the enum change alone would have **published every
  unreviewed listing** while the feature looked like it worked. The rule
  now lives in one file (`server/src/catalog/moderation.ts`) with the
  reason attached, and a spec that fails if the denylist comes back.

- **Six ways round the gate, all closed.** `getBySlug` filtered on nothing,
  so a guessable slug was a preview of an unreviewed listing. `cart.addItem`
  had **never** checked moderation in its life — a pre-existing hole that
  let a hidden listing be bought by anyone holding its id, and that would
  have made every browse filter cosmetic. Reorder checked `=== 'hidden'`.
  Wishlist checked nothing. The WhatsApp inbound order path matched a snack
  by free text with no moderation filter — the one order path that never
  passes a browse surface, and so the one that would have kept working
  after every other gate closed. `hidden`/`flagged` still resolve by direct
  link, because carts and orders already reference them.

- **A refusal requires a reason, and it reaches the HomeKrafter verbatim.**
  `reject`/`hide`/`takedown`/`flag` 400 without one. It is stored on
  `Product.moderationNote` and delivered in-app, by email and over WhatsApp
  through the existing preference fan-out — confirmed live: three channels,
  reason intact, not paraphrased. Approving clears the note.
  `feature`/`unfeature` deliberately leave it alone, so putting an item on
  the home page cannot erase why it was flagged.

- **`/admin/catalog` is a queue**: `pending` first, oldest `submittedAt`
  first, "Waiting" as the default filter, the waiting count leading the
  page header, and an inline reason box that will not submit under ten
  characters. Two queries rather than a JS sort, so the first rides the new
  `(moderationStatus, submittedAt)` index.

- **The seller portal shows the state and the remark next to the Edit
  button**, and an edit resubmits. An edit re-queues only on a material
  change — name, description, category, photo, and `weeklyMenu` on a plan —
  not on price or stock. Re-queueing every edit makes editing something a
  kitchen avoids, and stale listings are how a marketplace rots;
  re-queueing nothing makes approval a formality you pass by listing
  something innocuous and rewriting it after. A `rejected` listing
  re-queues on any edit; a `pending` one keeps its place in the queue.

- **Fixed in passing: `/admin/catalog` has always rendered "Vendor · " with
  a dangling separator against a real server.** `categoryName` was in the
  client's type from the day the screen shipped and was never sent by the
  endpoint — only the mock produced it. Found in the browser, not by
  reading the code.

### Added — an approved HomeKrafter can actually sign in

The standing blocker `CLAUDE.md` has carried since M17, closed on the
software side. Approval used to mint the account with
`authProviders: ['phone']` and **no credential**, then post a welcome
notification reading "add your first items from the Listings tab" — into
the in-app inbox, **which sits behind the login that account cannot
pass**. Phone OTP was the only route in, and with Twilio unset a real OTP
reaches the server log and nowhere else. Every kitchen approved for real
was locked out of the product it had just been approved for.

- **Approval now sends a single-use, 7-day set-password link by email and
  SMS** (`SellerInviteService`). Seven days rather than the reset flow's
  hour, because an invite is sent when an *admin* clicks approve, not when
  the recipient is sitting at a form.

- **A link, not a mailed password.** The ask was "send login credentials";
  this sends something that becomes one on first use. It reuses the
  existing `PasswordResetToken` machinery — already single-use, expiring
  and session-revoking — so it adds no new security surface. A mailed
  password would sit readable in that inbox forever, could not be rotated,
  and on this platform is the credential that can change payout details.

- **Failure is reported, not swallowed.** Both providers degrade to a
  logged stub when unconfigured and say so. The admin screen now shows
  "Approved — but we could not reach them", with the link to hand over.
  The old behaviour showed a confident success for someone who had been
  sent nothing they could open. The invite link is **never** written to
  the audit log — only whether they were reached.

- **`POST /admin/sellers/:id/resend-invite`** — burns the previous link
  and issues a new one. The remedy for "it never arrived", and it refuses
  a suspended account, same rule `forgotPassword` already applies.

- **A duplicate application returned a 500.** `Seller.userId` is unique,
  so approving a second application from an address that already had an
  account hit a raw unique violation *inside the approval transaction*.
  Reachable by doing nothing strange: an applicant who does not hear back
  applies again. Now a `409` naming the existing storefront. Found by
  writing the spec above, not by reading the code.

- `/reset-password?welcome=1` says "Set your password", not "Set a **new**
  password" — nobody approved five minutes ago is resetting anything, and
  copy referring to a credential you do not recognise reads as phishing.

**Still config, not code:** with `SENDGRID_API_KEY` and Twilio unset,
every channel is a stub and nobody is reached. `docs/LAUNCH-READINESS.md`
§1.

### Fixed — a dead session that presented as a live one

- **A failed session restore left the browser claiming to be signed in,
  permanently.** `AuthContext`'s hydration had two "no real session
  survived, trust the local flags" branches for seller and admin, written
  when those surfaces predated real sessions. Since M8.4b/M8.5 every real
  sign-in persists one, so the only thing left that could fire them was a
  session that had just failed to restore — and they turned that into a
  claim of being signed in. Walked in the browser: an admin whose refresh
  token had expired got the admin shell, every request inside it 401'd,
  `http.ts` bounced them to `/login`, and `/login` — reading the same
  flags — answered "You're all set. You're signed in to your Homekrafted
  admin account" and offered "Go to the admin panel", which bounced
  straight back. No sign-in form anywhere in the loop; only the "Sign out"
  button escaped. Both branches are gone: no real session means signed
  out, for every role. Same rule as `getMySeller()` — anything derived
  from a session must fail empty, never fall back to a fixture.

- **…and it could not self-heal, because the flags were never rewritten.**
  The effect that persists `hk_auth_v1` and the `hk_role` cookie is keyed
  on `signedIn` changing, and `signedIn` starts at `false` — so hydration
  landing on "signed out" set it to `false` again, React bailed out of the
  no-op update, no re-render happened and the effect never ran. Stale
  flags therefore survived every failed restore. Hydration now writes them
  itself.

### Fixed — the food page was selling candles

- **`/shop` listed both verticals.** M20 added `Product.kind` precisely so
  Handcrafted Gifts could be a second vertical; `/gifts` was filtered to
  `kind: craft` and `/shop` was left calling the unfiltered `getProducts`
  it had used before crafts existed. So a page headed **Homemade Foods**,
  reached from a nav item reading **Homemade Food**, described in its own
  metadata as "small-batch pickles, sweets, bakes and snacks", listed
  8 crafts among its 16 products — and offered "Candles & Home", "Handmade
  Jewellery", "Art & Prints" and "Personalised Gifts" as filters in a food
  sidebar. New `getFoodProducts()`; the category facet is scoped with
  `Category.group` so the filters describe the catalogue the page shows.

- **A listing with no reviews was rendered as a listing rated zero.**
  `★ 0.0 (0)` on every product card, `★ 0.0 (0 reviews)` on every
  storefront header, `★ 0.0 · location` in search and following — and, on
  the product page, five filled stars beside "0.0 · 0 reviews", where the
  decoration said five and the number said zero and neither was true. It
  is the worst possible score, shown to every kitchen and every maker on
  their first day. Now "New" / "No reviews yet". Same rule as M16's
  `cancellationRate`, which is `null` rather than `0` before anything has
  closed: absence gets said as absence.

### Changed — Meal plans is in the nav

- **The one product that recurs was reachable only from the footer.** M19
  built the whole subscription engine — wallet debit, one `MealDelivery`
  row per meal owed, skip/pause/resume/cancel — and M20 built
  `/meal-plans` and `/meal-plans/[slug]` on top of it. Neither put it in
  the primary nav. This is the same argument M19 already made in
  `site.ts` when it promoted **Corporate & bulk** out of the footer
  ("reachable only from the footer — the least-read part of the page —
  while the enquiry form and the whole quote funnel behind it sat
  finished"), and it applies harder here: a cycle is ₹960–₹3,900 and it
  renews, against ₹120 for one thali.

  It **replaces About** rather than joining the row. About is already in
  the footer's Help column and is not something anyone arrives intending
  to buy; the nav, meanwhile, is full.

- **The header breakpoint moved 1120px → 1190px, and the nav gap tightened
  one step.** "Meal plans" is wider than "About", which took the row to
  1190px inside an 1180px container — so it no longer fitted at *any*
  viewport width, the same class of failure the M21 header fix already
  found twice. `--hk-s5` → `--hk-s4` on `.nav` buys back exactly the 20px.
  Measured, not guessed, and written down in `CLAUDE.md`: the next nav
  item added has to displace one.

### Added — the listing says where it is delivering to

`components/location/LocationBar.tsx`, on `/shop` and `/snacks`.

- **Nothing said what was being shown.** CLAUDE.md's location rule is "no
  coords → the API returns the *full* catalogue, **and the UI says so**".
  The first half shipped in M12; the second half never did. Measured
  during the sweep: `/shop` read "8 small-batch products from home
  kitchens across India" when unfiltered, "5 small-batch products from
  home kitchens across India" when filtered to Mohali Phase 7, and gave
  the buyer no way to tell those apart or to know a filter was on at all.

- **Answering the prompt was a one-way door.** `LocationPrompt` sets
  `asked: true` and never reappears, and nothing called `clear()` — whose
  own doc comment already called it "the change area affordance". Someone
  who skipped the prompt, or picked an area and then moved, had no route
  back short of clearing `localStorage`. The function existed; only the
  button was missing.

- **Changing the area did not change the listing.** `/shop` and `/snacks`
  read `hk_loc` during their *server* render, so setting an area updated
  the context and the header copy while the grid below kept showing the
  previous area's products — the page claimed a filter it had not
  applied. `LocationProvider.persist` now calls `router.refresh()`, and
  only when the coordinates actually move, so dismissing a prompt without
  answering it does not refetch the page.

### Fixed — SEO

- **Three routes shipped the brand twice in their title** — `/about`,
  `/search` and the 404 all rendered `… — Homekrafted — Homekrafted`,
  because they wrote the suffix that `app/layout.tsx`'s
  `title.template` already appends. A title is the one piece of SEO nobody
  reviews in a browser: the tab truncates it and the duplication only
  shows up in a search result. `lib/seo-titles.spec.ts` now asserts no
  route file writes the brand into its own title — checked over the route
  files, because `pageMetadata` cannot see it (the string it is handed is
  already wrong).

### Fixed — LCP

- **Four product grids left their above-the-fold images lazy-loaded**
  (`/shop`, `/gifts`, `/hamper`, `/search`), so the one image the LCP
  score is measured on was fetched only after layout. `ProductCard` and
  `ProductGridCard` now take a `priority` prop and each grid marks its
  first row. The **row**, not the first card: every card renders at the
  same size, so which one wins LCP is decided by paint order and is not
  stable — measured at 1280px, Next named the second card, and marking
  only the first was a fix that missed.

### Changed — auth UI

- **Social sign-in moved out of a third method tab** and now sits under
  whichever form is active on `/login` and `/signup`, behind an "or
  continue with" divider. A tab framed it as a fourth thing to go and
  find, and hid it from anyone who never clicked. Extracted to a shared
  `components/auth/SocialSignIn.tsx` — the glyphs and both buttons had
  been copy-pasted into `LoginClient` and `SignupClient`.

- **Removed the sign-in page footnote** that told every visitor social
  login "trusts the browser instead of verifying a real Google/Apple
  token". True, tracked, and not something to publish to the people best
  placed to use it.

### Known — carried, not fixed

- **`POST /auth/social/:provider` is an account takeover** and stays open
  by owner decision (2026-08-06): keep the endpoint, add real id-token
  verification before launch. Now a hard launch gate in
  `docs/LAUNCH-READINESS.md` §0.4 and in `CLAUDE.md`'s standing blockers,
  not a backlog item. Needs a Google OAuth client ID and an Apple service
  ID that do not exist yet.

### Tests

- `server/test/e2e/auth-hardening.e2e-spec.ts` — 10 specs covering all
  four fixes above, including that the new guard lookup still
  short-circuits on `@Public()` routes.

- `server/test/e2e/money-races.e2e-spec.ts` — 15 specs racing real
  in-flight requests against one Postgres, not a simulated interleaving.
  Each fix is paired with a spec asserting the legitimate case still
  works: a second payout after the first settles, a fresh Razorpay order
  once the total changes, a second top-up, a genuinely new WhatsApp
  message.

## [M20] — Two verticals, a home page that says so, and meal plans you can buy — 2026-08-04

The client's change document, read end to end. Most of it was copy. Two
items were not, and those decided the schema. See `docs/M20-PLAN.md`.

### Added

- **Handcrafted Gifts is a second vertical.** `Product.kind`
  (`food | craft`) and `Product.shippingScope` (`local | national`), plus
  `Category.group` and `Category.sortOrder`. All additive with defaults, so
  every existing row keeps its meaning without a backfill.

  **One column, not a second model** — the same call M18 made for hampers.
  `Product` was food-shaped throughout (`dietary`, `ingredients`,
  `shelfLife`, `isPackaged`, `defaultWeightSku`) and a candle is none of
  those, but a craft still needs a vendor, photos, price tiers,
  availability, moderation, reviews, cart, checkout and search. A parallel
  `CraftProduct` re-derives all of it and then drifts.

  `shippingScope` is the one that changes a query: **`national` listings
  skip the delivery-radius gate entirely** and are returned with or without
  buyer coordinates. A candle goes in the post, so how far a kitchen will
  drive a hot meal says nothing about whether it can reach you. It is an
  explicit column rather than derived from `kind`, because a kitchen
  shipping pickles across India is a real case and deriving it would forbid
  one. This extends the M12 rule rather than breaking it: location was
  never a gate, and now some listings are not even radius-eligible.

- **`/meal-plans` and `/meal-plans/[slug]`.** The subscription API shipped
  in M19 and nothing on the site linked to it. Now a buyer can pick their
  days, a 30-minute window and a cycle length, see the total **before** the
  button, and pay once from their wallet. Every refusal — a short balance,
  a full plan, a window the kitchen doesn't offer — is surfaced in an
  `aria-live` region rather than swallowed, and an idempotency key is
  minted per attempt so a double-tap cannot charge twice.

- **`/seller/meal-plans`** — the screen behind the API. Create, edit and
  close a plan; a work queue of every meal owed, grouped by day, with the
  customer, their address and a call button.

  Two things it must keep saying out loud. **Closing a plan is not
  deleting it**: the confirm names how many people are already on it and
  that they keep the meals they paid for, because a cook reading "close"
  as "stop cooking" would walk away from a prepaid commitment. And
  **"Delivered" is the only thing that spends a meal** from somebody's
  cycle — a skipped meal is still owed, so nothing else may decrement it.

  The plan editor shows **how many delivery windows the plan actually
  offers**, and says so in red when the answer is zero. That happens when
  a kitchen's opening hours don't overlap the meal — a real configuration
  error that otherwise presents as "nobody ever subscribes", with nothing
  on screen connecting the two.

  "Something else" sits as the **fourth peer** of breakfast/lunch/dinner
  rather than an advanced option, which is the M20 generalisation made
  visible: a monthly pickle box is an ordinary thing for a home kitchen to
  sell.

- **The corporate funnel — a queue, a notification, and a quote somebody
  can actually accept.** `CorporateInquiry` had a live public POST, a
  203-line form behind it, and **nothing anywhere that read a row**. One
  Diwali corporate order is ₹5k–₹50k against ₹120/day for a meal plan, so
  the leads sitting unread were the most valuable thing being discarded.

  `/admin/corporate` is the missing reader. Every admin is now notified on
  inbound, `void`-called outside the write, capped at ten recipients, and
  the public POST is throttled to 5/60s like its sibling intake — it had
  been on the app-wide 120/min while fanning out a message per admin per
  channel.

  **`CorporateQuote` + `CorporateQuoteLine`**, and a tokenised public page
  at `/corporate/quote/[token]` — no login, because procurement will not
  make an account to accept a quote. Rules worth not undoing:

  - **The token is a bearer credential.** Only its SHA-256 hash is stored,
    like `PasswordResetToken`. Not-found and revoked are byte-identical
    responses, so a stale link cannot be probed for whether it was ever
    real. Re-sending rotates it, killing the previous link.
  - **Accepting is a POST, never a GET.** An email-security scanner
    following the link must not accept a ₹50,000 order.
  - **The claim is a conditional `updateMany`.** A link forwarded to
    finance and opened twice at once accepts exactly once —
    `IdempotencyService` cannot help, it is user-scoped and this caller is
    anonymous. The losers get the receipt, not a 409.
  - **Every line names a kitchen, even a fully custom one.** Seller order
    visibility, notifications and payouts all resolve ownership through
    the vendor, so a line naming none is work nobody can see and money
    nobody can be paid.
  - **`total` is stored, and tax and delivery are their own columns.**
    Nobody can accept a number that is not the number they will be
    invoiced.
  - **Acceptance creates no `Order`s.** `Order.userId`,
    `OrderItem.addressId` and `OrderShipment.addressId` are all required
    and a `CorporateInquiry` has no user and no address — the schema
    cannot express a corporate order. Writing one anyway would push an
    uncollected five-figure amount into GMV, into the payouts queue as a
    real debt to a home cook, and through `computeCashback` as ~5%
    credited to an account auto-created for a stranger. The screen says so
    where an admin will read it.

  28 e2e cases, including the concurrent-accept race and the four token
  states.

- **A HomeKrafter can list a handcrafted gift.** `kind`, `shippingScope`
  and `isSnack` shipped on `Product` with readers and **no write path** —
  nothing but a direct database edit could set them, so `/gifts` was live
  and permanently empty and the snacks flag was decoration. All three are
  now on `POST/PATCH /seller/listings`, optional and defaulting to what a
  pre-M20 listing was.

  **The listing form branches on kind.** A jeweller is not asked whether
  their earrings are gluten-free, the category picker only offers the
  categories on that side of the catalogue, and switching kind clears a
  category that no longer applies rather than leaving a value nothing
  displays.

- **Craft catalogue seeded** — four categories (twelve in total, matching
  the client's tile list), two craft makers with real storefronts and
  logins, eight listings. `prisma/seed-crafts.ts`, additive and safe to run
  against production like `seed-meal-plans.ts`.

  **No photography on any of them.** We hold no craft images and CLAUDE.md
  forbids fabricating product imagery, so these render through
  `ImageSlot`'s labelled placeholder until a maker uploads their own.

- **`/gifts`**, the handcrafted-gifts catalogue, saying plainly on the page
  that these post nationally while food does not. That is not a detail to
  discover at checkout.

- **"Homemade, Your Way"** — four ways to order, rendered from
  `waysToOrder` in `lib/data/site.ts`. The section it replaces was itself a
  repair after laundry was cut from a hard-coded row and left a hole; a
  list makes the next removal a deleted array entry.

- **"Backed by"** — CUNA, ISB AIC and CGC, as text rather than logos.
  Reproducing a mark is a separate permission from stating a relationship
  and we hold neither in writing. **Confirm each before this is public.**

### Changed

- **The home page's product rail became a people rail.** "This week's small
  batches" is now **"Meet the Hands Behind the Flavours"** — four kitchens
  with their story and their bestseller. On a platform whose whole thesis
  is trusting a stranger's kitchen, the home page never showed a cook.
  `getFeatured` is untouched and still feeds `/shop`.
- **The wallet cashback band is now the meal-plan band** — "Ghar Ka Khana,
  Every Day". Edited in `homePromoBands`, not hardcoded in JSX, so the
  `/admin/collections` editor still reaches it.
- Hero is **"Everything homemade"** with two equally weighted CTAs, one per
  vertical. Nav is Homemade Food · Handcrafted Gifts · Gift Hampers ·
  Occasions · About — a rename, not a re-route: `/shop` is unchanged, so
  every indexed URL still resolves.
- Headings per the client: "Thoughtful Handkrafted Gifts for Every
  Occasion", "Explore Homemade Favourites", "Homemade on Your Feed",
  "Gifts that feel personal".

### Fixed

- **Two notifications racing for the same recipient silently dropped one
  of them — in production, not only in tests.** The first time a user is
  messaged in a category, `NotificationsDeliveryService` writes their
  `NotificationPreference` row as a read followed by a create on a unique
  key. `deliver()` is called concurrently by design: `OrdersService.create`
  fires two `void` deliveries back to back and `OrderNotificationsService`
  fans out over `Promise.all`. Two landing on the same `(userId, category)`
  before either commits means both miss the read and both insert, and
  Postgres rejects the loser with P2002.

  Because every caller `void`s the result, that exception was invisible and
  took the **whole** notification with it — not one channel of it. Losing
  the race is now the ordinary case it always was: the loser adopts the row
  the winner just wrote. M18's rule that every path writing `Order.status`
  owes the buyer a message was true of the call sites and untrue of the
  delivery underneath them.

- **Withdrawing the link of an *accepted* quote rewrote the deal as a
  draft.** `revoke` set `status: 'draft'` unconditionally. For a `sent`
  quote that is the point — nobody should be reading that number any more,
  so it becomes re-pricable. Applied to an accepted one it undid three
  things at once: the admin queue showed a closed deal as never sent,
  `acceptedAt`/`acceptedName` sat on a row calling itself a draft, and
  `PATCH .../quotes/:id` — drafts-only, 409 on a sent quote precisely so
  nobody edits a number a customer is reading — quietly reopened on a
  number a customer had already agreed to.

  Only a `sent` quote falls back now. Killing the link after acceptance is
  still allowed, because a forwarded email should stop working once the
  deal closes; it just no longer rewrites what happened. Found by revoking
  an accepted quote against production.

- **The e2e suite could be answered by a completely different server.**
  `request(server)` opens an ephemeral listener when `server.address()` is
  null and closes it again as soon as that one response lands. So request A
  bound a port, request B reused it without adopting the listener, and A
  then closed it out from under B — releasing the port back to an OS that
  hands ephemeral ports to whatever asks next. Observed: an intermittent
  `405 {"code":"MethodNotAllowed"}`, an envelope this API cannot produce.

  This is what the "notification timing flake" actually was. The dangerous
  half is the half that does not fail — a foreign server can also return a
  status a test accepts. The harness now binds once per spec file, and
  `createActor` reports the response body instead of a bare
  `expected 201, got 404`, which is the diagnostic whose absence kept this
  misfiled.

- `/meal-plans` reproduced the prerender landmine `/hamper` documents:
  `getBuyerCoords` swallows the error `cookies()` throws during a
  prerender, which hides the per-visitor signal from Next and leaves the
  route statically eligible — so the build fetched the catalogue at build
  time and failed when the API wasn't up. `force-dynamic`, like its
  siblings.
- **`GET /categories` never returned `group` or `sortOrder`**, so the
  seller listing form's craft category picker was permanently **empty** —
  a HomeKrafter could pick "Handcrafted gift" and then had nothing to file
  it under. The client resolves an absent `group` to `food`, which made
  every category look like a food one. Found by exercising the write path
  on production, not by reading the code: a column with no reader is the
  same bug as a column with no writer, and this milestone shipped one of
  each. Category listing now also honours `sortOrder`, which the schema
  already documented as driving the home page tiles and which nothing
  ordered by.
- `StatusPill` knew none of the corporate or quote statuses, so a sent
  quote and an expired one rendered identically. Added, plus a `tone`
  override for the one real collision: an accepted *snack order* is still
  in progress (gold), while an accepted *quote* is the outcome the whole
  funnel exists for (success).
- The generated corporate migration would have failed on production —
  `ADD COLUMN "updatedAt" NOT NULL` with no default against a table that
  already holds rows. Backfilled from `createdAt`.
- `mapProduct` never returned `isSnack`, so the seller's edit form read the
  "also list this on my snacks menu" checkbox as unticked on a listing that
  was already on the menu — and saving would quietly have taken it off.
  Caught by the new e2e, not by reading the code.
- Dropped `Product.isSubscribable`, added two commits earlier. Nothing read
  or wrote it, and `MealPlan.productId` already records that a listing is
  sold on subscription **and which plan** — so it was a second, weaker
  source of truth for one fact.
- `mapMealPlan` sent `mealType: null` while every sibling optional field on
  it sent `undefined`, so the field arrived as an explicit `null` the
  client type didn't declare. `?? undefined`, and it drops out of the JSON
  like the rest.

## [M19] — The wallet stops minting money, and the apply form gets honest — 2026-08-04

Planned as "trim the apply form, hide laundry, add corporate ordering,
build food subscriptions." A full plan review (two independent reviewers
per phase, run without sight of each other) rejected the subscription
premise on every dimension it measured, and found two money problems
underneath it. Subscriptions are **held**, not cancelled — the plan and
its unhold conditions are recorded. This entry is the first slice: the
money bug, and the silent-failure class the review kept finding next to it.

### Fixed

- **Auto top-up credited real spendable balance that nobody paid for.**
  `WalletService#maybeFireAutoTopupTx` posted a `credit`/`topup` ledger
  entry for `AutoTopupRule.topupAmount` after any debit that dropped a
  wallet below its threshold — with **no Razorpay charge and no captured
  payment behind it**. `PUT /wallet/auto-topup` is owner-scoped and its
  DTO capped nothing, so any signed-in shopper could set a large
  `topupAmount`, spend once, and mint balance that buys real food from
  real home kitchens who then draw real payouts against it.

  Auto-top-up now credits nothing and logs when a rule would have fired;
  `setAutoTopup` refuses `enabled: true` with a 400 (turning an existing
  rule *off* still works); both amounts are capped at ₹25,000 so a
  re-enabled rule can never be unbounded. Re-enabling means wiring a real
  recurring mandate first.

  The bug survived review because `wallet.controller.ts`'s own doc comment
  asserted that admin `adjust` was the only ungated credit path. It wasn't.
  That comment now says so, at length — a comment asserting an invariant
  the code does not hold is worse than no comment.

  `scripts/audit-uncollected-topups.sql` finds what already exists.
  The legitimate path always sets `refId`; this one never did, so
  `category = 'topup' AND refId IS NULL` is exactly the uncollected set.

- **Three forms swallowed every failure.** `SellerApplicationClient`,
  `CorporateInquiryClient` and admin `SellersClient` all ran their submit
  or approve through `try/finally` (or a bare `await`) with no `catch`.
  A failed request re-enabled the button and told the user nothing.
  `POST /seller-applications` is throttled at 5/60s, so the real sequence
  was: submit fails silently, click again, hit the throttle, still
  nothing, leave. On `/corporate` that is a five-figure lead disappearing.
  All three now catch, and render the message in an `aria-live` region.

### Added

- **The apply form matches what Homekrafted actually sells.** "Home chef
  (food)" is now the first category and the default selection; the laundry
  and cleaning chips are gone. The delivery-distance question moved behind
  an optional disclosure — a cook who wants to serve two sectors is the
  only person who knows that, and the old mandatory dropdown quietly
  committed everyone to 10 km.

- **Somebody outside the tricity can finally apply.** The area picker gains
  "Somewhere else" plus a free-text locality, and the application is filed
  as a **waitlist** entry that says so on the confirmation screen — rather
  than promising a decision the system has already decided not to make.
  `PATCH /admin/sellers/applications/:id/area` is how an admin resolves one;
  without it the waitlist would be a dead end.

### Fixed

- **Approval planted every unresolvable area at Chandigarh's centre.**
  `approveApplication` fell back to `TRICITY_CENTRE` whenever `areaById()`
  missed, so an out-of-area kitchen sorted ~0 km from every buyer and passed
  every delivery-radius filter. The fallback is gone; approval now refuses,
  naming the place. The guard is on **resolvability**, not on the literal
  `"other"` — legacy rows and typos went down the same path. The mock in
  `client/lib/api/admin.ts` carried an identical fallback and got the same
  guard, because a mock that behaves differently teaches the wrong thing.

- **Making the radius optional was a no-op without a migration.**
  `deliveryRadiusKm` was `Int NOT NULL DEFAULT 10`, so
  `deliveryRadiusKm || defaultRadiusKm` always saw a truthy 10 and
  `PlatformSetting.defaultDeliveryRadiusKm` was unreachable. The column is
  now nullable with no default; existing rows keep their stored answer.

- **`vendorTypeForCategory` was a cast, not a map.**
  `category as unknown as VendorType` compiled fine with `home_chef` added
  and would have thrown a Prisma invalid-enum error at `vendor.create`
  **inside the approval transaction** — an admin clicking approve gets a
  500. It is now an exhaustive `Record`, so the next category added fails
  to compile instead.

### Changed

- `GET`/`PUT /wallet/auto-topup` return `active: false` and
  `unavailableReason`. `server/` is shared with the native apps, so a
  client that only read `enabled` would tell people the feature works.
  Branch on `active`.
- The `/wallet` auto-top-up editor is now a **paused status card** showing
  any saved rule read-only. Not a disabled toggle under a promise that is
  now false, and not hidden — the people who most need the notice are
  exactly those who configured a rule.
- The mock wallet (`NEXT_PUBLIC_USE_MOCK=true`) no longer credits
  auto-top-up either. A mock that still minted balance would show a
  different wallet than real users get, which is how this stayed invisible.

### Documented

- `docs/LAUNCH-READINESS.md` §0.0 — the production audit, with the query
  and the rule that clawbacks go through `POST /wallet/adjust`, never a
  ledger deletion.
- `docs/LAUNCH-READINESS.md` §3b — **the platform collects no
  commission.** `commissionPct` is modelled on the admin dashboard and
  never deducted; `Payout.amount` is gross. A hard gate on anything
  recurring, since a daily subscription multiplies a per-order loss.
- Corrected `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/PRD.md` and
  `docs/DESIGN-SYSTEM.md`, which all still described auto-top-up as a
  working feature.

### Removed

- **Laundry, Cleaning & Ironing is withdrawn from the web.** Nav, footer,
  home page, sitemap, OG copy, the reels rail, the admin type filter and
  the seller nav no longer reach it; `/laundry` returns a real 404 and
  `POST /laundry/bookings` and `/laundry/subscriptions` return **410
  Gone**. Doing only one half would have been the worst option available:
  404ing the seller's pickup screen while bookings stayed creatable would
  produce orders no HomeKrafter could ever see.

  The models, `LaundryModule` and the order-history merge all stay, so a
  customer who booked a pickup last month still finds it in
  `/account/orders`. Hiding a service must not erase what people already
  paid for, and bringing it back is a revert rather than a rebuild.
  `ChannelRule` gains `enabled`, read through `isChannelEnabled`.

  The home page's "One home, three crafts" band was **two** `1fr 1fr`
  grids, not one, so deleting the laundry card would have left a single
  card beside a hole for every visitor. Rebuilt as one grid of the two
  remaining crafts with the app panel spanning underneath.

### Added

- **Meal subscriptions — the recurring product the platform did not
  have.** `MealPlan` → `MealSubscription` → `MealDelivery`, with
  30-minute delivery brackets, pause, resume, per-day skip and cancel.
  This replaces `LaundrySubscription`, which had no management surface,
  no pause/skip/resume and no generation job: it recorded intent and
  produced nothing.

  **A cycle is prepaid, in one wallet debit, and nothing charges in the
  background.** That is not a simplification — there is no saved card and
  no recurring mandate, and this is the same milestone that opened by
  deleting a path which credited wallet balance nobody paid for. A daily
  auto-charge on that footing would be the identical mistake pointed the
  other way. It also avoids the worst failure a daily-food product can
  have: "lunch didn't arrive because you were ₹20 short." When UPI
  AutoPay is wired, `amountPaid` + `mealsRemaining` is the seam.

  The rules that carry the design, each with a test:

  - The debit is posted **last, inside the same transaction** as the
    subscription and its deliveries, so an insufficient balance rolls all
    of it back. Nobody ever holds a schedule they did not pay for.
  - `pricePerMeal` is **snapshotted at subscribe time**. A kitchen raising
    its price cannot change what somebody already agreed to pay.
  - **A skipped meal is owed, not lost** — the cycle grows a day at the
    far end. Paid for 24 meals, get 24 meals.
  - **Cancelling moves no money.** Same rule M15 set for returns: an
    automatic refund makes the most abusable path the most frictionless,
    and the loss lands on a home cook who already bought the ingredients.
  - `MealPlan.maxSubscribers` is the **first capacity ceiling the platform
    actually enforces**. `VendorProfile.capacityPerDay` has existed since
    M16 and is read in sixteen places, none of them the order path. This
    one is counted inside the subscribe transaction, so two simultaneous
    buyers cannot both take the last seat.
  - A **paused** subscription keeps its seat; a **cancelled** one gives it
    back. Somebody away for a week has not given up their tiffin.
  - `meal-brackets.ts` never reads the clock, so a Server Component can
    compute a window once and ship it as text — the M12 React #418 lesson.

### Fixed

- **The notification e2e was flaky, and got flakier.** Delivery is
  fire-and-forget by design, so a test could end with an `INSERT` into
  `Notification` still in flight; `resetDatabase` then truncated
  underneath it and the *next* test polled forever for a row that had been
  written and destroyed. Raising the poll deadline cannot fix that case —
  the row is gone, not late — so the spec now drains before each reset.
  Adding one more spec file was enough to expose it, on a different test
  each run.

## [M18] — Hampers as listings, order notifications, password reset — 2026-08-03

Two product changes and one long-standing gap. The gap is the one that
had been "done" the longest: the notification fan-out has existed since
M9 and the order lifecycle never called it, so a buyer heard nothing
after checkout and a HomeKrafter got an in-app row they'd only see by
opening the portal.

### Changed

- **A gift hamper is now a listing, not something a buyer assembles.**
  The three-step builder (pick a box tier, fill it from the whole
  catalogue) is gone. `Product.isHamper` marks a listing a HomeKrafter
  assembles and prices themselves, and `/hamper` is the catalogue
  filtered on it. Two reasons: the person who knows what travels well
  together and what's in season is the one making it, not the buyer
  guessing; and a hamper is now an ordinary `Product`, so it inherits
  reviews, availability, distance filtering, cart, checkout and search
  instead of needing its own version of each.

  The flag is a *listing attribute*, deliberately not a `Category` — a
  hamper is still a sweets or pickles hamper, and overloading the browse
  taxonomy would force a false choice. It stays visible in `/shop` and
  search: hiding it there would cost the kitchen sales for ticking a box.
  Existing listings in the "Hampers" category are backfilled, so the page
  isn't empty on deploy and nobody re-ticks anything.

  `Hamper`, `HamperItem`, `HamperBox` and `POST /cart/hamper-items` are
  **not** dropped — pre-M18 orders reference them and a customer's order
  history has to keep rendering. Nothing new should build on them.
- **Transactional notifications default to WhatsApp on.** In-app-only was
  honest while nothing could send; it is wrong now. Order, laundry,
  snacks, wallet and account default to WhatsApp + email + in-app;
  `promo` stays in-app only, because opting somebody into marketing on
  WhatsApp is how a sender gets blocked — and a block is per-sender, so
  one promo would cost every future order update to that person. SMS
  stays off outside OTP: it duplicates WhatsApp at a per-message cost.
  The migration only touches rows still at the exact old default, so
  nobody who muted themselves gets un-muted.
- **The runtime feature-flag mechanism (M17) went with its only flag.**
  `hamperBuilderEnabled` gated the builder; with the builder gone it was
  dead config in the DB, the admin panel and the client. `lib/features/`,
  `FeaturesProvider` and the root layout's per-render settings fetch are
  removed with it. `GET /settings/public` and `PUBLIC_SETTING_KEYS` stay
  — an empty allowlist is still the seam a future public setting goes
  through, and its tests were rewritten rather than deleted.

### Added

- **Order notifications, both directions (`OrderNotificationsService`).**
  Every path that writes `Order.status` — buyer checkout, HomeKrafter
  advance, admin override, wallet capture, Razorpay webhook, cancellation
  — now messages the buyer, and a new order or a cancellation messages
  each HomeKrafter in it (once per kitchen, not per line, with the items
  named so they can start without opening anything). Fire-and-forget
  throughout: a paid order must never roll back because a message failed.
- **Password reset (L2 of `docs/LAUNCH-READINESS.md` §2).** There was no
  way back into an account whose password was lost. `POST
  /auth/password/forgot` and `/auth/password/reset`, plus
  `/forgot-password` and `/reset-password`. The token is 32 random bytes
  stored SHA-256-hashed, single-use, one-hour expiry; requesting a second
  link kills the first; a reset revokes every session and adds `email` to
  `authProviders` — which is how an approved HomeKrafter with no password
  gains one. Forgot **always answers the same**, so the endpoint can't be
  used as an account-existence oracle.
- **A scoped OTP test code.** `OTP_TEST_CODE` verifies without an SMS,
  but only for a number in `OTP_TEST_PHONES` and never for an admin.
  Phone OTP creates an account for an unrecognised number, so an
  unscoped fixed code would be a complete authentication bypass rather
  than a testing shortcut — the scoping *is* the feature. Proven by
  mutation: deleting the allowlist check fails exactly one test.

### Operations and policy

- **Database backups (`scripts/backup-db.sh --install`).** There were
  none. Nightly `pg_dump -Fc`, 14 kept, each one verified with
  `pg_restore -l` immediately after writing and deleted if it doesn't
  read back — a backup nobody has read is a guess. `--restore-drill`
  restores the newest dump into a throwaway database and prints row
  counts. Still local-disk only: this covers a bad migration and a
  dropped table, not losing the box.
- **Uptime checks (`scripts/healthcheck.sh --install`).** `/health` and
  `/health/db` had existed since M8 with nothing looking at them. Every
  five minutes, plus the web process and the public HTTPS URL; three
  consecutive failures restarts the affected pm2 process, because one
  failure is a blip and restarting on it turns a hiccup into an outage. A
  failing `/health/db` is reported but never restarts anything — if
  Postgres is down, bouncing the API destroys the evidence.
- **Log rotation** documented (`pm2-logrotate`). pm2 logs filling the
  disk looks exactly like an application failure.
- **Policy pages** — `/terms`, `/privacy`, `/refunds`, `/contact`, in the
  footer of every page and in the sitemap. Razorpay won't activate a live
  account without a published refund policy and a reachable contact.
  Written from what the code enforces, not from a template: the
  cancellation cut-off, the seven-day return window and the wallet-first
  refund on those pages are the rules the server actually applies. While
  `lib/legal.ts` holds placeholders for the registered name and address,
  every page carries a banner saying so — a policy with an invented
  address looks compliant while being false. **They have not been
  reviewed by a lawyer.**

### Tests

- 240 e2e tests (was 189), 88 + 88 unit. New specs: `otp-bypass`,
  `password-reset`, `hamper-listings`, `order-notifications`.
- `resetDatabase` now retries on deadlock. Fire-and-forget notification
  writes outlive the request that triggered them, and `TRUNCATE CASCADE`
  in the next test's setup deadlocked against them. Retrying is right;
  making delivery synchronous to suit the tests would not be.

## [M17] — Tests, CI and runtime feature flags — 2026-08-02

Phase 2 left two items open. This closes both — and the first one
immediately earned its keep by finding a real bug in code that had been
shipped, reviewed and manually verified.

### Added

- **A test suite, in three layers (L4).** 365 tests. `client/lib/**` unit
  tests for the pure modules that decide what the app may do (the
  scheduler, the channel matrix, occasion grouping, geo, formatting,
  SEO); `server/test/unit/` for CSV escaping, the trust model,
  availability defaulting and settings parsing; and `server/test/e2e/` —
  **a real Nest app against a real Postgres, no mocks** — for everything
  expressed as a query. Prisma is never mocked in the e2e layer: a
  mocked one would let a scoping test pass while the query said
  something else entirely. See `docs/TESTS.md`.
- **CI (`.github/workflows/ci.yml`).** Typecheck, lint, unit, e2e (with a
  Postgres service) and both builds, on every push and PR. `migrate
  deploy` against an empty database is part of it, so a broken migration
  lineage fails here rather than during a deploy.
- **Cross-package parity test (L1).** `client/lib/geo.ts` and
  `server/src/common/geo.ts` each carry a copy of the tricity area table
  because the packages have no shared build. CLAUDE.md has always said
  they must stay identical and nothing checked. A drift of 0.0001° — 11
  metres — now fails the build. Verified by mutation.
- **Runtime feature flags (the open half of M5).** `GET /settings/public`
  serves an allowlisted subset of platform settings, and `lib/features/`
  threads it from the root layout to every reader — the `/hamper` route
  gate and all four client components resolve one value, so a flip can
  no longer open the route while the buttons still say "coming soon".
  An admin flips it on `/admin/settings`.

### Fixed

- **An approved HomeKrafter could not log in at all.** Approving an
  application mints an account with **no password** — deliberate, since
  an admin should never set someone's — reachable by phone OTP
  (`authProviders: ['phone']`). But the HomeKrafter sign-in tab offered
  only email and password, so `POST /auth/login` answered "Incorrect
  email or password" for a password that had never existed, and there was
  no other door. Every kitchen onboarded through the real application
  flow was locked out of the product it had just been approved for. The
  tab now leads with Phone; the email path no longer falls through to
  account creation, and a 401 there says to use the phone tab.
- **Every real HomeKrafter was shown another kitchen's identity.** The
  portal resolved the signed-in seller by looking the session user up in
  the **mock** `lib/data/sellers.ts` list; a real kitchen is never in it,
  so the miss fell through to a demo record. A genuine HomeKrafter saw a
  seeded demo kitchen's name in the header and its `vendorId` behind
  their storefront links. Added `GET /seller/me` — which had no
  equivalent before — and the client now reads its own record from the
  session, keyed by user id so it cannot survive into another account.
- **`/admin/login` ignored the credentials it was given.** The handler
  called `signInAsAdmin()` and discarded the typed email and password, so
  any email plus any four characters authenticated as the seeded admin.
  The page is publicly routable, so this was full administrative access —
  settling payouts, granting verification badges, suspending users — to
  anyone who found the URL. It now performs a real `POST /auth/login` and
  verifies the returned role, signing a non-admin straight back out.
- **The seeded admin's credentials shipped in the public JS bundle.**
  `AuthContext` is a `"use client"` module and held the demo emails and
  the shared seed password as constants, so `admin@homekrafted.example`
  and its password were readable with view-source on the live site, where
  that account exists. Removed, along with the `signInDemo` /
  `signInAsSeller` / `signInAsAdmin` helpers and every "continue as
  demo ___" button. The seeded accounts still exist and are still how the
  site is tested — their credentials live in `docs/TESTING.md` and a
  tester types them into the ordinary form.
- **`"false"` evaluated as `true` on every boolean field in the API.**
  The global `ValidationPipe` runs with `enableImplicitConversion`
  (query DTOs need it so `?days=30` is a number); for a `Boolean` field
  that conversion is `Boolean(value)`, and `Boolean('false')` is `true`.
  Every non-empty string therefore set a flag to **true** and returned
  200 — including `PATCH /admin/sellers/:id/verification`, where
  `{"fssaiVerified": "false", "identityVerified": "no"}` **granted both
  badges**. It reached 24 fields across 18 DTOs: wallet auto-top-up,
  review moderation, user suspension, and a HomeKrafter's "am I making
  this today" switch. In every one of them it failed in the *enabling*
  direction, and `"false"` is exactly what an HTML form field or a
  hand-written `curl` sends. Fixed with `@BooleanField()`, now the only
  correct way to declare a boolean request field: it reads the raw value
  before conversion, accepts the four unambiguous spellings, and 400s
  anything else rather than guessing at `"yes"`.
- **Site revalidation dropped from an hour to a minute.** A route's
  `revalidate` caps how fresh it can be, whatever the underlying fetch
  says — so `/` and `/collections` at 3600s would have kept saying
  "coming soon" for up to an hour after the flag opened `/hamper`. The
  interval now follows the fastest-moving thing on the page.

### Changed

- `lib/features.ts` became `lib/features/` — `index.ts` (types and the
  held-by-default fallback), `server.ts` (`getFeatures()` for Server
  Components), `FeaturesContext.tsx` (`useFeatures()` for client ones).
  The flags are runtime values now, not build-time constants.
- The admin settings screen's "not here on purpose" note is gone,
  replaced by the toggle it was explaining.

### Notes

- **Every flag fails closed.** The default, the fallback when the
  settings endpoint is unreachable, and the parse of any stored value
  that isn't exactly `'true'` all resolve to *held*. A flag that fails
  open is a flag that ships itself during an outage.
- **`GET /settings/public` is an allowlist, not a denylist.** A new
  setting is private until it is named in `PUBLIC_SETTING_KEYS`. The
  setting sitting next to the flag is the commission rate.
- **Still owed:** browser-level tests for the dialog focus traps
  (`MobileDrawer`, `LocationPrompt`) — jsdom would assert that markup
  looks like markup — and load testing.

## [M16] — Phase 2 — 2026-07-31

Phase 1 made trust *mechanically* possible: a review can be written, a
dispute can be answered, a HomeKrafter can be paid. But the profile that
trust attaches to was still a store page — a banner, a bio and a product
grid. Phase 2 starts there.

### Added

- **Rich HomeKrafter profiles (H5).** `VendorProfile` (1:1 with `Vendor`)
  and `VendorPhoto`: story, tagline, what they are known for, languages,
  working days and hours, preparation and response time, daily capacity,
  minimum order, hygiene and packaging notes, cancellation/return/custom
  order policies, FSSAI licence, social links, kitchen photos. The
  storefront now leads with the profile, because the question a buyer is
  answering on a home-kitchen page is not "which jar" but "do I want food
  from this person's house".
- **Verification, admin-only.** `PATCH /admin/sellers/:id/verification`
  sets identity / address / FSSAI. Expanded inline from the seller row,
  showing the submitted licence number, profile completeness and a link
  to the live storefront. Notifies the HomeKrafter with what was granted
  or withdrawn plus the admin's note, and audits the full before/after
  flag state.
- **Trust signals, computed.** A tier ("Trusted kitchen") plus every
  check behind it — the three verifications, review aggregate, delivered
  order count, tenure, cancellation rate — each with its real detail
  line, met and unmet. Derived achievement badges (`250+ orders`,
  `Top rated`, `2 years on Homekrafted`) alongside.
- **`/seller/profile`** with a completeness meter that names what is
  missing in plain words ("Your story", "Kitchen photos") rather than
  showing a percentage and stopping.

- **Occasion hub and gift guides (H8).** `/collections` is a real
  destination now: what is coming up, with a countdown; gift guides; and
  evergreen occasions listed separately. `Collection` became a first-class
  gift guide with its own page at `/guides/[slug]`, so a guide that
  belongs to no occasion ("If you have never ordered home-made before")
  finally has somewhere to live and something to link to. The home page
  gained a seasonal band, and its "Shop by occasion → View all" now goes
  to the hub instead of dumping you on `/shop`.
- **`/admin/collections/occasions`** — where festival dates get rolled
  forward, with taglines for the hub cards.
- **Seller analytics (H6).** `/seller/analytics` — earnings over time,
  busiest weekdays, what sells, repeat rate, and period-over-period
  deltas, across 7/30/90-day windows. The portal had eight screens and
  none of them answered "what is selling, and when".

- **Accessibility pass (M3).** A skip-to-content link (first in the tab
  order — a keyboard user previously tabbed through the announcement bar,
  the header and the whole nav on every page before reaching anything),
  a focusable `<main>` landmark for it to target, focus management on
  both modals, and one shared screen-reader-only utility replacing three
  copy-pasted local ones. Real alt text landed with H7.
- **Admin reports, exports and settings (M5).** A date range on
  analytics (was pinned at 14 days), CSV exports for orders,
  HomeKrafters and payouts, and a settings screen for the commission
  rate and default delivery radius — both previously constants in
  source, changeable only by shipping a build.
- **Pre-order follows the kitchen (M2).** Per-HomeKrafter prep time,
  weekly cooking days and specific days off with reasons, a 14-day
  horizon (up from 7), a "next available" line on the storefront, and
  closed days struck out on the picker instead of silently missing.
  `GET /vendors/:slug/availability` is public, because the picker runs
  before anyone signs in.
- **`next/image` everywhere (H7).** `ImageSlot` rendered a raw `<img>`,
  so a HomeKrafter's phone photo shipped at whatever resolution their
  camera produced, in the original format, to every buyer's phone.
  Now AVIF/WebP with a responsive srcset, per-call-site `sizes`, and
  `priority` on the two images that are actually an LCP. Measured on the
  home hero: **265 KB → 59 KB** at 640px, a 78% saving.
- **Real alt text.** `ImageSlot` used to put `role="img"` on the wrapper
  with the placeholder caption as its label and mark the real image
  `aria-hidden`, so every product photo announced its filename
  ("MANGO THOKKU — HERO"). The image now carries proper alt, and
  genuinely decorative art (storefront banner, category tile, guide
  cover) carries `alt=""` because the name is already the next thing in
  the DOM.
- **`/uploads/*` now works in local dev.** It is served by nginx in
  production and by nothing on :3000 in dev, so an uploaded photo used to
  404 locally and render in production — the worst way round for a bug to
  behave. A dev-only rewrite proxies it to the API.

### Caught in review

- **The closed mobile drawer was fully tabbable.** It slid off-screen
  with `translateX(100%)` and stayed in the tab order, so Tab on any page
  walked through the entire closed menu — and because the panel also
  carried `aria-hidden="true"`, focus could land on elements assistive
  tech had been told didn't exist, which is a violation in its own right.
  Fixed with `visibility: hidden`, delayed by the animation duration so
  the slide-out still plays.
- **Both modals claimed `aria-modal="true"` and did none of what that
  obliges.** Focus never moved in, Tab walked straight out into the page
  behind, and the location prompt ignored Escape. Both now move focus in,
  trap Tab at each end, and return focus to whatever opened them —
  landing back at the top of the document after closing a menu is how a
  keyboard user loses their place. Escape on the location prompt maps to
  "skip" rather than a silent close, because dismissing is a real answer
  there and it records that we asked.

### Decisions worth keeping

- **CSV exports neutralise spreadsheet formulas.** A cell beginning `=`,
  `+`, `-`, `@`, tab or CR is executed by Excel, Sheets and LibreOffice,
  so a HomeKrafter naming their shop `=cmd|'/c calc'!A1` would get it run
  on the machine of whoever opened the export. Every value passes through
  one escape function that quotes it and prefixes a leading formula
  character — applied at the single choke point, so it can't be forgotten
  per column.
- **The settings screen only holds settings something reads.** A screen
  full of knobs that change nothing is worse than no screen: it tells an
  admin their change took effect. `commissionPct` drives the analytics
  commission line and says on its face that it is modelling only;
  `defaultDeliveryRadiusKm` is read at seller approval.
- **Feature flags deliberately did not move into the database.** Four of
  `lib/features.ts`'s call sites are client components deciding button
  copy; only the route is the real gate. A DB flag would open the gate
  immediately and leave those four saying "coming soon" until the next
  deploy, and a half-open feature is worse than a closed one. Making them
  runtime-correct needs the flag threaded from the root layout through a
  context — its own change, logged as still open in the audit.

- **The rolling-day scheduler was extended, not replaced.**
  `getScheduleDays` gained an optional `availability` argument and every
  default reproduces the pre-M16 behaviour exactly — a caller with
  nothing to pass gets the same rolling week, the same 90-minute lead,
  the same expired-window handling.
- **Availability is three separate things and stays that way**: the
  weekly pattern, the exceptions to it, and how much notice is needed.
  A recurring blackout rule would collide with the weekly pattern and
  make "am I open on the 14th" answerable two ways.
- **Absence is never a closure.** No working days means open every day;
  no prep time means the platform's 90-minute default, not zero. A
  HomeKrafter who has filled in nothing must not silently stop taking
  orders — the rule location filtering has followed since M12.
- **Closed days are shown, not dropped.** Struck through, unpickable,
  with the reason in the accessible name rather than only a tooltip. A
  date that just isn't there reads as a bug; "closed for Diwali" is
  information.

- **A HomeKrafter's revenue is their line-item share, never the order
  total.** A marketplace order can span several kitchens, so crediting
  each with the whole basket would overstate what a home cook earns and
  disagree with what they are paid. (The admin GMV figure does use whole
  orders — deliberately, as a platform-wide proxy, and it says so.)
  Measured on the seed data: three orders totalling ₹2,404 are ₹2,086 of
  actual earnings for the kitchen involved, because one of them was
  shared with another vendor.
- **Ratios are `null`, not `0`, when there is nothing to divide by.** A
  percentage change from an empty previous period is a division by zero
  wearing a percent sign, and "0% repeat customers" reads as a verdict on
  a kitchen that has simply not had orders yet. The UI says "no earlier
  period" and "not enough orders yet" instead.
- **`images.remotePatterns` is deliberately empty.** Uploads and bundled
  assets are both same-origin, so nothing needs allowlisting. Widening it
  to `**` to make a CDN work later would be deciding, silently, that we
  trust any host to serve images into our own pages.
- **Snack orders contribute nothing to the cancellation rate.**
  `SnackOrderStatus` has no `cancelled` member — a WhatsApp order that
  falls through is a conversation, not a state transition — so counting
  them as successes would report a flattering rate we cannot observe.

- **A seller cannot verify themselves.** The flags are absent from
  `UpdateSellerProfileDto` entirely, so `forbidNonWhitelisted` rejects an
  attempt with a 400 rather than dropping it silently; the service also
  assembles its Prisma payload field-by-field instead of spreading the
  DTO, so a field added later cannot reach a column by accident. A badge
  a seller can award themselves is worth nothing to the buyer who is
  trusting it.
- **Changing the FSSAI number clears the verification.** Otherwise
  editing the thing being verified preserves the badge that verified it —
  the one route by which a seller could have set their own.
- **The licence number is never published.** A buyer needs the verified
  fact; the identifier belongs to the HomeKrafter. It is returned to
  them and to admins only.
- **Nothing derived is stored.** Trust, badges and completion are all
  computed on read, for the reason M15 recomputes rating aggregates
  rather than incrementing them: a stored score has no owner and quietly
  stops being true. `cancellationRate` is `null` rather than `0` before
  anything has closed — an unknown rate is not a perfect one.
- **The score is never shown to a buyer as a bare number.** "75/100" is
  not something a shopper can act on, and a number with no working shown
  is exactly the kind of platform-invented metric that stops meaning
  anything. The storefront shows the tier and the full signal list.
- **An empty profile renders as a shorter page, not an empty one.** Every
  section is conditional; a kitchen approved this morning is the normal
  case. The gaps are named in the portal, to the person who can fill
  them.
- **Festival dates are absolute, not recurrence rules.** Diwali, Raksha
  Bandhan and Karwa Chauth are lunisolar and land on a different
  Gregorian date every year, so "repeats yearly on 8 Nov" would be wrong
  for exactly the occasions the hub exists to sell into. A person rolls
  them forward. `null` means evergreen — a birthday has no season, and
  sorting one into a countdown invents an urgency it does not have.
- **The seasonal band is temporary by design.** It appears only when the
  nearest dated occasion is within six weeks. A band that is always on
  screen is furniture, and nobody reads furniture.
- **The countdown is computed once, on the server.** `lib/occasions.ts`
  takes `now` as a parameter and never reads the clock itself, so nothing
  recomputes "today" during hydration — the failure recorded from M12
  (React #418). `/` and `/collections` carry `revalidate = 3600` so a
  static prerender cannot freeze a countdown at build time.
- **Seed verification is deliberately partial** — one kitchen fully
  verified, one with a licence submitted and unchecked, eight with no
  profile at all — so "verified" still means something on a seeded
  database and all three states are testable.

### Migrations

- `20260731130000_m16_vendor_profile` — `VendorProfile`, `VendorPhoto`,
  `VendorPhotoKind`.
- `20260731140000_m16_occasion_season_and_guides` — `Occasion.celebratedOn`
  / `tagline` / `imageSrc`, `Collection.imageSrc` / `featured` /
  `sortOrder`.
- `20260801090000_m16_vendor_blackout_dates` — `VendorBlackoutDate`.
- `20260801100000_m16_platform_settings` — `PlatformSetting`.

## [M15] — Phase 1 production readiness — 2026-07-31

A full production audit (`docs/PRODUCTION-AUDIT.md`) found the build was
unusually disciplined for its stage and that its gaps were not sloppiness
but **loops built from one end and never joined at the other**. Five of
them blocked launch. This milestone closes all five, plus the two things
that made the marketplace unusable and unfindable.

### Added

- **Site search.** There was none — anywhere. `SearchField` existed as a
  primitive used only by the dev gallery and admin orders; the header's
  search pill was a `<Link href="/shop">`; no endpoint took a query. Now
  `q` on `GET /products`, `/vendors` and `/snacks` (AND across terms, OR
  across each entity's fields, so "mango pickle" narrows rather than
  widens), a `/search` route fanning out to all three in parallel, and a
  real form in the header and the mobile drawer.
- **Review submission.** `POST /reviews` had shipped in M8 with **no call
  site anywhere** — `lib/api/reviews.ts` said so in its own comment — so
  every rating on the site was seed data. Now a `<ReviewForm>` reachable
  from a delivered order and from the product page, `/account/reviews`
  with a "waiting for your review" list, and ratings that actually move.
- **Buyer cancellation and returns.** `RefundStatus.requested` had been
  in the enum since M8 with nothing able to reach it; a buyer whose order
  went wrong could only file a support ticket nobody read.
- **Admin payout settlement** (`/admin/payouts`). A HomeKrafter could
  request a payout from M8.3b onward and nothing could act on it —
  `pending` was terminal in practice. Money went in and had no way out.
- **Admin dispute queue** (`/admin/support`). Tickets had been written
  since M7b and read by nothing. `SupportService.addMessage` even carried
  a comment reserving `sender: "agent"` for a surface that was never
  built. Customers can now see and reply to their own tickets too —
  `getSupportTickets` had had no call site either.
- **Reorder** (`POST /orders/:id/reorder`), which `/app-promo` had been
  advertising as an app feature the web didn't have.
- **Real follows.** `FollowButton` was `useState` with a comment
  admitting "no persistence yet"; `VendorFollow` had sat in the schema
  since M8.1 with no endpoint. Adds the endpoints, `/account/following`,
  and a follower count counted from the rows.
- **Error, 404 and loading boundaries** on all three surfaces. The app
  had none: `notFound()` landed on Next's unstyled default and any thrown
  render error whited out the document.
- **SEO.** Two of ~65 routes exported metadata. Adds `metadataBase`, a
  title template, per-route metadata and canonicals, `sitemap.ts` built
  from the live catalogue, `robots.ts`, and JSON-LD (Product with Offer,
  LocalBusiness per storefront, Organization + WebSite with a
  SearchAction).

### Changed

- **A review now requires a delivered order.** The old rule was "anyone
  signed in", with `verifiedPurchase` recorded as a decorative badge. An
  open review endpoint on a platform built on trusting a stranger's home
  kitchen is a review-bombing surface aimed at whichever HomeKrafter has
  three reviews. Delivered rather than merely not-cancelled: a review
  written while the parcel is still in the kitchen reviews the checkout.
- **Ratings and follower counts are recomputed from rows, never
  incremented** (`ReviewAggregatesService`) — and admin review moderation
  calls the same recompute, because a hide that leaves the average
  untouched is a moderator's action silently not applying.
- **`Order` gains `deliveredAt`**, stamped at both places an order
  actually reaches `delivered`. The return window counts from it rather
  than `placedAt`, which on a made-to-order item can be a week earlier.
- **The seed stopped inventing follower counts.** 612 followers with zero
  `VendorFollow` rows behind them was harmless only while nothing could
  follow.
- **A customer replying to a `resolved` ticket reopens it** — otherwise
  "that didn't actually fix it" lands in a bucket the queue treats as
  done.
- `/cart` split into a server wrapper plus `CartPageClient`, since a
  `"use client"` route file can't export `metadata`.

- **Occasion hub and gift guides (H8).** `/collections` is a real
  destination now: what is coming up, with a countdown; gift guides; and
  evergreen occasions listed separately. `Collection` became a first-class
  gift guide with its own page at `/guides/[slug]`, so a guide that
  belongs to no occasion ("If you have never ordered home-made before")
  finally has somewhere to live and something to link to. The home page
  gained a seasonal band, and its "Shop by occasion → View all" now goes
  to the hub instead of dumping you on `/shop`.
- **`/admin/collections/occasions`** — where festival dates get rolled
  forward, with taglines for the hub cards.
- **Seller analytics (H6).** `/seller/analytics` — earnings over time,
  busiest weekdays, what sells, repeat rate, and period-over-period
  deltas, across 7/30/90-day windows. The portal had eight screens and
  none of them answered "what is selling, and when".

- **Accessibility pass (M3).** A skip-to-content link (first in the tab
  order — a keyboard user previously tabbed through the announcement bar,
  the header and the whole nav on every page before reaching anything),
  a focusable `<main>` landmark for it to target, focus management on
  both modals, and one shared screen-reader-only utility replacing three
  copy-pasted local ones. Real alt text landed with H7.
- **Admin reports, exports and settings (M5).** A date range on
  analytics (was pinned at 14 days), CSV exports for orders,
  HomeKrafters and payouts, and a settings screen for the commission
  rate and default delivery radius — both previously constants in
  source, changeable only by shipping a build.
- **Pre-order follows the kitchen (M2).** Per-HomeKrafter prep time,
  weekly cooking days and specific days off with reasons, a 14-day
  horizon (up from 7), a "next available" line on the storefront, and
  closed days struck out on the picker instead of silently missing.
  `GET /vendors/:slug/availability` is public, because the picker runs
  before anyone signs in.
- **`next/image` everywhere (H7).** `ImageSlot` rendered a raw `<img>`,
  so a HomeKrafter's phone photo shipped at whatever resolution their
  camera produced, in the original format, to every buyer's phone.
  Now AVIF/WebP with a responsive srcset, per-call-site `sizes`, and
  `priority` on the two images that are actually an LCP. Measured on the
  home hero: **265 KB → 59 KB** at 640px, a 78% saving.
- **Real alt text.** `ImageSlot` used to put `role="img"` on the wrapper
  with the placeholder caption as its label and mark the real image
  `aria-hidden`, so every product photo announced its filename
  ("MANGO THOKKU — HERO"). The image now carries proper alt, and
  genuinely decorative art (storefront banner, category tile, guide
  cover) carries `alt=""` because the name is already the next thing in
  the DOM.
- **`/uploads/*` now works in local dev.** It is served by nginx in
  production and by nothing on :3000 in dev, so an uploaded photo used to
  404 locally and render in production — the worst way round for a bug to
  behave. A dev-only rewrite proxies it to the API.

### Caught in review

- **The closed mobile drawer was fully tabbable.** It slid off-screen
  with `translateX(100%)` and stayed in the tab order, so Tab on any page
  walked through the entire closed menu — and because the panel also
  carried `aria-hidden="true"`, focus could land on elements assistive
  tech had been told didn't exist, which is a violation in its own right.
  Fixed with `visibility: hidden`, delayed by the animation duration so
  the slide-out still plays.
- **Both modals claimed `aria-modal="true"` and did none of what that
  obliges.** Focus never moved in, Tab walked straight out into the page
  behind, and the location prompt ignored Escape. Both now move focus in,
  trap Tab at each end, and return focus to whatever opened them —
  landing back at the top of the document after closing a menu is how a
  keyboard user loses their place. Escape on the location prompt maps to
  "skip" rather than a silent close, because dismissing is a real answer
  there and it records that we asked.

### Decisions worth keeping

- **CSV exports neutralise spreadsheet formulas.** A cell beginning `=`,
  `+`, `-`, `@`, tab or CR is executed by Excel, Sheets and LibreOffice,
  so a HomeKrafter naming their shop `=cmd|'/c calc'!A1` would get it run
  on the machine of whoever opened the export. Every value passes through
  one escape function that quotes it and prefixes a leading formula
  character — applied at the single choke point, so it can't be forgotten
  per column.
- **The settings screen only holds settings something reads.** A screen
  full of knobs that change nothing is worse than no screen: it tells an
  admin their change took effect. `commissionPct` drives the analytics
  commission line and says on its face that it is modelling only;
  `defaultDeliveryRadiusKm` is read at seller approval.
- **Feature flags deliberately did not move into the database.** Four of
  `lib/features.ts`'s call sites are client components deciding button
  copy; only the route is the real gate. A DB flag would open the gate
  immediately and leave those four saying "coming soon" until the next
  deploy, and a half-open feature is worse than a closed one. Making them
  runtime-correct needs the flag threaded from the root layout through a
  context — its own change, logged as still open in the audit.

- **The rolling-day scheduler was extended, not replaced.**
  `getScheduleDays` gained an optional `availability` argument and every
  default reproduces the pre-M16 behaviour exactly — a caller with
  nothing to pass gets the same rolling week, the same 90-minute lead,
  the same expired-window handling.
- **Availability is three separate things and stays that way**: the
  weekly pattern, the exceptions to it, and how much notice is needed.
  A recurring blackout rule would collide with the weekly pattern and
  make "am I open on the 14th" answerable two ways.
- **Absence is never a closure.** No working days means open every day;
  no prep time means the platform's 90-minute default, not zero. A
  HomeKrafter who has filled in nothing must not silently stop taking
  orders — the rule location filtering has followed since M12.
- **Closed days are shown, not dropped.** Struck through, unpickable,
  with the reason in the accessible name rather than only a tooltip. A
  date that just isn't there reads as a bug; "closed for Diwali" is
  information.

- **A HomeKrafter's revenue is their line-item share, never the order
  total.** A marketplace order can span several kitchens, so crediting
  each with the whole basket would overstate what a home cook earns and
  disagree with what they are paid. (The admin GMV figure does use whole
  orders — deliberately, as a platform-wide proxy, and it says so.)
  Measured on the seed data: three orders totalling ₹2,404 are ₹2,086 of
  actual earnings for the kitchen involved, because one of them was
  shared with another vendor.
- **Ratios are `null`, not `0`, when there is nothing to divide by.** A
  percentage change from an empty previous period is a division by zero
  wearing a percent sign, and "0% repeat customers" reads as a verdict on
  a kitchen that has simply not had orders yet. The UI says "no earlier
  period" and "not enough orders yet" instead.
- **`images.remotePatterns` is deliberately empty.** Uploads and bundled
  assets are both same-origin, so nothing needs allowlisting. Widening it
  to `**` to make a CDN work later would be deciding, silently, that we
  trust any host to serve images into our own pages.
- **Snack orders contribute nothing to the cancellation rate.**
  `SnackOrderStatus` has no `cancelled` member — a WhatsApp order that
  falls through is a conversation, not a state transition — so counting
  them as successes would report a flattering rate we cannot observe.

- **A return request moves no money.** Whether a homemade jar that
  "tasted off" earns a refund is a judgement call, and auto-refunding
  would make the platform's most abusable path also its most
  frictionless one — with the loss landing on a home cook. An admin
  resolves it.
- **Cancellation closes at `packed`.** Once a home cook has cooked and
  boxed it, the cost of a cancellation is theirs, not a warehouse's.
- **"Mark paid" records a settlement, it does not perform one.** There is
  no payout-provider integration; an admin transfers out of band and
  stores the bank reference, which is the only link between the row and a
  real transfer. Implying otherwise would be worse than an honest ledger.
- **Reorder reports what it skipped, by name.** A home kitchen's
  catalogue moves between one order and the next; a reorder that silently
  drops half an order is the failure worth designing against.
- **No `GET /search` endpoint.** The client fans out to the three list
  endpoints, reusing each one's visibility rules — moderation status,
  availability, delivery radius — rather than keeping a fourth copy of
  "what may a buyer see".

### Migrations

- `20260731090000_m15_review_unique_per_target` — one review per person
  per target (dedupes first, so it can't fail on the one database that
  has the problem).
- `20260731100000_m15_order_cancel_and_return` — `refundReason`,
  `refundRequestedAt`, `cancelledAt`, `deliveredAt`.
- `20260731110000_m15_admin_payout_settlement` — `PayoutStatus.rejected`
  plus `reference`, `note`, `decidedById`, `decidedAt`.

### Caught in review

- **A soft-404 regression, introduced and removed inside this
  milestone.** The first pass added an app-wide `app/loading.tsx`. A
  `loading.tsx` is a Suspense boundary, and a dynamic route behind one
  starts streaming its response — status line included — before the page
  body runs, so a later `notFound()` can no longer set 404: `/product/nope`
  and `/storefront/nope` began returning **200 with the 404 page**. On a
  catalogue site in the same milestone that added a sitemap, that is
  about the worst thing to hand a crawler. Verified by measurement in a
  production build, not by reading docs. Loading boundaries now live only
  on routes that never call `notFound()` (`/shop`, `/search`, `/snacks`)
  plus the two dashboard groups, whose paths `robots.ts` disallows
  anyway. Rule recorded in `CLAUDE.md`.

### Known gaps

- Seeded products carry decorative `rating`/`reviewCount` that don't
  match their few seeded review rows, so the first real review snaps a
  product to its true average. Recorded rather than back-filled —
  back-filling would drop most demo products to a handful of reviews.
- Phases 2–4 of `docs/PRODUCTION-AUDIT.md` are untouched: rich
  HomeKrafter profiles, the occasion hub, seller analytics, the
  pre-order calendar, `next/image`, subscriptions, admin reports.

## [M14] — Real image uploads — 2026-07-30

Every image field in the app was a text input asking a home cook to type a
path at a file they had no way to put on the server. They upload now.

### Added

- **`POST /uploads?purpose=…`** (`server/src/uploads/`) — multipart, behind
  the global `JwtAuthGuard`. Not role-gated: buyers upload dry-clean photos
  as well as HomeKrafters uploading product shots, so authorization is "a
  valid session", and `purpose` plus the caller's own id decide the folder.
- **`StorageDriver` seam** — local disk today, cloud later as a config
  change rather than a rewrite. What gets persisted is the URL the driver
  returned, not a driver-specific key, so rows written to disk keep
  resolving alongside rows written by a future bucket driver. An
  unrecognised `STORAGE_DRIVER` throws at boot instead of falling back.
- **`ImageUpload`** (single value) and a rebuilt **`PhotoUpload`** (lists).
  Drag, click and paste all reach the same handler — drop suits a desktop,
  the file picker is the only one that works on a phone, paste catches the
  screenshot workflow. Real progress, because uploads go through
  `XMLHttpRequest`: `fetch` cannot report upload progress, and multipart
  needs the browser to set its own boundary header.
- Wired into product listings, the snack menu, storefront avatar + banner,
  the dry-clean booking, and the dev gallery.

### Security

- **Accepted type comes from sniffing the leading bytes**, never the
  multipart `Content-Type` or the filename — both are caller-supplied. A
  file stored as `.jpg` and served back from our own origin as HTML is
  stored XSS, not a cosmetic bug. SVG is rejected for the same reason: it
  is XML that can carry script.
- **Stored filenames are UUIDs.** A client filename is a path-traversal and
  collision vector and is worth nothing for an image.
- Multer buffers in memory with a hard cap above the configurable limit, so
  an oversized body is cut off by the parser while the real limit stays in
  the service where it cannot be bypassed.
- nginx serves `/uploads/` with `X-Content-Type-Options: nosniff` and a
  sandboxing CSP, from a directory outside the git clone.

### Fixed

- Five comments under `server/src/seller/*` still described the per-type
  `403`s that M12 deleted ("Maker-only", "Branches by `seller.type`").

### Known gap

- Nothing reclaims disk yet: replacing a photo leaves the old file behind,
  since the row only ever held the new URL. The endpoint returns a `key`
  specifically so a caller can delete later. Recorded in `docs/DEPLOY.md`.

## [M13] — Brand identity, /about, live on homekrafted.in — 2026-07-30

The app moves off the bare IP onto its real domain, picks up the supplied
brand lockup, and gains the story page carried over from the marketing
site it replaces.

### Added

- **Brand lockup.** `client/public/images/site/logo.svg` — the supplied
  artwork dropped in byte-for-byte, replacing seven hand-typed
  `Home<span>krafted</span>` text lockups (header, footer, HomeKrafter
  shell, admin shell, admin login, consumer login, signup).
- **`/about`.** Story, mission, the four differentiators, offerings, team
  and contact, sourced from homekrafted.in — see `lib/data/about.ts` for
  which lines are verbatim. The header's "About" nav pointed at `/` for
  want of a destination; it now points here, superseding that M0 standing
  decision. The footer's Help column links it too.

### Changed

- **Live at https://homekrafted.in.** Hostinger DNS `@` and `www` now A
  records to the box; Let's Encrypt cert covers both, `certbot.timer`
  renews it, and plain HTTP 301s to https. `CLIENT_ORIGIN` and
  `NEXT_PUBLIC_API_URL` moved to the https origin. Every other record on
  the zone — mail, and the `order`/`ordernew`/`admin`/`kitchen` hosts on
  the older ordering box — was left untouched.

### Fixed

- **Squashed logo in the header and footer.** `.logo` and `.brandCol` are
  flex columns, so the default `align-items: stretch` set the image's
  cross size — its width — which beats `width: auto`. A 1.75:1 mark was
  being drawn at roughly 3.7:1. Both now pin `align-self: flex-start`.
- **Invisible footer logo.** The lockup's "Krafted" is `#004e19` against
  `--hk-pine-deep`. The three dark surfaces knock the artwork to white in
  CSS rather than forking the supplied file.

### Docs

- `docs/DEPLOY.md` gains a "Domain & TLS" section (which records are ours
  vs. mail vs. the other box, the certbot commands, and the cached-NXDOMAIN
  trap when swapping a CNAME for an A). Its "Going to a real domain"
  section described this as future work and was rewritten as an ordered
  runbook. `docs/TESTING.md` and `CLAUDE.md` moved to the https URL, and
  TESTING's "no padlock is expected" notes are gone — there is a padlock now.

## [M12] — One HomeKrafter role, local discovery, pre-order — 2026-07-30

Turns the supply side into a single role and makes the marketplace local
to the Chandigarh tricity. Shipped straight to the live staging box
(http://187.127.171.48) with a deliberate database reset — the schema
changes are destructive and the box was demo data.

### Changed

- **One supply role, "HomeKrafter".** `Seller.type`
  (`maker|laundry|snack`) removed. It was a role in all but name: it
  decided which portal modules you could open, and `server/src/seller/*`
  threw `403 "only available to <type> sellers"` at everything else — so
  two of the three account types literally could not add an item to sell.
  Replaced by `Seller.specialties: SellerSpecialty[]`, a discovery/display
  tag that must never decide access. Every HomeKrafter now has a required
  `vendorId` (storefront) and all eight modules.
  `resolveMaker`/`resolveLaundryPartner`/`resolveSnackSeller` collapse into
  one `resolveHomeKrafter`.
- **One dashboard snapshot** covering storefront orders, pickups and snack
  orders, replacing three mutually exclusive per-type shapes. Modules a
  HomeKrafter doesn't use read zero rather than being hidden.
- **Payouts sum every stream.** `computeDeliveredEarnings` picked one
  stream by `seller.type`; an account that both cooked and ran pickups was
  paid for only one of them.
- **Laundry partner routing** matches `specialties: { has: 'laundry' }`
  instead of `type: 'laundry'`.
- **User-facing copy says HomeKrafter(s).** Code keeps `seller` —
  `role: "seller"`, `/seller/*`, the `Seller` type, DB columns — since
  renaming those churns middleware, the `hk_role` cookie, JWT claims and
  the Prisma enum for nothing a user sees.
- **Landing page** leads with home-cooked food from kitchens near you
  rather than reading as a gifting site; announcement bar and footer blurb
  follow.
- **Seed relocated to the tricity** — ten kitchens across Chandigarh
  sectors, Mohali, Panchkula and Zirakpur, each with real coordinates.
- **Migrations collapsed to one init.** This ships with a reset, so
  replaying four historical migrations that create and then drop the same
  columns would be noise.

### Added

- **Item availability.** `Product.isAvailable` / `Snack.available` with
  `PATCH /seller/{listings,menu}/:id/availability`, surfaced as one-tap
  toggles in the dashboard's "Today's menu" panel. Deliberately distinct
  from admin `moderationStatus`: an item can be perfectly allowed and
  simply not being cooked today, and neither actor should silently
  override the other.
- **Location.** `Vendor.area`/`lat`/`lng`/`deliveryRadiusKm`, haversine
  filtering in `common/geo.ts` (application code, not SQL — no PostGIS and
  the candidate set is one row per HomeKrafter). Buyers get a location
  prompt on first visit with a manual tricity area picker behind it, and a
  "Delivering to…" confirm at checkout. **Nothing is ever gated on having
  a location**: declining is first-class, and with no coordinates the API
  returns the full catalogue rather than an empty page.
- **Everyone applies.** `/sell` now captures specialties, tricity area and
  delivery radius; approving creates the user, a geo-located Vendor and a
  full HomeKrafter, and notifies them. Rejection notifies too when the
  applicant already has an account.
- **HomeKrafter notifications** — `NotificationsService.notify()`, honouring
  per-category preferences and never throwing into the caller's path (a
  paid order must not roll back because an inbox write failed). Wired to
  new orders and application decisions.
- **Pre-order** for Snacks and full meals, on a shared `lib/schedule.ts`.
  New `ChannelRule.hasPreOrderOnWeb`, kept separate from
  `hasCheckoutOnWeb`: scheduling is information, not a transaction, so the
  chosen slot travels in the WhatsApp message rather than becoming an order
  record. Snacks still has no cart; full meals still has no web menu.
- **`PreOrderPicker`** — delivery-window scheduler (month header, paged day
  strip, time grid). Design ported from a supplied Tailwind/shadcn
  component onto CSS Modules + tokens; its date logic was *not* ported,
  because `getWeekDays()` returns Mon–Sat of the current week including
  days already past and never filters expired times.

### Fixed

- **The near-me filter never reached `/shop` or `/snacks`.** Both are
  Server Components, so they fetch during the server render where
  `localStorage` doesn't exist — the buyer's area could never reach the
  query. Now mirrored into an `hk_loc` cookie and read via
  `getBuyerCoords()`.
- **React #418 hydration mismatch** on any page rendering the scheduler:
  the day list derives from `new Date()`, and server and browser disagree
  on "Today". Time-dependent UI is now built in an effect after mount
  behind a stable placeholder.
- **`mapVendor` never returned `area`/`lat`/`lng`/`deliveryRadiusKm`**,
  though `client/lib/types` marks them required — every storefront got
  `undefined` for fields it type-guarantees.
- **Application responses dropped `area`/`specialties`/`deliveryRadiusKm`**,
  so the admin review queue couldn't show what it was deciding on.
- **`THROTTLE_AUTH_LIMIT` was dead config** — `configuration.ts` read it and
  nothing consumed it; `AuthController` hardcoded `limit: 5`. Raised to
  120/60s overall and 20/60s on auth: the old ceiling was low enough that
  ordinary use tripped it, and the 429s surfaced as blank modules and
  "Missing bearer token", reading as a broken site. Brute-force protection
  verified still active.
- **Module-unavailable copy** rendered "doesn't include menuyet" — JSX was
  eating the space around an expression.
- **`.env.example` files were untracked**, swallowed by the blanket `.env*`
  ignore, so a fresh clone had none of the templates `docs/DEPLOY.md` tells
  you to copy.

### Docs

- `CLAUDE.md` rewritten for the single role, location/availability rules
  and the no-Tailwind constraint, with a **Docs upkeep** table naming which
  file to update for which kind of change.
- `docs/API.md` — per-type `403`s removed (they no longer exist), new
  availability + location-filtering endpoints documented.
- `docs/DATA-MODEL.md` — `Seller.type` → `specialties`.
- `docs/DEPLOY.md`, `docs/TESTING.md` — deploy runbook, rate limits, and a
  tester handout covering location, pre-order and the reset accounts.

## [M9] — Integrations: WhatsApp Cloud API, notification delivery, seller onboarding closed — 2026-07-28

Final planned milestone (M0–M9 now complete). Real WhatsApp Cloud API
integration, real per-preference notification delivery (SMS/WhatsApp/
email), the OTP sender wired to a real SMS provider, and the public
seller-application create endpoint that closes the `/sell` → admin-
approve → seller-active loop end-to-end. Every new provider (WhatsApp,
SMS, email) is env-gated: real credentials → real send, the
`.env.example` placeholders → an obviously-labeled logged stub, same real
code path either way — no separate mock/real branch to maintain, same
convention M8.2 established for Razorpay. `handoff/`, root `app/`, root
`CLAUDE.md` untouched; hamper stays on hold; no commits made by this
milestone.

### Added

- **`server/src/whatsapp/`** — `WhatsAppService.sendStatus(recipient,
  orderRef, state)`, the shared outbound seam: real Meta Graph API call
  (`POST /{phoneNumberId}/messages`, template-based when
  `WHATSAPP_STATUS_TEMPLATE` is set, else plain-text) or a logged
  `[WHATSAPP STUB]` when `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are
  still placeholders. `SellerSnackOrdersService.advance` (M8.3b) now calls
  it on every status transition — verified live: advancing a real order
  logs the exact rendered message + recipient.
- **WhatsApp webhook** (`GET`/`POST /whatsapp/webhook`) — `GET` handles
  Meta's one-time subscription verification handshake
  (`WHATSAPP_VERIFY_TOKEN`); `POST` verifies `X-Hub-Signature-256` (HMAC-
  SHA256 over the **raw** body, keyed with `WHATSAPP_APP_SECRET`,
  constant-time compared) before trusting anything, mirroring the
  Razorpay webhook's verify-first pattern exactly — an invalid signature
  is `400` with zero state change. A verified inbound message is parsed
  by `WhatsAppInboundService` against the exact "NNx Snack Name" shape
  `client/lib/snacks/message.ts#buildSnackListMessage` emits, matched
  against real `Snack` rows, and turned into a real `SnackOrder` (+
  items) per seller referenced — closing the gap where a snack seller's
  order queue only ever held seeded demo rows. Sends the customer a
  "received" confirmation via `WhatsAppService.sendStatus` right after.
- **`server/src/notifications/notifications-delivery.service.ts`** —
  `NotificationsDeliveryService.deliver(...)`: reads the target user's
  `NotificationPreference` for the given category and, per enabled
  channel, calls that channel's provider then persists one `Notification`
  row per channel actually delivered (so the inbox reflects exactly what
  went out). Wired into `AdminWalletService.adjust`/`issueRefund`
  (category `"wallet"`) as the concrete, curl-provable example this
  milestone shipped; exported from `NotificationsModule` for future call
  sites (order/laundry/snack status changes) to use the same way.
- **`server/src/notifications/providers/`** — `SmsProviderService`
  (Twilio-shaped: Account SID + Auth Token Basic auth, form-encoded
  `Messages.json`; MSG91 or any REST SMS provider is a drop-in swap) and
  `EmailProviderService` (SendGrid-shaped: Bearer API key, `POST
  /v3/mail/send`; an SMTP transport is a drop-in alternative). Both
  degrade to an obviously-labeled logged stub (`[SMS STUB]`/`[EMAIL
  STUB]`) on placeholder credentials.
- **`OtpService` → real SMS delivery** — routes through
  `SmsProviderService` instead of a console-only stub; still logs the raw
  code at `[OTP STUB]` when the provider itself reports stub mode
  (skipped once delivery is real, so a live verification code never hits
  the server log).
- **`POST /seller-applications`** (`server/src/seller-applications/`,
  `@Public()`, throttled `{limit:5, ttl:60_000}`) — persists a real
  `SellerApplication` (status `"new"`) into the existing admin approval
  queue (`GET /admin/sellers/applications`, M8.3c). `lib/api/sell.ts#createSellerApplication`
  swapped to call it for real; `/sell`'s copy updated to drop the old
  "coming soon" / waitlist framing now that onboarding actually works —
  verified end to end: submit → appears in `?status=pending` → approve →
  new account logs in via phone-OTP with `role: "seller"`.
- **Wallet mutation shape gap closed** — `POST /admin/wallet/:userId/adjust`
  and `.../refund` now respond `{wallet, balanceAfter, transactionId}`
  (previously discarded the created `WalletTransaction`'s own id, see
  M8.4b's flagged gap below); `WalletService.adjust`/`postLedgerEntryTx`
  updated to surface it, `lib/api/admin.ts`'s `adjustWallet`/`issueRefund`
  use the real id instead of synthesizing one.
- **`.env.example`** — `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/
  `WHATSAPP_VERIFY_TOKEN`/`WHATSAPP_APP_SECRET`/`WHATSAPP_API_VERSION`/
  `WHATSAPP_STATUS_TEMPLATE`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
  `TWILIO_FROM_NUMBER`, `SENDGRID_API_KEY`/`EMAIL_FROM` — each annotated
  with where to get a real value. `server/README.md`'s "Needs real
  credentials" section lists the exact go-live steps.

### Verified (server up, seeded Postgres, curl)

Webhook GET-verify (correct token echoes the challenge, wrong token
`403`s); webhook POST (bad HMAC `400`s with no `SnackOrder` written, good
HMAC `200`s and creates a real, seller-visible `SnackOrder` from a
"2x Masala Mathri / 1x Besan Ladoo"-shaped message); the snack seller
advancing that order logs a second, distinct `[WHATSAPP STUB]` line;
setting a consumer's `wallet` notification preference to
`{sms:true, whatsapp:false, email:true, inapp:true}` then triggering an
admin wallet credit produces exactly 3 new inbox rows (`sms`/`email`/
`inapp`, no `whatsapp`) plus matching `[SMS STUB]`/`[EMAIL STUB]` log
lines with the exact rendered message; the full seller-onboarding loop
(`POST /seller-applications` → appears in the pending queue → approve →
phone-OTP login → JWT carries `role:"seller"` + a real `sellerId`).

### Known gaps (flagged, not silently half-working)

- `NotificationsDeliveryService.deliver` is only wired into the wallet
  admin-adjustment flow — order/laundry/snack status-change call sites
  are a future pass (the service is exported and ready; wiring every
  producer wasn't worth the diff size for one milestone's proof).
  Support-ticket/corporate-inquiry admin review queues remain unbuilt
  (flagged since M8.3a/M9's API doc, not new here).
- Real Google/Apple OAuth token verification (currently a trusted-payload
  stub, `SocialLoginDto`) is unchanged — out of this milestone's scope.
- The WhatsApp inbound parser is deliberately minimal free-text matching
  against `buildSnackListMessage`'s exact line shape, not a production
  WhatsApp Flow/interactive-list integration — documented as a seam in
  `docs/API.md`, not a hidden limitation.

## [M8.4b] — Client mock→real swap: seller + admin (client/) — 2026-07-27

Completes the M8.4 client swap: `lib/api/seller.ts` (~35 fns) and
`lib/api/admin.ts` (~30 fns) now call the real M8.3b/M8.3c `server/`
endpoints instead of `lib/data` mock arrays, following M8.4a's exact
`if (isMockMode()) {...} return http.<method>(...)` pattern. Admin sign-in
(`AuthContext.tsx#signInAsAdmin`) also swapped to a real `POST /auth/login`.
`handoff/`, root `app/`, root `CLAUDE.md` untouched; hamper stays on hold;
no commits made by this milestone.

### Added

- **`lib/api/seller.ts` → real** — listings CRUD, orders + fulfilment
  advance, storefront update, payouts + request, reviews + reply,
  laundry-partner bookings + advance, snack menu CRUD, snack-order advance,
  all 3 dashboard shapes. Every function kept its mock-era
  `vendorId`/`sellerId` argument for call-site stability even though the
  real endpoints resolve ownership from the JWT and ignore it.
- **`lib/api/admin.ts` → real** — users list/detail/suspend, sellers +
  approval queue (approve/reject/status), unified orders + per-type detail
  + refund, catalog + review moderation, wallet overview/user-wallet/
  refund/adjust, collections CRUD, categories/occasions (delegates to the
  existing public `lib/api/catalog.ts` reads), dashboard, analytics.
- **`signInAsAdmin` real** (`lib/auth/AuthContext.tsx`) — real
  `POST /auth/login` against the seeded admin account
  (`admin@homekrafted.example`), same `completeRealSignIn` tail every
  other sign-in method uses. `hydrate()`'s mock-only bypass no longer
  special-cases `role === "admin"` — a persisted admin session now
  restores through the same `loadStoredSession`/`getMe()` path
  consumer/seller sessions already use, with a defensive local-flags
  fallback (mirroring the existing seller one) if no real session
  survived. `AdminLoginClient.tsx` updated to await the now-async call.

### Fixed

- **`describeSellerOrderItems`** (`lib/api/seller.ts`) — this pure helper
  resolved "which of a mixed-vendor order's lines are mine" via a mock
  product lookup that could never match a real order's Postgres-generated
  `productId`, so every real-mode seller order row would have silently
  shown "—" instead of its items. Fixed with a small per-vendor product-id
  cache warmed by `getSellerListings`/`getSellerOrders`.
- **Storefront edit now actually reaches the public page** — `updateSellerStorefront`
  (`PATCH /seller/storefront`) writes the real `Vendor` row the
  server-rendered `/storefront/[vendor]` page reads on every request; the
  mock-era "edit never reaches the consumer page" limitation (documented
  since M10a) is a real fix now, verified live.

### Known gaps (flagged, not silently half-working)

- `updatePartnerBookingSlots`, `updateProductAdmin`, `updateHomePromoBand`/
  `getHomePromoBands` stay mock-only — no real endpoint exists for any of
  them (see doc comments at each definition + `docs/API.md`'s M8.4b
  section for why). `lib/api/sell.ts#createSellerApplication` (the public
  `/sell` form) also has no real endpoint yet, so a real-mode admin
  approval queue only ever shows the seeded applications, not a live
  submission.
- `POST /admin/wallet/:userId/refund`/`adjust` respond `{wallet,
  balanceAfter}`, discarding the created `WalletTransaction`'s own id —
  `issueRefund`/`adjustWallet` synthesize a client-side transaction object
  from the request + `balanceAfter` so the UI still gets a full row to
  prepend; only `id`/`createdAt` are client-generated.
- `GET /admin/audit` has no frontend screen in any prior milestone —
  verified directly via `curl` with an admin token instead.

### Verification

- `client/` `npx tsc --noEmit` + `npm run build` + `npm run lint` clean
  (2 pre-existing lint errors in `LoginClient.tsx`/`SignupClient.tsx`,
  untouched by this milestone, unrelated to the seller/admin swap).
- **Live e2e** (headless browser, seeded Postgres, one continuous session
  across all 3 roles): seller sign-in as maker/laundry/snack (real
  `POST /auth/login`, confirmed no network call in mock mode); maker
  dashboard, listing create (verified live on the public storefront),
  order-advance (placed→confirmed), storefront bio edit (verified live on
  `/storefront/[vendor]`), payouts, review reply; laundry-partner
  dashboard + pickup-advance (scheduled→picked-up); snack-seller dashboard
  + menu + order-advance (received→accepted); the shop⇄sell dual-mode
  switch (confirmed the M8.5 changelog's "still owed" e2e pass); admin
  sign-in, **approve a seller application → seller immediately active**
  in "All sellers" + dashboard's "Active makers" count incremented,
  **take down a product → instantly gone from public `/shop`**, restored
  on approve/unhide; wallet refund from both the wallet-detail and
  order-detail screens (balance survives a hard reload); analytics;
  audit log (via `curl`). Zero console errors throughout, at 360/768/1180.

## [M8.5] — Auth UX: role-choice login/signup + seller dual-mode — 2026-07-27

Reworks the auth entry so `/login` and `/signup` both **lead with a role
choice** ("I'm a shopper / I'm a seller"; admin stays internal-only), and
gives a **seller a single account that can also shop** via a "Switch to
shopping / Switch to selling" toggle — no re-login, no second account.
`handoff/`, root `app/`, root `CLAUDE.md` untouched; no commits.

### Added

- **Role-select login/signup** (`components/auth/LoginClient.tsx`, new
  `app/signup/page.tsx`) — shared "shopper / seller" tabs on both screens
  (`authRole` state, honours `?role=seller` from the folded-in old
  `/seller/login` redirect). Shopper is self-serve; **seller signup routes
  into the `/sell` application flow** (apply → admin-approve → sign in as
  seller). The signed-in account's own `role` decides where it lands, not
  which tab was used. "Continue as demo shopper / demo seller" retained.
- **Seller dual-mode** (`lib/auth/AuthContext.tsx`) — `sellerMode`
  (`"selling" | "shopping"`), persisted in `hk_session_v1`, defaults to
  `selling`; a switch in `HeaderClient` / `MobileDrawer` / `SellerShell`
  flips chrome + landing surface on the **same session/token** (no
  re-login). A seller in shopping mode uses the exact consumer surfaces
  (cart/wallet/checkout) as a normal buyer.
- **Middleware** (`middleware.ts`) — `/seller/*` requires `role==="seller"`;
  its `matcher` covers only `/seller/*`+`/admin/*`, so **consumer routes are
  never gated** (a seller shops freely, same session). Consumer→`/seller`
  redirects to `/sell` ("become a seller"); signed-out→`/login?role=seller`;
  admin unchanged/internal-only.

### Fixed

- **`server/src/auth/auth.service.ts` — `/auth/refresh` 500** (found in
  M8.4a): two refreshes within the same second signed byte-identical JWTs
  → duplicate `RefreshToken.tokenHash` unique-constraint. Fixed by adding a
  per-issuance `jti: crypto.randomUUID()` nonce to the token payload, so
  every issued token (and its hash) is unique. Two rapid refreshes now both
  succeed.

### Verification

- `client/` `npx tsc --noEmit` + `npm run build` clean; `server/`
  `npm run build` clean. Feature + fix verified by code review + a clean
  build. NOTE: a full headless-browser e2e pass (seller shop⇄sell
  round-trip against a running server) is still owed — the building agent
  was interrupted (session limit) before running it; flagged as a
  follow-up to confirm at the next server-up pass.

### For M8.4b

- Seller/admin `lib/api` still mock — the dual-mode switch works over mock
  seller data today; M8.4b swaps `lib/api/seller.ts`+`admin.ts` to the real
  API. Hamper remains **on hold** (untouched).

## [M8.4a] — Client mock→real swap: auth + consumer (client/) — 2026-07-27

Points the **consumer** side of `client/` at the live `server/` API —
zero visible behavior change, same screens, same call-site shapes almost
everywhere. Seller/admin (`lib/api/seller.ts`, `lib/api/admin.ts`) stay
mock, M8.4b scope. `server/`, `handoff/`, root `app/`, root `CLAUDE.md`
untouched; no commits made by this milestone.

### Added

- **HTTP client** (`client/lib/api/http.ts`) — `fetch` wrapper over
  `NEXT_PUBLIC_API_URL`; attaches the bearer access token; on `401`
  attempts one de-duplicated `POST /auth/refresh` then retries, else
  clears the session and redirects to `/login`; parses the server's
  `{error:{code,message}}` envelope into `ApiError`. `isMockMode()`
  (`NEXT_PUBLIC_USE_MOCK`) gates every domain module's real-vs-mock
  branch — still `false`/unset by default now that a live `server/`
  exists to point at.
- **Session store** (`client/lib/auth/session.ts`) — access+refresh
  tokens + the `PublicUser` snapshot: in-memory + `localStorage`
  (`hk_session_v1`) for reload-survival (the server never sets a
  cookie itself — confirmed reading `AuthController`), plus a
  non-httpOnly `hk_access` cookie mirror (same documented
  not-a-security-boundary caveat as `middleware.ts`'s pre-existing
  `hk_role`) so a Server Component can attach a token during SSR.
  `isAccessTokenStale()` decodes the JWT `exp` so refresh is only called
  when actually needed — see "Fixed" below.
- **Real auth** (`lib/api/auth.ts` + `AuthContext.tsx` rewrite) — phone
  OTP (`/auth/otp/request`+`/verify`), email login-or-register fallback
  (`/auth/login` → `/auth/register` if no account exists yet — the
  pre-M8.4a UI only ever collected an email, so a password field was
  added to `LoginClient`'s email tab), social stub
  (`/auth/social/:provider`, a stable per-provider fake
  `providerAccountId` persisted in `localStorage` so repeat clicks
  resolve to the same demo account), "sign in as demo user"/auto-sign-in
  both real-login the seeded `ananya.iyer@example.com` account
  (preserves the pre-M8.4a "fresh browser = signed in" default —
  explicitly signing out persists that choice, same shape as before).
  Seller/admin sign-in (`signInAsSeller`/`signInAsAdmin`) is untouched
  mock, mutually exclusive with the real consumer session as before.
- **Domain swaps** — `products`, `vendors`, `catalog`, `reviews`,
  `snacks` (menu reads), `laundry` (services/availability/bookings/
  subscriptions), `orders` (+`payOrder`, +`getOrder`), `addresses`,
  `history` (unified order/booking history), `referrals`/`loyalty`,
  `notifications`, `support`, `corporate` (submit only — no list
  endpoint yet), `site` (`getCurrentUser`/`updateUser`/`getDefaultAddress`/
  `getAddresses`/`getHamperBoxes`), plus new `lib/api/cart.ts`/
  `wishlist.ts`. Every file keeps its exact export surface and branches
  on `isMockMode()` — `lib/data` is untouched and still the fallback
  source.
- **`Cart`/`Wallet`/`Wishlist` stores are server-backed** — every
  `useCart()`/`useWallet()`/`useWishlist()` call site is unchanged.
  `CartContext` reads the real `GET /cart`'s richer `ServerCartLine`
  fields directly instead of computing `lineInfo()` from a separately-
  fetched catalog; `addHamperItem`'s return type changes `ID` →
  `Promise<ID>` (its one call site, `HamperBuilderClient`, now awaits it
  before navigating). `WalletContext.pay` becomes `async` (`Promise<PayResult>`,
  now with an optional `message`) and posts to `POST /orders/:id/pay`;
  `topUp` opens Razorpay Checkout (`lib/payments/razorpay.ts`, new); `earnCashback`/
  `refund`/`earnReferralCredit` no longer compute anything client-side —
  the server is the only ledger writer now, so they just trigger a
  refetch (a new `refresh()` method does the same for
  `LaundryBookingClient`'s atomic wallet-paid booking debit, which no
  longer calls `pay()`/`earnCashback()` at all). All three gate hydration
  on `useAuth()`'s real consumer session.
- **Checkout rework** (`CheckoutClient.tsx`) — `POST /orders` creates from
  the caller's *server-side* cart (no client-submitted line items);
  gift-to-recipient now saves the recipient as a real `Address` first
  (`createAddress`) since `gift.recipientAddressId` must be one of the
  caller's own saved addresses (the mock's synthetic `"gift-recipient"`
  id doesn't carry over — flagged in `docs/API.md`); wallet-pay calls
  `payOrder`, Razorpay-pay opens the real Checkout SDK
  (`createRazorpayOrder` + `openRazorpayCheckout`), COD stays
  `pending-payment` server-side (a real backend gap, see "Known gaps").
- **Type seams applied** (`lib/types/marketplace.ts`) — `OrderStatus`
  gained `"pending-payment"`; `OrderGift.recipientAddressId`'s doc
  comment updated for the real-address requirement; new
  `ServerCartLine`/`ServerCart` types mirror the real `GET /cart`
  response shape.
- **Owner-scoped Server Component pages converted to client-fetch** —
  `app/checkout`, `app/laundry`, `app/account/{addresses,notifications,
  referrals,page}` used to fetch owner-scoped data server-side; since a
  Server Component render has no reliable live session token (see
  `session.ts`'s file header), each now fetches its own data client-side
  on mount instead (the same pattern `OrdersListClient` already
  established pre-M8.4 for exactly this reason) — only the still-public/
  static reads stay server-fetched props.

### Fixed / flagged

- **Server bug found live, not fixed (out of scope — `server/`
  untouched)**: `POST /auth/refresh` (`auth.service.ts`) hashes the
  *newly-signed* JWT as `RefreshToken.tokenHash`; two refresh calls for
  the same user inside the same wall-clock second mint byte-identical
  tokens, and the second insert `500`s on a unique-constraint violation
  (reproduced live via back-to-back `curl`). Mitigated client-side:
  `AuthContext`'s hydration only calls `/auth/refresh` when
  `isAccessTokenStale()` says the stored access token is actually
  expired/near-expiry, instead of unconditionally on every mount — cut
  real-world refresh-call frequency from "every full navigation" to
  "roughly once per 15-minute access-token TTL."
- **COD orders have no forward transition** — every real order
  (`OrdersService.create`) starts `"pending-payment"` regardless of
  `paymentMethod`, including `"cod"`; there's no `M8.2` endpoint that
  ever moves a COD order past that (only `"wallet"` has `POST
  /orders/:id/pay`, `"razorpay"` has the webhook). `docs/API.md` already
  flagged this as a real backend gap. `ORDER_STATUS_LABEL["pending-payment"]`
  ("Payment pending") keeps the account/orders screens honest rather
  than silently mislabeling it.

### Still on mock (deliberately, M8.4b scope)

- `lib/api/seller.ts`, `lib/api/admin.ts` and every `/seller/*`/`/admin/*`
  screen — unchanged, still resolve `lib/data`.
- `lib/api/sell.ts` (`/sell` seller-application submit) — no public
  create-application endpoint exists yet server-side.
- `lib/api/corporate.ts#getCorporateInquiries` — no list endpoint yet
  (seamed for M11 admin panel per `docs/API.md`); `createCorporateInquiry`
  is real.

### Verified live

- `npm run build` / `npx tsc --noEmit` / `npm run lint` clean.
- Full consumer loop exercised against a live `server/` + seeded
  Postgres via a headless browser: home → shop → product detail → add
  to cart (`POST /cart/items`) → `/cart` (server-resolved line pricing)
  → `/checkout` → **wallet-paid order placed** (`POST /orders` →
  `POST /orders/:id/pay`, wallet debited + cashback credited, confirmed
  in `/account/orders`) → `/laundry` booking placed (`POST
  /laundry/bookings`, atomic wallet debit) → `/account/referrals`
  "apply referral credit" (`POST /referrals/:id/apply-credit`, wallet
  refreshed) — zero console errors across the whole loop, at 360/768/1180.
  `NEXT_PUBLIC_USE_MOCK=true` re-verified to fall back to the pre-M8.4a
  mock layer with zero network calls.

## [M8.3c] — Admin API (server/) — 2026-07-27

The unscoped admin-panel endpoints — `server/src/admin/`, gated
`@Roles('admin')` on every route — completing the backend's 3-role API
surface (consumer + seller + admin). Unlike `SellerModule` (M8.3b), this
module is deliberately **unscoped**: every read spans every user/seller/
order/wallet rather than the caller's own resource, so the milestone's
critical requirement is that **every mutation writes an
`AdminAuditLog` row** (new model — actor, action, target type/id, JSON
metadata) and that the RBAC gate is airtight (verified live below).
Money actions never write a balance directly: order refunds and wallet
adjust/refund all funnel through `WalletService`'s existing row-locked
ledger primitives (`OrdersService.refundOrder` reused as-is for
marketplace orders). `client/`, `handoff/`, root `app/`, root `CLAUDE.md`
untouched; no commits made by this milestone.

### Added

- **`AdminAuditLog`** (`prisma/schema.prisma`, new model) +
  **`AdminAuditLogService`** (`server/src/admin/audit-log.service.ts`) —
  every admin mutation across this module calls `log()` *after* the
  mutation succeeds (never before, so a rolled-back action leaves no
  misleading row). `GET /admin/audit` (`?targetType=&actorId=&page=&pageSize=`)
  surfaces it, newest first, actor name/email joined in.
- **Dashboard + analytics** (`server/src/admin/dashboard.{controller,service}.ts`)
  — `GET /admin/dashboard` (GMV, orders today/total, orders/active-sellers
  by type, users, pending applications, pending payouts, wallet
  liability — all real server-side aggregates: `Seller.groupBy`,
  `Payout`/`Wallet` `.aggregate()`) and `GET /admin/analytics` (14-day GMV
  series, top-6 seller/product leaderboards, new users by month, wallet
  flow by category).
- **Users** (`server/src/admin/users.{controller,service}.ts`) —
  `GET /admin/users[/:id]`, `PATCH /admin/users/:id` (`{ suspended }`) —
  the same `User.suspended` flag `AuthService` already gates login/OTP/
  social/refresh on, so a suspended user's very next sign-in attempt is
  rejected `401` (verified live: registered a fresh account, suspended
  it, confirmed login now `401`s, reactivated, confirmed login works
  again).
- **Sellers + the onboarding approval queue**
  (`server/src/admin/sellers.{controller,service}.ts`) — `GET
  /admin/sellers[/:id]`, `PATCH /admin/sellers/:id/status` (suspend/
  reactivate), `GET /admin/sellers/applications` (`?status=pending` for
  the queue), `POST /admin/sellers/applications/:id/{approve,reject}`.
  **Approve is one atomic transaction**: finds-or-creates the
  applicant's `User` (reuses an existing account by email, upgrading
  `consumer`→`seller`; otherwise mints a fresh `role: "seller"` account
  with `authProviders: ["phone"]` + a `Wallet` + `LoyaltyAccount`, same
  recipe `AuthService.verifyOtp`'s first-time-phone signup uses) →
  creates a `Vendor` storefront from the application's business details
  → creates the `approved`-status `Seller` pointing at it → marks the
  application `approved`. Unlike the M11a frontend mock (which pointed
  `Seller.userId` at a synthetic placeholder id), this schema has a real
  FK there, so a live account is provisioned rather than faked.
- **Catalog + review moderation**
  (`server/src/admin/catalog.{controller,service}.ts`) — `GET
  /admin/catalog/products[/:id]` (every product, any vendor, including
  hidden/flagged), `PATCH .../moderate` (`hide`/`unhide`/`flag`/`unflag`/
  `takedown`/`feature`/`unfeature`); `GET /admin/catalog/reviews`, `PATCH
  .../moderate` (`{ hidden }`). Verified live: hid a real seeded product
  and confirmed it immediately disappeared from the public `GET
  /products` listing, then confirmed it reappeared after unhiding.
- **Orders oversight** (`server/src/admin/orders.{controller,service}.ts`)
  — `GET /admin/orders` (`?type=`, unified marketplace `Order` +
  `LaundryBooking` + `SnackOrder` list) and `.../:type/:id` detail;
  `POST .../:type/:id/refund` (marketplace delegates to the existing
  admin-gated `OrdersService.refundOrder`; laundry credits the wallet
  directly via `WalletService`'s ledger primitives, idempotent-by-content
  since `LaundryBooking` has no `refundStatus` field to flip; snack is
  `400` — no linked wallet); `PATCH .../:type/:id/status` (manual
  override, any valid status for the type, distinct from a seller's
  one-step `advance`).
- **Wallet oversight** (`server/src/admin/wallet.{controller,service}.ts`)
  — `GET /admin/wallet` (every wallet, balance descending) and
  `.../:userId`; `POST .../:userId/adjust` (forwards into the existing
  `WalletService.adjust`) and `.../:userId/refund` (a standalone credit
  via `postLedgerEntryTx`, not necessarily order-tied) — both support
  `Idempotency-Key`, neither ever writes `Wallet.balance` directly.
- **Collections & CMS** (`server/src/admin/collections.{controller,service}.ts`)
  — full `Collection` CRUD (title/description/occasion + ordered
  `productIds`, written as `CollectionProduct.sortOrder` — delete +
  recreate on every save, so "reorder" is just resubmitting the array in
  the new order).

### Verification

Verified live via curl against the seeded local Postgres, as the seeded
admin (`admin@homekrafted.example` / `Passw0rd!123`): dashboard/analytics
returned real aggregates matching the seed data; suspended a freshly
registered test user and confirmed their next login attempt `401`s, then
reactivated and confirmed login works again; listed the 3 pending seed
`SellerApplication`s, approved one (`sa-seed-1` → a real new `Seller`
row, `Vendor` "Kaveri's Kitchen", and a real `User` account, all in one
transaction) and rejected another (`sa-seed-2`); hid a real product
(`pr3`, Ragi Almond Cookies) and confirmed it vanished from the public
`GET /products` response, then unhid it and confirmed it came back;
hid and unhid a flagged review; listed unified orders (19 total across
marketplace/laundry/snack, filterable by `?type=`); refunded a
marketplace order (`ord-seed-2039`, ₹987 wallet-credited via the ledger,
`refundStatus` → `refunded`) and a laundry booking (`lb-seed-1044`, ₹474
credited), confirmed the consumer wallet balance rose by exactly both
amounts, then retried the marketplace refund with the same
`Idempotency-Key` and got back the identical cached result (no double
credit); confirmed a snack-order refund attempt `400`s (no linked
wallet); overrode a laundry booking's status directly to `delivered`;
adjusted the same wallet (+₹50 credit) and issued a standalone refund
(+₹25) — both landed via `WalletService`'s ledger, balance correct after
each; created, reordered, and deleted a test `Collection`. **`GET
/admin/audit`** showed every one of the above mutations, newest first,
with the correct actor/action/target/metadata. **RBAC** — every
`/admin/*` route tested (`dashboard`, `users`, `sellers`, `orders`,
`wallet`, `collections`, `audit`, `catalog/products`) returned `403` for
both a `consumer` token and a `seller` token, and `401` for no token at
all; the same routes returned `200`/expected data for the admin token.
`npm run build` and `npm run lint` both clean; app boots. Database
reseeded to the canonical demo state afterward (`npm run prisma:seed`,
after adding `AdminAuditLog` to the seed script's `clearTables()` —
needed once `User` had a new FK-referencing child table) — none of the
test mutations (the approved/rejected applications, refunds, wallet
adjustments, suspended test user, test collection) persist.

### Completes the M8 backend API surface

With M8.3c landed, all three role surfaces (`consumer`, `seller`,
`admin`) now have a real, RBAC-gated, audit-where-it-matters backend API.
**M8.4** (swap `client/lib/api/*` mock function bodies to real `fetch()`
calls against `server/`) and **M9** (WhatsApp Cloud API, real SMS/email/
push notification delivery) remain.

## [M8.3b] — Seller API (server/) — 2026-07-27

The owner-scoped seller-portal endpoints for all 3 seller types (maker,
laundry partner, snack seller) + payouts — `server/src/seller/`, gated
`@Roles('seller')` and scoped entirely off `req.user.sellerId` (minted
into the JWT server-side at login, never a client-supplied id). This is
the isolation boundary the milestone brief called out as critical:
**every** read and write re-derives ownership from a live `Seller` row
and 404s (never 403, never a partial response) on a resource that exists
but belongs to a different seller — verified live with a second seeded
account per seller type (see "Verification" below). `client/`, `handoff/`,
root `app/`, root `CLAUDE.md` untouched; no commits made by this
milestone.

### Added

- **`SellerService`** (`server/src/seller/seller.service.ts`) — the
  ownership seam every controller in this module goes through.
  `resolveSeller` re-reads the `Seller` row fresh from the DB on every
  call (not just trusting the JWT's claim, so a seller suspended after
  their token was issued can't ride on a stale token);
  `resolveMaker`/`resolveLaundryPartner`/`resolveSnackSeller` additionally
  gate on `seller.type` (`403` for a wrong-type token, distinct from the
  404-for-another-seller's-resource case). Also owns `GET`/`PATCH
  /seller/storefront` (maker-only — edits the caller's own `Vendor` row,
  no `vendorId` field on the DTO) and `GET /seller/dashboard`, which
  branches its response shape by `seller.type` (mirrors the 3 mock
  snapshot shapes in `client/lib/api/seller.ts` 1:1).
- **Listings** (`server/src/seller/listings.{controller,service}.ts`,
  maker-only) — full CRUD over `Product` rows scoped to
  `vendorId === seller.vendorId`. Validates `categoryId`/`occasionIds`
  exist and every `weightOptions[].sku` is globally unique (`409` on
  clash) before writing; `slug` server-generated. Unlike the
  consumer-facing catalog, price/stock fields *are* caller-supplied here
  deliberately — it's the seller pricing their own listing, not a buyer's
  request being trusted. `DELETE` → `409` if the product still has
  order/cart/wishlist/hamper references (FK-protected).
- **Orders** (`server/src/seller/orders.{controller,service}.ts`,
  maker-only) — `GET /seller/orders[/:id]` (any order with ≥1 item from
  my vendor), `POST /seller/orders/:id/advance` advancing `placed →
  confirmed → packed → shipped → delivered` one step per call, `409` at a
  terminal or still-unpaid (`pending-payment`) status.
- **Reviews** (`server/src/seller/reviews.{controller,service}.ts`,
  maker-only) — `GET /seller/reviews` (reviews targeting my vendor or any
  of my products), `POST /seller/reviews/:id/reply` — ownership resolved
  by the review's *target* (vendor id or the target product's vendor),
  not a direct FK.
- **Bookings** (`server/src/seller/bookings.{controller,service}.ts`,
  laundry-partner-only) — `GET /seller/bookings[/:id]` scoped to
  `partnerId === seller.id`, `POST /seller/bookings/:id/advance`
  advancing `scheduled → picked-up → in-progress → out-for-delivery →
  delivered`.
- **Menu** (`server/src/seller/menu.{controller,service}.ts`,
  snack-seller-only) — full CRUD over `Snack` rows scoped to
  `sellerId === seller.id`, same unique-slug/price-is-caller-supplied
  reasoning as Listings. `DELETE` → `409` if still referenced by a
  snack-list/order line.
- **Snack orders** (`server/src/seller/snack-orders.{controller,service}.ts`,
  snack-seller-only) — `GET /seller/snack-orders[/:id]`, `POST
  /seller/snack-orders/:id/advance` advancing `received → accepted →
  out-for-delivery → delivered`. Completes the M8.3a-flagged seam
  (`SnackOrder` reads were noted as pending this milestone).
- **Payouts** (`server/src/seller/payouts.{controller,service}.ts`, all 3
  types) — `GET /seller/payouts` → `{ items, summary, pendingBalance }`;
  `POST /seller/payouts/request` computes the pending balance
  **server-side** from the seller's own *delivered* records (maker: Σ
  `OrderItem.price×quantity` for my vendor's items on delivered orders;
  laundry: Σ `LaundryBooking.estimatedTotal` for my delivered bookings;
  snack: Σ `SnackOrder.total` for my delivered orders) minus everything
  already recorded in `Payout`, and inserts a new `pending` row — `400`
  if there's nothing to pay out, `409` if one's already pending. `Payout`
  is its own ledger row here, not a `WalletTransaction` — no money
  actually moves in this milestone, per the brief (a real payout-provider
  integration + admin "mark paid" is a later seam). Supports
  `Idempotency-Key`.
- **`server/src/seller/mappers/`** — `mapPayout`, `mapSnackOrder` (+
  `snackOrderStatusToFrontend`, same declared-identifier-vs-`@map`'d-DB-value
  reasoning as `laundry.mapper.ts#bookingStatusToFrontend`). Listings/
  orders/reviews/bookings/menu reuse the existing catalog/orders/reviews/
  laundry/snacks mappers rather than duplicating them.
- **Docs** — `docs/API.md` gained the full "Seller portal (M8.3b)"
  contract and a `lib/api/seller.ts` mock→real mapping table; updated the
  Snacks section's `SnackOrder` note and the top-of-file/"Not yet
  stubbed" milestone summary.

### Verification

Verified live via curl against the seeded local Postgres, one demo
account per seller type (`Passw0rd!123`): **maker** (`anjali@
anjaliskitchen.example`) — dashboard; created/read/patched/deleted a real
listing (confirmed gone via a follow-up `404`); advanced a real order
`placed → confirmed → packed` then a second order `shipped → delivered`;
patched the storefront bio/location; replied to a product review and a
vendor review. **Laundry partner** (`ravi@freshfoldlaundry.example`) —
dashboard; advanced a booking `scheduled → picked-up`. **Snack seller**
(`meera@meerassnackbox.example`) — dashboard; created/patched/deleted a
menu item; advanced a snack order `received → accepted`. **Payouts** —
listed existing seed payouts + computed `pendingBalance`; a request
against an already-`pending` seeded payout → `409`; cleared payout
history for the maker via direct DB manipulation (test-only) and
confirmed a fresh request computes the real delivered-order total (₹899,
matching the order just advanced to `delivered`) and inserts it, then a
second immediate request → `409` (one in flight at a time).

**Cross-seller isolation** (the critical part) — registered 3 fresh
accounts, flipped each to `role: "seller"` with a `Seller` row of a
different owner (maker → a second vendor; laundry/snack → no vendor) via
direct DB insert (no self-serve seller signup exists yet), logged in for
fresh JWTs, then confirmed every one of these returned `404` and left the
target row unchanged: seller B reading/patching/deleting seller A's
listing; seller B reading/advancing seller A's order; seller B replying
to a review on seller A's product and on seller A's vendor; a second
laundry partner reading/advancing seller A's booking (and their own
`GET /seller/bookings` correctly listed empty, not seller A's rows);
a second snack seller reading/patching/deleting seller A's menu item and
reading/advancing seller A's snack order (own menu list correctly empty).
Also confirmed: a laundry-partner token on `/seller/listings` (maker-only)
→ `403`; a snack-seller token on `/seller/bookings` (laundry-only) → `403`;
a maker token on `/seller/menu` (snack-only) → `403`; a `consumer` token
and an `admin` token on `/seller/dashboard` → `403` for both; no token →
`401`. `npm run build` and `npm run lint` both clean; app boots and
serves all new routes. Database reseeded to the canonical demo state
afterward (`npm run prisma:seed`) — none of the isolation-test fixtures
persist.

### Seam left for M8.3c + M8.4

**M8.3c** (admin): every seller/order/booking/payout/menu view above,
unscoped — an admin needs to see *all* sellers' data, not just their own,
plus approve `SellerApplication`s and mark a `Payout` `paid`. None of
that is built here; `SellerService.resolveSeller`'s pattern (re-derive
from a verified session, never a client-supplied id) is the seam an admin
module reuses with `assertAdmin` instead of `assertOwnSellerScope`.
**M8.4**: `client/lib/api/seller.ts`'s function bodies swap to real
`fetch()` calls — every function's `vendorId`/`sellerId` first argument
becomes unnecessary (the real endpoints resolve it from the session) and
should be dropped at the call sites in `client/app/seller/**`/
`client/components/seller/**`; `advanceSellerOrderStatus`'s bare
`orderId` argument stays as-is (already matches the real endpoint 1:1).

## [M8.3a] — Services API (server/) — 2026-07-27

Laundry, snacks, referrals/loyalty, notifications, support and corporate —
six new modules on top of M8.0–M8.2's foundation/commerce/wallet, plus the
`GET /orders/history` merge extended to include laundry bookings. Every
money movement (wallet-pay a laundry booking, apply a referral credit)
routes through `WalletService.postLedgerEntryTx`, the same M8.2 ledger
primitive `OrdersService` uses — nothing here writes `Wallet.balance`
directly. Verified live against the seeded local Postgres — see
"Verification" below. `client/`, `handoff/`, root `app/`, root
`CLAUDE.md` untouched; no commits made by this milestone.

### Added

- **Laundry module** (`server/src/laundry/`) — `GET /laundry/services[/:slug]`,
  `GET /laundry/availability/{days,slots}` (`@Public()`); `GET`/`POST
  /laundry/bookings`, `GET /laundry/bookings/:id`, `GET`/`POST
  /laundry/subscriptions`, `GET`/`PATCH`/`DELETE /laundry/subscriptions/:id`
  (owner-scoped). Booking price is **server-authoritative**:
  `LaundryService.price` × the quantity field matching the service's
  `pricingModel` (`per-kg`/`per-item`/`per-hour`), computed inside the
  request's own transaction — the create DTO has no `price`/`estimatedTotal`
  field, so `ValidationPipe`'s `forbidNonWhitelisted` rejects any
  client-submitted amount. `paymentMethod: "wallet"` debits the computed
  total and credits cashback atomically with the booking insert (no
  `pending-payment` staging status for laundry, unlike marketplace orders
  — the debit happens inline, not via a separate `/pay` call);
  insufficient balance → `402`, whole transaction rolls back (booking
  never created). Supports `Idempotency-Key`. Auto-assigns bookings to the
  one seeded demo laundry partner (real pickup-based dispatch is M9/M10b).
- **Snacks module** (`server/src/snacks/`) — `GET /snacks[?category=]`,
  `GET /snacks/:slug` (`@Public()`). Menu reads only — consumer ordering
  stays WhatsApp-only per `lib/channel.ts`; deliberately no order-creation
  endpoint. `SnackOrder` (seller-side WhatsApp-order record) is seamed for
  M8.3b (read) / M9 (real WhatsApp Cloud API ingestion writes the rows).
- **Referrals + loyalty module** (`server/src/referrals/`) — `GET
  /referrals/code`, `GET /referrals`, `POST /referrals/:id/apply-credit`,
  `GET /loyalty` (owner-scoped). `apply-credit` targets one referral id
  (a deliberate shape change from the client mock's argument-less
  auto-pick — flagged in `docs/API.md` for the M8.4 call-site update),
  credits `REFERRAL_REWARD_AMOUNT` (₹250) via the wallet ledger
  (`category: "referral"`), and is **once-only per referral**: an
  already-`rewarded` referral → `409`, checked by re-reading the row
  inside the same transaction as the ledger write.
- **Notifications module** (`server/src/notifications/`) — `GET`/`PATCH
  /notifications/preferences[/:category]`, `GET /notifications`, `PATCH
  /notifications/:id/read` (owner-scoped). Lazily backfills any of the 6
  `NotificationCategory` preference rows a user doesn't have yet. Actual
  delivery (SMS/WhatsApp/email) stays M9 — persist + read only.
- **Support module** (`server/src/support/`) — `POST`/`GET
  /support/tickets`, `GET /support/tickets/:id`, `POST
  /support/tickets/:id/messages` (owner-scoped). `sender` on a new message
  is derived from the caller's own role (`agent` for admin, `user`
  otherwise), never client-supplied.
- **Corporate module** (`server/src/corporate/`) — `POST
  /corporate-inquiries` (`@Public()` — `CorporateInquiry` has no `userId`
  FK, an inquiry may predate an account). No list/review endpoint yet
  (seamed for M11 admin panel).
- **Unified order history extended** (`server/src/orders/order-history.util.ts`,
  `orders.service.ts`) — `GET /orders/history` now merges marketplace
  `Order`s and `LaundryBooking`s into one newest-first list (`kind:
  "order"` \| `"laundry"`), matching `client/lib/api/history.ts`'s mock
  merge exactly. `SnackOrder` is **not** merged — it has no `userId` FK
  (WhatsApp-origin, seller-scoped only per `client/lib/types/food.ts`'s
  own doc comment), so there's no "my snack orders" to fold in; flagged
  as an intentional deviation from the brief's literal wording for
  Opus/Opus-review to confirm.
- **Docs** — `docs/API.md` gained the full "Services (M8.3a)" contract
  (laundry, snacks, referrals/loyalty, notifications, support, corporate,
  the history merge) and updated the Snacks/Laundry/"Not yet stubbed"
  placeholder tables from M0-era to real-endpoint status.

### Verification

Verified live via curl against the seeded local Postgres (`user-demo`,
`Passw0rd!123`): `GET /laundry/services|availability/*` (public);
`POST /laundry/bookings` COD (per-kg, 3kg × ₹79 = ₹237, server-computed)
and wallet (per-item, 4 × ₹99 = ₹396 debited + ₹20 cashback credited,
wallet balance 1522 → 1146 exactly); retried the wallet booking with the
same `Idempotency-Key` — identical booking returned, balance unchanged;
an oversized wallet booking (₹49,900) → `402`, confirmed **not** created
via a follow-up list call; subscription create/list/update (pause);
owner-isolation on a booking (a second account → `404`, not `403` or
`200`); `GET /snacks` (6 items) and `?category=sweet` filter; referral
`apply-credit` on a `"joined"` referral → wallet `+250` exactly (1146 →
1396), second apply on the same id → `409`, apply on an
already-`"rewarded"` seed referral → `409`, cross-account apply on
someone else's referral → `404`; notification preferences (6-category
lazy backfill for a user with none), preference patch, inbox list,
mark-read, cross-account mark-read → `404`; support ticket create +
list + add-message (`updatedAt` bump confirmed), cross-account ticket
read → `404`; public `POST /corporate-inquiries` with no auth header;
`GET /orders/history` returning 24 merged entries (16 `order` + 8
`laundry`, correctly interleaved by date); every owner-scoped route
rejected an unauthenticated request `401`. `npm run build` and `npm run
lint` both clean; app boots and serves all new routes.

### Seam left for M8.3b + M9

**M8.3b** (seller/admin views over this same data): a laundry partner's
pickup queue, a snack seller's `SnackOrder` inbox, admin-unscoped support
queue / corporate inquiry review / referral moderation — none of that is
built here, only the consumer-facing side. **M9** (WhatsApp Cloud API +
notification delivery): nothing in this milestone sends a real
SMS/WhatsApp/email; notifications/preferences are persist-and-read only,
and `SnackOrder` rows are still seeded, not written from real inbound
WhatsApp messages.

## [M8.2] — Wallet + Payments (server/) — 2026-07-27

Server-authoritative wallet ledger and Razorpay integration — the
money-critical milestone. Closes the M8.1 `pending-payment` seam: a
`paymentMethod: "wallet"` order is now actually paid (`POST
/orders/:id/pay`) and a `paymentMethod: "razorpay"` order actually
captures (`POST /payments/razorpay/order` + a verified webhook). Every
balance mutation is row-locked and computes `balanceAfter` server-side;
every money-mutating endpoint supports an `Idempotency-Key` for
retry/double-submit safety. Verified live against the seeded local
Postgres — see "Verification" below. `client/`, `handoff/`, root `app/`,
root `CLAUDE.md` untouched; no commits made by this milestone. Seller
payouts (M8.3) stay explicitly out of scope.

### Added

- **Wallet module** (`server/src/wallet/`, owner-scoped) — `GET /wallet`,
  `GET /wallet/transactions`, `GET`/`PUT /wallet/auto-topup`, `POST
  /wallet/adjust` (`@Roles('admin')`, caller-supplied amount+reason —
  the one intentional exception to "never trust a client amount", since
  it's role-gated and exists for support cases). Deliberately **no**
  `POST /wallet/topup`/`/pay`/`/earn-cashback`/generic `/refund` endpoint
  — every real credit/debit instead derives its amount from a DB row or a
  verified Razorpay webhook (see `docs/API.md`'s "Wallet & Payments
  (M8.2)" for the full reasoning).
- **`WalletService.postLedgerEntryTx`** (`server/src/wallet/wallet.service.ts`)
  — the single write primitive for every ledger mutation in the app.
  Locks the wallet row (`SELECT ... FOR UPDATE` via raw SQL inside the
  open `Prisma.TransactionClient`), reads the current balance, computes
  `balanceAfter` server-side, appends the `WalletTransaction`, updates
  `Wallet.balance` — atomically. Rejects a debit that would go negative
  with `402`. Fires the wallet's `below-threshold` auto-top-up rule (if
  enabled) immediately after a qualifying debit, mirroring
  `client/lib/wallet/WalletContext.tsx#pay`'s reactive-only firing.
- **Idempotency** (`server/src/common/idempotency/`) — `IdempotencyService.run`
  wraps a money-mutating op in a transaction that claims a unique
  `(userId, scope, key)` row before running the op and stamps it with the
  result before committing; a concurrent/retried duplicate call loses the
  DB-level unique-insert race and returns the first call's cached result
  instead of re-running — no polling, no separate lock. Read via the
  `Idempotency-Key` header (`@IdempotencyKey()` param decorator, header
  or `idempotencyKey` body-field fallback) on `POST /wallet/adjust`,
  `POST /orders/:id/pay`, `POST /orders/:id/refund`.
- **Payments module** (`server/src/payments/`) — `POST
  /payments/razorpay/order` (opens a Razorpay order for an existing
  `Order`'s DB-read total or a declared top-up amount; mints a local
  `order_mock_<uuid>` when `RAZORPAY_KEY_ID`/`_SECRET` are still the
  `.env.example` placeholders, so the flow is fully exercisable without a
  live Razorpay account — the real `fetch`-based API call path
  (`razorpay.client.ts`, no SDK dependency) still exists and takes over
  once real keys are set) and `POST /payments/razorpay/webhook`
  (`@Public()` — verifies `X-Razorpay-Signature` as HMAC-SHA256 over the
  **raw** request body, keyed with `RAZORPAY_WEBHOOK_SECRET`,
  `crypto.timingSafeEqual` comparison, **before** touching any state; an
  invalid/missing signature is `400` with nothing evaluated further; only
  acts on `payment.captured`, deduped by `(event, paymentId)` via a
  `WebhookEvent` unique-insert, then credits a wallet top-up (+3% bonus
  above ₹2,000) or transitions the linked `Order`
  `pending-payment -> placed` + credits cashback, depending on the
  `RazorpayOrder` row's `purpose`).
- **`server/src/main.ts`** — `NestFactory.create(AppModule, { rawBody:
  true })` so `req.rawBody` (the pre-JSON-parse byte buffer) is available
  to the webhook handler for signature verification, while every other
  route keeps parsing `req.body` normally.
- **Orders module extended** (`server/src/orders/`) — `POST
  /orders/:id/pay` (wallet-pay: debits the wallet for `order.total`,
  credits `order.cashbackEarned`, transitions `pending_payment -> placed`,
  atomically; `402` + order untouched on insufficient balance) and `POST
  /orders/:id/refund` (`@Roles('admin')`; credits the order owner's
  wallet for `order.total`, sets `refundStatus: "refunded"`; idempotent
  both via the optional key and via an "already refunded" short-circuit).
  `OrdersService.markPaidByRazorpayTx` is the tx-scoped primitive the
  webhook handler calls for the Razorpay path.
- **Schema additions** (`server/prisma/migrations/20260727033808_m8_2_wallet_payments/`)
  — three new tables with no `lib/types` counterpart (server-only, same
  pattern as `RefreshToken`/`PhoneOtp`): `IdempotencyKey`, `WebhookEvent`,
  `RazorpayOrder` (+ `RazorpayOrderPurpose`/`RazorpayOrderStatus` enums).
  Applied against the real local Postgres.
- **Docs** — `docs/API.md` gained the full "Wallet & Payments (M8.2)"
  contract (idempotency, wallet endpoints, Razorpay order+webhook) and
  updated the M8.1-era "Seam for M8.2" note to reflect it's now closed;
  `docs/ARCHITECTURE.md` gained a "Payment & ledger flow (M8.2)" section
  (the row-lock/idempotency/webhook-verification design in full) and
  updated its security-model bullets from "planned" to "real as of M8.2";
  `docs/DATA-MODEL.md`'s M8.1–M8.3 notes section updated to record the
  wallet-write path landing + the three new tables.

### Verification

Verified live via curl against the seeded local Postgres (see the
milestone's report for full transcripts): top-up via a signed
`payment.captured` webhook (3% bonus above ₹2,000 applied correctly,
`balanceAfter` correct at every step); wallet-pay of an M8.1
`pending-payment` order (debit + cashback + `placed` transition, all in
one call); insufficient-balance pay rejected `402`, order and balance
both unchanged; idempotency replay (`POST /orders/:id/pay` and `POST
/wallet/adjust` called twice with the same key — second call returns the
identical cached result, balance unchanged, exactly one ledger row per
op); invalid webhook signature rejected `400` with no state change;
webhook redelivery (same event replayed) acknowledged as a duplicate, not
reapplied; **two concurrent `POST /orders/:id/pay` calls** whose combined
total exceeded the wallet balance — exactly one succeeded, the other got
a clean `402`, final balance reflected exactly one debit (no negative
balance, no double-spend); admin-only `/wallet/adjust`/`/orders/:id/refund`
correctly `403` for a non-admin caller; Razorpay order-purpose payment
(mock order + signed webhook) transitioned the order to `placed` and
credited only cashback, no wallet debit. `npm run build` and `npm run
lint` both clean.

### Seam left for M8.3

Seller payouts: `Seller`/`Payout` tables exist (M8.0) but nothing credits
a seller's payout ledger from a captured payment — a distinct flow
(platform share vs. a specific seller's share of a line item) not
implemented or stubbed here. Also left open (flagged in `docs/API.md`):
no failure/cancellation path yet that restocks an abandoned
`pending-payment` order's held `WeightOption.stock`.

## [M8.1] — Commerce API (server/) — 2026-07-27

Builds the Gifting Marketplace's real endpoints on top of M8.0's
foundation: catalog browse, reviews, wishlist, cart, and orders —
DTO-validated, owner-scoped, with server-authoritative pricing
everywhere. Verified end to end against the seeded local Postgres,
including cross-user isolation. `client/`, `handoff/`, root `app/`, root
`CLAUDE.md` untouched; no commits made by this milestone. Wallet/Razorpay
payment capture (M8.2) and laundry/snacks/seller/admin (M8.3) stay
explicitly out of scope — this milestone exposes the seam for both
instead of implementing either.

### Added

- **Catalog module** (`server/src/catalog/`, all `@Public()` — Marketplace
  browse is anonymous per `lib/channel.ts`) — `GET /products` (filters:
  `category`/`occasion`/`vendor` by comma-separated slug,
  OR-within/AND-across; `dietary` by comma-separated frontend tag;
  `featured`; `minPrice`/`maxPrice` against the `defaultWeightSku` price;
  `sort` = `most-loved`\|`price-asc`\|`price-desc`; `page`/`pageSize` —
  mirrors `ShopClient.tsx`'s filter/sort semantics exactly), `GET
  /products/:slug` (no `hidden` filter — direct-link/cart/order/wishlist
  resolves must still work), `GET /vendors`, `GET /vendors/:slug`, `GET
  /vendors/:slug/products`, `GET /categories(/:slug)`, `GET
  /occasions(/:slug)`, `GET /collections(/:slug)` (`productIds` ordered by
  `CollectionProduct.sortOrder`), `GET /hamper/boxes`.
- **`DietaryTag`/`OrderStatus` wire-format conversion**
  (`src/catalog/dietary-tag.util.ts`, `src/orders/order.mapper.ts`) —
  Prisma enum members with a `@map`'d hyphenated DB value (e.g.
  `gluten_free` → `"gluten-free"`) still come back from Prisma Client as
  the underscored identifier at runtime; every JSON response converts to
  the frontend's hyphenated form so the wire format matches
  `client/lib/types/*.ts` exactly.
- **Reviews module** (`server/src/reviews/`) — `GET /reviews?targetType=&
  targetId=` (public, excludes moderator-hidden), `POST /reviews` (authed
  — `targetType` `product`\|`vendor`\|`service`, rating 1–5; server sets
  `userId`/`userName` from the session and computes `verifiedPurchase`
  from the caller's own non-cancelled orders; `service` targets validate
  against `LaundryService` today and always read `verifiedPurchase:
  false`, an explicit M8.3 seam).
- **Wishlist module** (`server/src/wishlist/`, owner-scoped) — `GET
  /wishlist` (lazily creates an empty row), `POST /wishlist/items`
  (idempotent upsert), `DELETE /wishlist/items/:productId`.
- **Cart module** (`server/src/cart/`, owner-scoped) — `GET /cart` (richer
  than the frontend `Cart` type: every line resolved server-side to
  name/unitPrice/lineTotal/weightLabel/maxQuantity via the shared
  `resolveCartLine` helper, plus cart-level subtotal/shipping/total/
  cashback estimate), `POST /cart/items` (add-or-increment, stock-capped),
  `POST /cart/hamper-items` (creates a real `Hamper` row + one
  `CartItem{hamperId}` line — the product-or-hamper polymorphic line,
  mirroring `CartContext`), `PATCH /cart/items/:id`, `DELETE
  /cart/items/:id`, `POST /cart/items/:id/address` (must be one of the
  caller's own addresses), `DELETE /cart`. Every mutation re-derives
  ownership from the parent cart's `userId`, never a client-submitted id.
- **Orders module** (`server/src/orders/`, owner-scoped) — `POST /orders`
  creates an order from the caller's **current `Cart`**: every line's
  price is recomputed fresh from `WeightOption.price`/`HamperBox.price`
  (never read from the request body — the DTO has no price field, and an
  extra one is rejected by `forbidNonWhitelisted`), **snapshotted onto
  `OrderItem.price`** so the order can't drift from a later catalog price
  change, stock is checked then re-checked+decremented atomically inside
  the creation `$transaction` (closes the two-concurrent-requests race),
  `OrderShipment`s are built per distinct address with per-address
  delivery dates, gift-to-recipient ships the whole order to one of the
  caller's own saved addresses (`giftRecipientAddressId`). New orders
  start at **`status: "pending-payment"`** (a new `OrderStatus` enum
  value/migration this milestone adds) — no money moves here, that's the
  M8.2 seam (see below). Also: `GET /orders` (own orders, paginated), `GET
  /orders/:id` (owner-scoped, 404 not 403 for someone else's order), `GET
  /orders/history` (`client/lib/api/history.ts#getOrderHistory`'s unified
  shape, marketplace orders only — the M8.3 seam for merging in laundry/
  snack bookings).
- **`server/prisma/migrations/20260727031017_add_order_pending_payment_status/`**
  — additive: adds `OrderStatus.pending_payment` (`@map("pending-payment")`)
  for the M8.2 payment-capture seam. Applied against the real local
  Postgres.
- **Shared pricing utilities** (`server/src/common/pricing/`) —
  `pricing.util.ts` ports `client/lib/cart/pricing.ts`'s
  `computeShipping`/`computeCashback` verbatim (flat ₹49 shipping under
  ₹999, free at/above; flat 5% cashback, rounded); `resolve-cart-line.ts`
  is the one place a `CartItem` (product-or-hamper) is resolved to
  display+pricing data — both `CartService.getCart` and
  `OrdersService.create` call it, so a cart preview and what's actually
  charged can never disagree.
- **Docs** — `docs/API.md` gained the full "Commerce (M8.1)" contract
  (every new endpoint, request/response shapes, the pricing/snapshotting
  writeup, the M8.2 and M8.3 seam callouts, and a "Response-shape notes
  for M8.4" section flagging what the client swap needs to know); the
  pre-M8.1 mock-layer tables updated to point at the real endpoints;
  `server/README.md` gained an M8.1 commerce curl walkthrough and updated
  security-measures/seams sections.

### Verified (see `server/README.md`'s curl walkthrough for the commands)

- `npm run build` + `npm run lint` clean; app boots.
- Browse: `GET /products?category=pickles&sort=price-asc` returns
  correctly filtered+sorted results with `price`/`rating`/etc. as real
  numbers (not Prisma `Decimal` strings); `dietary`/`featured`/pagination
  filters all confirmed; `GET /products/:slug` and `404` on an unknown
  slug both confirmed.
- Cart: adding/updating/removing lines recomputes `subtotal`/
  `shippingFee`/`total`/`cashbackEstimate` correctly every time; adding
  past `WeightOption.stock` → `400`; a hamper line (`POST
  /cart/hamper-items`) prices correctly as `HamperBox.price` + sum of its
  items' default-weight prices.
- Orders: a multi-address order recomputed `subtotal`/`shippingFee`/
  `cashbackEarned`/`total` correctly from fresh DB prices (verified by
  hand against the cart contents at order time, independent of what the
  cart previously showed), `OrderItem.price` confirmed snapshotted,
  `OrderShipment` rows built per distinct address with the right
  `deliveryDate`, `WeightOption.stock` confirmed decremented by exactly
  the ordered quantity, the cart confirmed emptied after order creation,
  status confirmed `"pending-payment"`. An extra `price` field on the
  request body confirmed rejected (`400 VALIDATION_ERROR`, "property
  price should not exist") — proves the server never trusts a
  client-submitted amount. A gift order to an address not owned by the
  caller, and an order attempted with an empty cart, both confirmed
  `404`/`400` respectively.
- **Cross-user isolation**: a second registered account confirmed to get
  its own empty `Cart` (never user-demo's) from `GET /cart`; confirmed
  `404` (not the order) on `GET /orders/:id` for user-demo's order id;
  confirmed `404` (not the item) attempting `PATCH`/`DELETE` on
  user-demo's `CartItem` ids; confirmed `404` attempting to place an
  order using user-demo's address id as `defaultAddressId`; confirmed its
  own `GET /orders`/`GET /wishlist` both come back empty rather than
  showing user-demo's data.
- Wishlist add/remove confirmed idempotent and owner-scoped. Review
  creation confirmed `verifiedPurchase: true` immediately after ordering
  the reviewed product, and correctly rejects (`404`) a review for a
  nonexistent product/vendor/service id.

### Notes / follow-ups

- **M8.2 seam**: `Order.status` starts at `"pending-payment"`;
  `walletApplied` records payment-method intent only (no debit, no
  balance check) — M8.2 owns the actual wallet debit / Razorpay capture,
  the `pending_payment` → `placed` transition (or a restocking failure
  path), and wallet-balance-sufficiency validation.
- **M8.3 seam**: `GET /orders/history` returns marketplace orders only;
  laundry/snack bookings should merge into the same
  `OrderHistoryEntry`-shaped list. `targetType: "service"` reviews always
  read `verifiedPurchase: false` pending `LaundryBooking`-based
  verification.
- **M8.4 (client swap) heads-up**: `GET /cart`'s response is richer than
  the frontend `Cart` type (server-resolved line display/pricing fields +
  cart-level totals) — recommended the client drop `CartContext.lineInfo()`
  entirely and read the server's numbers directly. `OrderStatus` needs a
  `"pending-payment"` member added to `client/lib/types/marketplace.ts`
  before rendering a real order. Gift orders now need a real
  `recipientAddressId` from the caller's address book, not the mock
  checkout's synthetic `"gift-recipient"` string — full detail in
  `docs/API.md`'s "Response-shape notes for M8.4" section.

## [M8.0] — Backend foundation (server/) — 2026-07-27

Scaffolds the standalone backend API (`server/`, NestJS + Prisma +
Postgres), authors the full domain schema (every entity in
`client/lib/types/*.ts` becomes a real Prisma model), and lands one real
vertical slice — JWT auth (email+password, phone OTP, stub social) + RBAC
+ a Users/Addresses resource — proven end to end against a real local
Postgres. Domain endpoints for every other module (catalog, cart, orders,
wallet, laundry, snacks, seller, admin) are explicitly **out of scope**
for this milestone: their Prisma models exist so M8.1–M8.3 only need to
add controllers/services, never new tables. `client/`, `handoff/`, and
root `app/` are untouched.

### Added

- **NestJS scaffold** (`server/package.json`, `tsconfig*.json`,
  `nest-cli.json`) — own build (`nest build`), dev server (`nest start
  --watch`), no shared tooling with `client/`.
- **`server/docker-compose.yml`** — `postgres:16` for local dev. Also
  verified against a plain (non-Docker) local Postgres 15 install, since
  Docker wasn't available in the environment this milestone was built in
  — see `server/README.md`'s setup section for both paths.
- **`server/.env.example`** — every env var annotated (`DATABASE_URL`,
  `JWT_ACCESS_SECRET`/`_TTL`, `JWT_REFRESH_SECRET`/`_TTL`, OTP config,
  `RAZORPAY_KEY_ID`/`_SECRET`/`_WEBHOOK_SECRET` placeholders reserved for
  M8.2, throttle config, `CLIENT_ORIGIN`). No real secrets committed —
  covered by the repo root `.gitignore`'s unanchored `.env*` rule.
- **`server/prisma/schema.prisma`** — 43 models translating every entity
  in `client/lib/types/*.ts` (`shared`/`wallet`/`marketplace`/`laundry`/
  `food`/`seller`) into Postgres tables, plus 3 auth-infrastructure models
  with no frontend counterpart (`RefreshToken`, `PhoneOtp`,
  `SocialAccount`) and one new model the mock never backed
  (`VendorFollow`, for `Vendor.isFollowing`). 34 enums mirror every TS
  union 1:1, `@map`-ing hyphenated literals (`"per-kg"`, `"in-progress"`,
  etc.) so the DB round-trips the exact string the frontend contract
  expects. See `docs/DATA-MODEL.md`'s new "M8.0 Prisma mapping" section
  for the full model list and every TS→Prisma modeling decision
  (id-array many-to-manys → real join tables, `CartItem`/`OrderItem`
  polymorphism, `OrderGift`/`pickupSlot`/`deliverySlot` embedded-object
  flattening, `Decimal` money columns, etc.).
- **`server/prisma/migrations/20260727024657_init/`** — generated and
  **applied against a real local Postgres** (`prisma migrate dev`).
- **`server/prisma/seed.ts`** — ports `client/lib/data/*.ts` into
  Postgres: all 5 demo accounts (consumer + 3 seller types + a new admin
  account, since the frontend mock has none seeded yet — see that file's
  doc comment), addresses, wallet + full ledger, 8 vendors, 8 products
  (images/weight options/occasion joins), 30 reviews (with lightweight
  reviewer-only `User` rows), cart/wishlist/hamper boxes, 3 sellers + 9
  payouts, 9 orders with items + shipments, 4 laundry services + 6
  bookings, 6 snacks + a snack list + 4 snack orders, notifications +
  preferences, referrals + loyalty, a support ticket, a corporate
  inquiry, and 4 seller applications. Idempotent — clears every table it
  owns before re-inserting. Verified against real Postgres: seeded row
  counts confirmed via `psql`.
- **Auth module** (`server/src/auth/`) — `POST /auth/register` (email+
  password, **argon2**-hashed), `POST /auth/login`, `POST
  /auth/otp/request`/`/verify` (phone OTP, argon2-hashed codes, stub
  sender that logs to the server console pending a real SMS/WhatsApp
  provider at M9), `POST /auth/social/:provider` (stub — trusts a
  client-submitted profile payload instead of verifying a real OAuth
  token, flagged inline), `POST /auth/refresh` (**rotating** — the
  presented refresh token is revoked and replaced atomically; reusing an
  already-rotated token is rejected, the standard reuse-detection
  signal), `POST /auth/logout`. JWT payload carries `{ sub: userId, role,
  sellerId? }`.
- **RBAC** (`server/src/common/`) — global `JwtAuthGuard` +
  `@Public()` opt-out; `RolesGuard` + `@Roles(...)` decorator; ownership-
  scoping helpers (`assertOwnUserScope`/`assertOwnSellerScope`/
  `assertAdmin`, `common/scoping/ownership.util.ts`) ready as the seam
  every M8.1–M8.3 seller/admin query must route through.
- **Users module** (`server/src/users/`) — `GET`/`PATCH /users/me`,
  full address CRUD (`GET`/`POST /users/me/addresses`, `PATCH`/`DELETE
  /users/me/addresses/:id`, `POST /users/me/addresses/:id/default`) —
  every address mutation resolves ownership from the verified JWT, 404s
  on someone else's address rather than leaking existence. A minimal
  `@Roles('admin') GET /users/:id` proves `RolesGuard` end to end against
  a real resource (not a throwaway diagnostic route).
- **Platform hardening** — global `ValidationPipe` (whitelist +
  reject-unknown-fields + transform), `helmet()`, CORS allow-list
  (`CLIENT_ORIGIN`), `@nestjs/throttler` (global default + a tighter
  `@Throttle` override on every `/auth/*` route — verified to actually
  return `429` after repeated login attempts), a global exception filter
  normalizing every error to `{ error: { code, message } }`, `/health` +
  `/health/db` (liveness/readiness, unauthenticated), fail-fast env
  validation (`src/config/env.validation.ts` — refuses to boot with
  placeholder secrets once `NODE_ENV=production`).
- **Docs** — `server/README.md` rewritten (setup, curl walkthrough,
  security measures, seams for M8.1–M8.3, credentials the user still
  needs to supply); `docs/API.md` gained the real auth+users endpoint
  contract, error envelope, and auth model; `docs/DATA-MODEL.md` gained
  the "M8.0 Prisma mapping" section; `docs/ARCHITECTURE.md` gained a
  "Backend (M8.0)" section (why JWT not Auth.js, request/auth flow) and
  an updated security model section; `docs/adr/0002-backend-stack.md`
  (NestJS + Prisma + Postgres + JWT decision record).

### Verified (see `server/README.md`'s curl walkthrough for the commands)

- `npm install` + `npm run build` clean; app boots (`start:prod`) with
  `/health` and `/health/db` both `200`.
- Local Postgres **was** reachable (Homebrew Postgres 15, no Docker in
  this environment) — `prisma migrate dev` applied a real migration,
  `prisma:seed` populated it, and `GET/PATCH /users/me` +
  full address CRUD were exercised against those real rows.
- Login → access+refresh; `/users/me` with no token → `401`; with a
  garbage token → `401`; consumer hitting the admin-only route → `403`;
  admin hitting it → `200`. Refresh rotation confirmed (old token
  rejected after rotating); logout confirmed (refresh revoked,
  previously-issued access token still valid until natural expiry, by
  design). Repeated `/auth/login` attempts confirmed to `429` under the
  throttler.

### Notes / follow-ups

- Seams for M8.1 (commerce), M8.2 (wallet/Razorpay), M8.3 (services/
  roles), and M8.4 (the `client/lib/api` mock→real swap) are documented
  in `server/README.md`.
- Needs real credentials before going further than local dev: a managed
  `DATABASE_URL`, real `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, a real
  SMS/WhatsApp OTP provider, real Google/Apple OAuth app credentials, and
  real Razorpay test-mode keys — all flagged in `server/README.md`'s
  final section.

## [M11b] — Admin panel: moderation, wallet/refunds, CMS, analytics — 2026-07-26

Completes the admin surface M11a scaffolded: enables the 4 "Soon" nav
slots (Catalog, Wallet, Collections, Analytics) as real, functional
modules, closes the M11a orders-oversight refund stub, and wires the
home page's promo bands into a real admin-editable config. M8 (real
backend/RBAC, server-authoritative wallet ledger, audit log) is still
explicitly out of scope — every write below is a session-scoped mock
mutation, same convention as every other pre-M8 data layer.

### Added

- **`/admin/catalog` + `/admin/catalog/[id]`** (`CatalogClient`/
  `ProductModerationRow`/`AdminListingEditorClient`) — every `Product`
  across every vendor, unscoped, search + vendor/status filters.
  Approve/hide/flag/feature actions (`lib/api/admin.ts#moderateProduct`)
  mutate a new `Product.moderationStatus?` field (`active`\|`hidden`\|
  `flagged`, absent reads as `active`) and `Product.featured?`
  (`lib/types/marketplace.ts`). `lib/api/products.ts`'s browse/listing
  getters now filter out `"hidden"` products, and `getFeatured()` derives
  from `.featured` (seeded on the same 4 products the old hardcoded
  `featuredProducts` list picked) instead of a hardcoded id array. Full
  edit reuses `components/seller/ListingForm.tsx` verbatim (a pure
  props-driven form, no seller-shell coupling) via a new
  `updateProductAdmin` — the unscoped sibling of `updateSellerListing`.
- **`/admin/catalog/reviews`** (`CatalogReviewsClient`/`AdminReviewRow`)
  — every `Review` (product + vendor), a flagged queue, hide/unhide.
  `Review` gained `flagged?`/`hidden?` (`lib/types/shared.ts`);
  `lib/api/reviews.ts#getProductReviews`/`getVendorReviews` now filter
  out hidden reviews. Seeded 3 flagged reviews
  (`lib/data/reviews.ts`, rv28–rv30) so the flagged queue isn't empty on
  first load.
- **`/admin/wallet` + `/admin/wallet/[userId]`** (`WalletOverviewClient`/
  `AdminUserWalletDetailClient`) — platform-wide wallet liability +
  every seeded account's balance, plus **issue a refund** (appends a
  `category: "refund"` `WalletTransaction`, same shape
  `WalletContext.refund` writes client-side for the consumer wallet) and
  **manual adjustment** (credit/debit with a reason, new
  `WalletTransactionCategory` value `"adjustment"`, distinct from
  `"refund"` for audit clarity). `lib/data/admin.ts` gained
  `adminWalletsByUser`/`adminWalletTransactionsByUser` — M0–M11a only
  ever modeled one `Wallet` (`user-demo`'s); this seeds one per account
  in `users[]` (8 total) so `/admin/wallet` has real per-user balances to
  show. Deliberately a separate ledger from the consumer's own
  `WalletContext` (`localStorage`) — the two can drift within one mock
  session, closed for good once M8's server-authoritative ledger is the
  one thing both surfaces read/write through. The ledger UI reuses
  `components/ui/TransactionRow.tsx` verbatim.
- **Orders → wallet refund tie-in** — `OrderDetailClient`'s M11a-stubbed
  "Issue refund" button is now wired for marketplace and laundry orders:
  `AdminOrderSummary` gained `customerUserId?` (set from `Order.userId`/
  `LaundryBooking.userId`, left `undefined` for `SnackOrder`s — WhatsApp-
  only orders have no registered account/wallet to refund into, so that
  branch shows an explanatory note instead of a form). Refund amount
  pre-fills from the order total; a success message links straight to
  `/admin/wallet/[userId]`'s ledger. Status-override actions remain M8
  scope (need a real, audited fulfillment write).
- **`/admin/collections` + `/admin/collections/[id]`/`new`**
  (`CollectionsClient`/`CollectionEditorClient`) — every occasion
  `Collection` (what `/collections/[occasion]` renders), create/edit
  title/description/occasion, and product membership with move-up/
  move-down reordering (array order is the collection's real display
  order) + add/remove. New `upsertCollection` in `lib/api/admin.ts`; no
  `lib/types` change (`Collection` was already fully modeled in M0).
- **`/admin/collections/promo`** (`HomePromoEditorClient`) — edits the
  home page's two promo bands. `app/page.tsx` previously hardcoded these
  as JSX; they're now a real config record, `HomePromoBandContent[]`
  (`lib/data/site.ts#homePromoBands`, site-chrome copy tier — not a
  `lib/types` domain entity), read by a new `getHomePromoBands()`
  (`lib/api/site.ts`) and written by a new `updateHomePromoBand()`
  (`lib/api/admin.ts`).
- **`/admin/analytics`** (`AnalyticsClient`) — GMV over the last 14 days
  (one inline `<svg><polyline>` sparkline, no chart library), orders by
  module, top sellers (by `Vendor` revenue for makers, by `Seller`
  revenue for laundry/snack partners), top marketplace products, new
  users by month, and wallet flow by category — all derived from
  existing mock arrays via a new `getAnalytics()` (`lib/api/admin.ts`),
  no new data model. Every bar chart reuses `AdminDashboardClient`'s
  M11a `<span>`-track-plus-fill recipe.
- **Bug fix, found while reusing the M11a bar-chart recipe:**
  `.barFill`/`.barFillGold` (nested `<span>`s, not themselves flex/grid
  items) were rendering at 0×0 — CSS ignores `width`/`height`
  percentages on non-replaced inline boxes, and neither span had an
  explicit block-level `display`. Every bar in `AdminDashboardClient`'s
  "Orders by module" chart has been invisible since M11a. Fixed by
  adding `display: block` to both files' `.barFill`(`Gold`) classes —
  bars now render visibly in both places.

### Changed

- `components/admin/AdminShell.tsx` — the 4 "Soon" nav slots
  (Catalog/Wallet/Collections/Analytics) are live `Link`s now, no
  `disabled`/`aria-disabled` styling left.
- `components/admin/StatusPill.tsx` — tone map gained `hidden`→danger,
  `flagged`→gold, `visible`→success for product-moderation and
  review-visibility statuses.
- `components/admin/AdminDashboardClient.tsx` — "Wallet liability" hint
  updated ("Single seeded wallet" → "See /admin/wallet for per-user
  balances") now that the figure sums every seeded wallet, not one.
- `lib/api/admin.ts#getAdminDashboard`'s `walletLiability` now sums
  `adminWalletsByUser` instead of reading the single demo `Wallet`.
- Tap targets bumped to 44px on two new icon-only controls that started
  under that minimum: `ProductModerationRow`'s edit link (ported from
  `ListingRow.module.css`'s 36px) and `CollectionEditorClient`'s
  move/remove buttons (originally 30px).

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. Live QA
at 360/768/1180: moderated a product (hide → confirmed
`moderationStatus` flips and the row updates; feature/unfeature
toggles), hid a flagged review, issued a refund from both
`/admin/wallet/[userId]` and an order detail page (confirmed the
ledger entry and balance update via same-tab client-side navigation —
a `browse` hard-navigation `goto` resets the mock module state, a
pre-existing, documented limitation of every mutation in this codebase,
not a bug), applied a manual debit adjustment, edited a collection
(added/reordered/removed a product, saved, confirmed the title change
persisted), edited home promo copy, viewed analytics (all 5 chart
sections render with real numbers, no library). Caught and fixed one
real bug along the way: `issueRefund`/`adjustWallet` were mutating the
same transactions array a caller had already read into React state via
`list.unshift`, then the caller prepended the new transaction again —
a duplicate-React-key console error on every refund/adjustment. Fixed
by having both functions build a new array instead of mutating in
place. Regression-checked the consumer app (home — including the new
data-driven promo bands and the `.featured`-derived rail, shop, product
detail — flagged-but-not-hidden reviews still show, snacks, laundry,
cart, wallet), all 3 seller-portal types (maker, laundry partner, snack
seller — listings/menu/pickups/orders/payouts/reviews/storefront), and
M11a's own screens (dashboard, users, sellers, orders) — no console
errors, no horizontal scroll, real photos via `<ImageSlot src=...>`
still load throughout.

**Known mock-architecture limit (pre-existing, newly visible in this
milestone):** `/admin/catalog`, `/admin/catalog/reviews`, and
`/admin/collections/promo` are `"use client"` screens mutating
`lib/data` arrays in the browser's own module graph. The consumer pages
that read those same arrays (`/shop`, `/`, `/product/[slug]`,
`/storefront/[vendor]`, `/collections/[occasion]`) are Server
Components, fetching in the Next.js server's separate module graph — a
moderation/feature/CMS edit here is instantly visible to every other
admin client component in the same tab, but never reaches a
server-rendered consumer page without a real backend round-trip. Same
boundary `lib/api/seller.ts#updateSellerStorefront`'s doc comment
already flags for `/storefront/[vendor]`. M8's real API is what removes
this gap.

## [M11a] — Admin panel: foundation + core oversight — 2026-07-26

Opens the third and last role surface (`/admin/*`, internal staff,
unscoped access) alongside the consumer app and the M10 seller portal —
`middleware.ts` already reserved the gate since M10, so this milestone
only needed the routes, `/admin/login`, `signInAsAdmin()`, `AdminShell`,
and an unscoped `lib/api/admin.ts` data layer. Closes the M7b `/sell` →
M11a loop: a pending `SellerApplication` can now actually become an
active `Seller`. M11b (moderation, wallet/refund control, CMS,
analytics) and M8 (real backend/RBAC) are explicitly out of scope —
every M11b nav slot is visible-but-disabled, every refund/status-
override action is a labelled stub, not silently missing.

### Added

- **`signInAsAdmin()`** (`lib/auth/AuthContext.tsx`) — a third sign-in
  path alongside `signIn()`/`signInAsSeller()`, mutually exclusive with
  both, resolving to a new demo `User` (`adminUser`, role `"admin"`,
  `lib/data/admin.ts`). Mirrors `role` into the same `hk_role` cookie
  `middleware.ts` already checked for `/admin/*` since M10's scaffolding
  — no `middleware.ts` change needed, only a doc-comment update
  reflecting that the routes now exist.
- **`/admin/login`** (`AdminLoginClient`) — staff-only sign-in: a mock
  email/password form (no real credential check, same convention as
  every other pre-M8 login) plus "continue as demo admin". Deliberately
  **no public sign-up affordance anywhere on the screen** (unlike
  `/seller/login`'s "Apply to sell" link) — the copy states this
  explicitly.
- **`AdminShell`** (`components/admin/`) — its own pine-deep topbar +
  sticky-sidebar-collapsing-to-horizontal-scroll-strip shell, mirroring
  `SellerShell`'s structure without importing it (see
  `docs/DESIGN-SYSTEM.md`'s M11a section for why the two stay
  independent components). Nav: Dashboard, Users, Sellers, Orders (live)
  plus Catalog/Wallet/Collections/Analytics rendered as visible,
  `aria-disabled`, "Soon"-tagged slots for M11b. Client-side role gate
  (`role !== "admin"` → sign-in prompt) as a defensive fallback behind
  `middleware.ts`'s server-side redirect, same pattern as `SellerShell`.
- **`/admin` Dashboard** (`AdminDashboardClient` +
  `lib/api/admin.ts#getAdminDashboard`) — platform-wide KPI tiles (GMV
  across all 3 order-shaped tables, orders today/total, active sellers
  by type, users, pending applications, pending payouts, single-seeded-
  wallet liability) and a CSS-only orders-by-module bar chart (no chart
  library — a width-percented `<span>` fill, the same technique
  `CapacityMeter` already uses). A pending-applications callout links
  straight to the approval queue when the count is nonzero.
- **`/admin/users` + `/admin/users/[id]`** (`UsersClient`/`UserRow`/
  `UserDetailClient`) — the full unscoped `User` directory
  (`lib/api/admin.ts#getAllUsers`), search by name/email/phone, filter
  by role and active/suspended status, inline suspend/reactivate from
  either the list row or the detail page. `User` gained an optional
  `suspended?: boolean` field (`lib/types/shared.ts`) — a mock flag only,
  doesn't yet block sign-in (no real session to gate against until M8).
  `lib/data/admin.ts` seeds 3 extra consumer accounts (one pre-suspended)
  alongside the existing consumer + 3 seller demo users so the list
  isn't trivial (8 accounts total).
- **`/admin/sellers`** (`SellersClient`/`SellerRow`/`ApplicationRow`) —
  two tabs on one screen: "All sellers" (every `Seller` unscoped, type-
  filterable, suspend/reactivate) and "Approval queue" (pending
  `SellerApplication`s → approve/reject). **Approving mints a `Vendor` +
  an `approved` `Seller` in one action**
  (`lib/api/admin.ts#approveSellerApplication`) — `SellerApplicationCategory`
  maps 1:1 onto `VendorType` except `"other"`, which becomes a plain
  `"maker"` storefront — immediately visible in the "All sellers" tab.
  `SellerApplicationStatus` gained two terminal values, `approved`/
  `rejected` (`lib/types/shared.ts`), alongside `/sell`'s pre-existing
  `new`/`reviewing`/`waitlisted`, which the queue treats as one "pending"
  bucket. `lib/data/sell.ts#seedSellerApplications` seeds 3 pending
  applications (one per pre-existing status) + 1 pre-decided `rejected`
  one, spliced into `lib/api/sell.ts`'s live `sellerApplications` array
  at module init, so the queue isn't empty on first load and every
  status the pill can show has a real row.
- **`/admin/orders` + `/admin/orders/[type]/[id]`** (`OrdersClient`/
  `UnifiedOrderRow`/`OrderDetailClient`) — unifies marketplace `Order` +
  `LaundryBooking` + `SnackOrder` into one list/detail shape
  (`lib/api/admin.ts#AdminOrderSummary`, keyed `${type}:${id}`), type-
  filterable + searchable by reference/customer/seller, unscoped across
  every vendor/partner/seller. Full read visibility only — refund
  (marketplace) / status-override (laundry, snack) actions render as a
  labelled, disabled stub ("lands in M11b") rather than being silently
  absent, per the brief's "at minimum full visibility" requirement.
- **`StatusPill`** (`components/admin/`) — one generic status pill for
  the whole admin surface (raw status string → tone + auto-title-cased
  label from a shared map), a deliberate departure from the seller
  portal's one-pill-per-domain pattern (`OrderStatusPill`/
  `PickupStatusPill`/`SnackOrderStatusPill`, left untouched) — see
  `docs/DESIGN-SYSTEM.md`'s M11a section for the reasoning.
- **`lib/api/admin.ts`** — the unscoped admin data layer: `getAllUsers`/
  `getUserById`/`setUserSuspended`, `getAllSellers`/`getSellerById`,
  `getPendingSellerApplications`/`approveSellerApplication`/
  `rejectSellerApplication`/`setSellerStatus`, `getAllOrdersUnified`/
  `getAdminOrderById` + 3 full-record getters, `getAdminDashboard`. Every
  function reads/writes across every seller/user/order with no
  `vendorId`/`sellerId` filter — trusted purely because only
  `AdminShell`'s gated screens call it, exactly like every other mock
  data layer in this codebase; flagged throughout for M8's real
  server-side RBAC + audit logging.
- **`lib/api/seller.ts#getAllSnackOrders`** — an unscoped companion to
  the existing seller-scoped `getSnackOrders`, added here (not in
  `lib/api/admin.ts`) because `liveSnackOrders` is this module's private
  state; `getAllOrdersUnified` reads it the same way it reads
  `seedOrders`/`getPlacedOrders` for the marketplace side.

### Changed

- `middleware.ts` — no logic change (the `/admin/*` gate branch already
  matched the seller branch exactly since M10's scaffolding); updated
  the stale "no pages yet" doc comment now that `app/admin/**` exists.
- `lib/api/sell.ts` — `sellerApplications` now seeds from
  `seedSellerApplications` instead of starting empty; gained
  `getSellerApplicationById`/`setSellerApplicationStatus` for
  `lib/api/admin.ts`'s approve/reject to call into (same "each api
  module owns its own state" convention every other mutation in this
  codebase follows).

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. Live QA
at 360/768/1180: admin login → dashboard → users (suspend/reactivate,
both from the list and the detail page) → sellers (approved a pending
application live, confirmed it appeared in "All sellers" as `approved`)
→ orders oversight (all 3 order-shaped detail types). Role redirect
verified both directions: signed-out → `/admin` → `/admin/login`; signed
in as a seller → `/admin` → `/admin/login` (cookie `hk_role=seller`
rejected). Regression-checked the consumer app (home, shop, product
detail, snacks, laundry, account — real photos via `<ImageSlot src=...>`
still load) and all 3 seller-portal types (maker, laundry partner, snack
seller dashboards) — no console errors, no behavior change.

## [M10b] — Seller portal: laundry partner + snack seller — 2026-07-26

Extends the M10a seller-portal shell (`/seller/*`, `SellerShell`, the mock
`AuthContext` seller path) to the other two `SellerType`s — laundry
partner and snack seller — reusing every M10a primitive (`StatCard`,
`SellerPageHeader`, `PayoutRow`/`SellerPayoutsClient`, `OrderRow`/
`OrderStatusPill`'s pattern, `StatusTimeline`, the listings-CRUD shape)
rather than duplicating them. `docs/PRD.md`/`docs/DATA-MODEL.md`/
`docs/DESIGN-SYSTEM.md` had no M10a section (an M10a doc-update gap);
this entry's doc updates cover the seller portal's full current state
(M10a + M10b), not just this milestone's diff.

### Added

- **`signInAsSeller(type)` now resolves per type** (`lib/auth/AuthContext.tsx`)
  — a new `sellerType` field persists alongside `role` (`localStorage` +
  the existing `hk_role` cookie story unchanged) so `signInAsSeller("laundry")`/
  `("snack")` resolve to two new demo `User`+`Seller` records
  (`laundryPartnerUser`/`sl2` "Fresh Fold Laundry Co.",
  `snackSellerUser`/`sl3` "Meera's Snack Box", `lib/data/sellers.ts`)
  instead of always falling back to the M10a maker demo account.
  `/seller/login` (`SellerLoginClient`) gained two more "continue as
  demo ___" buttons alongside the existing maker one.
- **`SellerShell` nav now branches 3 ways** (`navForType`,
  `components/seller/SellerShell.tsx`) — `LAUNDRY_NAV` (Dashboard,
  Pickups, Payouts) and `SNACK_NAV` (Dashboard, Menu, Orders, Payouts)
  alongside the existing `MAKER_NAV`; laundry/snack sellers don't get
  Listings/Storefront/Reviews (maker-only concepts).
- **Dashboard, Orders — type routers, not branching components.**
  `SellerDashboardClient`/`SellerOrdersClient`/`SellerOrderDetailClient`
  are now thin `seller.type` switches over sibling components
  (`MakerDashboardClient`/`PartnerDashboardClient`/`SnackDashboardClient`;
  `MakerOrdersClient`/`SnackOrdersClient`; `MakerOrderDetailClient`/
  `SnackOrderDetailClient`) rather than one component with a conditional
  return before its hooks — the M10a maker components were renamed
  (`SellerDashboardClient`→`MakerDashboardClient`, etc.) and moved
  unmodified into the new sibling files; behavior for `type: "maker"` is
  byte-identical to M10a.
- **Laundry partner — Pickups** (`/seller/pickups`, `/seller/pickups/[id]`):
  `PartnerPickupsClient` (status-filterable list of `LaundryBooking`s
  assigned via the new `partnerId` field) and `PartnerPickupDetailClient`
  (a `StatusTimeline` over `scheduled→picked-up→in-progress→
  out-for-delivery→delivered`, an advance-status action, and editable
  pickup/delivery day+slot selects — the brief's "set/confirm the two
  slots" — via `updatePartnerBookingSlots`). `PartnerDashboardClient`
  shows today's pickups/deliveries count, this week's earnings, pending
  payout, and rating/review count (new optional `Seller.rating`/
  `reviewCount` fields, since laundry/snack sellers have no `Vendor` to
  read a rating off of).
- **Snack seller — Menu CRUD** (`/seller/menu`, `/seller/menu/new`,
  `/seller/menu/[id]`): `SellerMenuClient`/`SellerMenuEditorClient`/
  `SnackMenuForm` (name, category, diet, price, description, `available`
  toggle, image path via `<ImageSlot src>`) over a lazily-seeded
  per-seller copy of `Snack`s (same isolation pattern as the maker
  Listings store) — mirrors `ListingsClient`/`SellerListingEditorClient`/
  `ListingForm` one level down (no weight tiers/occasions; a `Snack` is
  flat single-price).
- **Snack seller — Orders** (`/seller/orders` when `seller.type ===
  "snack"`): a new `SnackOrder` entity (`lib/types/food.ts`) — the
  seller-portal's own mock stand-in for an incoming WhatsApp-origin
  order, since consumer Snacks orders never become a server-side `Order`
  (no on-site checkout, `lib/channel.ts`). `SnackOrdersClient`/
  `SnackOrderDetailClient` advance status `received→accepted→
  out-for-delivery→delivered` — the exact WA timeline sequence
  `StatusTimeline tone="whatsapp"` already shows the consumer on
  `/snacks`. 4 seed `SnackOrder`s (`lib/data/sellers.ts`) exercise all 4
  statuses.
- **`LaundryBooking.partnerId`** (`lib/types/laundry.ts`) — every seed
  booking (`lib/data/laundry.ts`) and every live booking
  (`lib/api/laundry.ts#createBooking`) now assigns to `"sl2"`, the one
  seeded demo partner (no real assignment/dispatch logic yet — M8/M9
  scope). 2 new seed bookings (`LB1044`/`LB1045`, dated "today") added so
  the partner dashboard's today-pickups/deliveries stat has real data;
  `bookingSequence`'s floor bumped 1042→1046 to stay clear of them.
- **`Snack.sellerId`** (`lib/types/food.ts`) — all 6 seed snacks now
  belong to `"sl3"`; the consumer `/snacks` grid is unaffected (it never
  filtered by seller).
- New `lib/api/seller.ts` exports: `getPartnerBookings`/`getPartnerBooking`/
  `advancePartnerBookingStatus`/`updatePartnerBookingSlots`/
  `BOOKING_SEQUENCE`/`nextBookingStatus`/`getPartnerDashboard`;
  `getSellerMenu`/`getSellerMenuItem`/`createSellerMenuItem`/
  `updateSellerMenuItem`/`deleteSellerMenuItem`; `getSnackOrders`/
  `getSnackOrder`/`advanceSnackOrderStatus`/`SNACK_ORDER_SEQUENCE`/
  `nextSnackOrderStatus`/`getSnackDashboard`. Same "trusts a
  client-passed `sellerId`/`partnerId`, session-scoped in-memory
  mutation" caveat as every M10a function in this file — M8 must
  re-derive the id from a verified server session.

### Fixed

- **`SellerShell`'s mobile (≤780px) stacked layout could silently clip
  `.content`** (`components/seller/SellerShell.module.css`) — the base
  `.body { align-items: flex-start }` (correct for the desktop row
  layout, where the sticky sidebar shouldn't stretch to content's
  height) became a *cross-axis width* rule once `.body` switches to
  `flex-direction: column` on mobile, so `.content` shrink-to-fit its
  own children instead of filling the row. M10a's maker dashboard never
  hit this (its content happened to always fit under ~328px at 360px
  viewport); M10b's wider stat-grid labels ("This week's earnings") and
  longer pickup-row text ("Steam Ironing · Pickup 26 Jul 2026 · Delivery
  27 Jul 2026") pushed past it, and `body { overflow-x: hidden }`
  (`globals.css`) silently clipped the overflow instead of showing a
  scrollbar — found via live QA at 360px. Fixed with `align-items:
  stretch` inside the existing `@media (max-width: 780px)` block only
  (desktop unaffected). Re-verified clean (`document.body.scrollWidth`
  matches `documentElement.clientWidth`) across all 3 seller types at
  360/768/1180.

### Notes / deviations

- The mock laundry day-picker (`lib/data/laundry.ts#laundryDays`) is
  still a fixed 4-day window (19–22 Jul 2026, unchanged from M4) while
  "today" in this environment is 25–26 Jul — a pre-existing M4-era
  mismatch, not introduced here. Its one visible effect on M10b: the
  Pickups detail slot-editor's day `<select>` shows a blank "Select day"
  for a booking dated outside that window (e.g. `LB1044`'s 25 Jul pickup)
  even though the underlying state and the read-only "Booking summary"
  panel show the correct date — cosmetic only, `updatePartnerBookingSlots`
  still saves correctly once a day is explicitly picked. Left
  `laundryDays` untouched rather than widening it, since that's a
  shipped M4 consumer-facing screen (`/laundry`'s day-tile grid) outside
  M10b's scope and carries its own regression risk.
- **M8/M9 must make real:** partner-assignment/dispatch logic (every
  booking auto-assigns to the one demo partner today);
  WhatsApp Cloud API inbound-order ingestion (creating a real `SnackOrder`
  per incoming WA message instead of seeding it) + outbound status-push
  notifications when a seller advances a `SnackOrder`'s status; and, same
  as every M10a function, re-deriving `sellerId`/`partnerId`/`vendorId`
  from a verified server session instead of a client-passed argument.

### Verified

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. Live QA
(headless browser) at 360/768/1180: signed in as all 3 demo sellers,
verified type-correct nav + dashboard stats for each; laundry pickup
status advance (`scheduled→picked-up`) and slot save both confirmed
against the live UI; snack menu create/edit/delete all confirmed
(including a session-scoped-mutation check — reset on hard reload, as
expected); snack order status advance (`received→accepted`) confirmed;
maker dashboard/listings/orders/storefront/payouts/reviews and the
consumer `/`, `/shop`, `/snacks`, `/laundry`, `/account/orders` all
re-checked with zero console errors and no `scrollWidth` overflow at any
width — no regressions from either the type-router refactor or the
`SellerShell` CSS fix above.

## [M7b] — Shared screens — 2026-07-25

Referrals + loyalty, notifications, support, corporate/bulk-gifting
inquiry, and seller onboarding — the five screens M7a's brief explicitly
left for a later milestone.

### Added

- `lib/wallet/WalletContext.tsx#earnReferralCredit` — a new ledger op
  alongside `topUp`/`pay`/`earnCashback`/`refund`: same shape as
  `earnCashback` but appends `category: "referral"` (matching
  `WalletTransactionCategory`) and doesn't add to `lifetimeSaved` (a
  referral bonus isn't a shopping saving).
- `lib/api/referrals.ts` + `lib/data/referrals.ts` — `getReferralCode`,
  `getReferrals`, `getLoyaltyAccount`, `getLoyaltyTiers`,
  `getReferralHowItWorks`, `getReferralRewardAmount`, and
  `applyReferralCredit()` (advances the oldest non-`rewarded` `Referral`
  to `rewarded`, session-scoped mock mutation — same pattern as
  `lib/api/addresses.ts`'s CRUD). Seeds a `LoyaltyAccount` for the demo
  user (`tier: "silver"`, `lifetimePoints: 1820`) and a `LOYALTY_TIERS`
  ladder (`{ tier, label, threshold, perk }` × 4) driving tier/next-tier
  math off `lifetimePoints` thresholds rather than a hardcoded flag.
  Seeds 3 `Referral`s exercising all 3 `ReferralStatus` values — the
  `rewarded` one's `rewardAmount: 100` deliberately matches the existing
  "Referral credit — Priya" row already in `lib/data/wallet.ts`'s ledger;
  the *current* invite rate is `REFERRAL_REWARD_AMOUNT = 250`.
- `app/account/referrals/page.tsx` + `components/account/ReferralsClient.tsx`
  — referral code with copy (`navigator.clipboard`) and share
  (`navigator.share` with a clipboard fallback), an "Apply referral
  credit (demo)" button that calls `applyReferralCredit()` then
  `useWallet().earnReferralCredit()` (real wallet ledger write, verified
  live), a loyalty tier badge + points + `<CapacityMeter>` progress to
  the next tier + a 4-tier perk ladder, and a "how it works" list.
- `lib/api/notifications.ts` + `lib/data/notifications.ts` —
  `getNotifications`, `getNotificationPreferences`,
  `updateNotificationPreference(category, patch)`,
  `setNotificationRead(id, read)`. Seeds 6 `Notification`s (all 6
  categories, all 4 channels, mixed read/unread) and one
  `NotificationPreference` row per category with deliberately varied
  channel defaults (transactional categories default to SMS+WhatsApp+
  email+in-app; `promo` skips SMS/WhatsApp by default).
- `app/account/notifications/page.tsx` +
  `components/account/NotificationsClient.tsx` — a category × channel
  toggle grid (styled checkboxes, same convention as `WalletClient`'s
  auto-top-up editor; mock-persisted per toggle) and a read/unread inbox
  with an All/Unread `<Chip>` filter — clicking a row toggles its read
  state via `setNotificationRead`.
- `lib/support/autoReply.ts#getAutoReply` — keyword-matched canned-reply
  helper for the mock chat widget (order/laundry/refund/wallet/referral/
  snacks keyword buckets + a generic fallback); a plain logic helper
  colocated under `lib/support/`, not a `ui/` primitive or mock-data file
  (same shape as `lib/cart/pricing.ts`/`lib/snacks/message.ts`).
- `lib/api/support.ts` + `lib/data/support.ts` — `getSupportPhone`,
  `getSupportChatGreeting`, `createSupportTicket` (session-scoped mock
  `SupportTicket` "table", same pattern as `lib/api/orders.ts#orders`),
  `getSupportTickets`.
- `app/support/page.tsx` + `components/support/SupportClient.tsx` — a
  standalone route (not wrapped in `AccountShell` — support is reachable
  signed-out): a `tel:` call CTA, a local ephemeral chat widget (message
  thread + input, canned auto-reply after a short delay, no persistence),
  and a ticket form (subject, optional order/booking ref, preferred
  follow-up channel via `<Chip>`, message) → `createSupportTicket` → a
  confirmation card showing the ticket id/status.
- `lib/api/corporate.ts` + `lib/data/corporate.ts` —
  `getCorporateOccasions`, `getCorporateBudgetRanges`,
  `createCorporateInquiry` (session-scoped mock `CorporateInquiry`
  "table").
- `app/corporate/page.tsx` + `components/corporate/CorporateInquiryClient.tsx`
  — bulk-gifting inquiry form (company/contact/email/phone/estimated
  quantity required; occasion + budget range as removable `<Chip>`
  selects; message via `<Textarea>`) → `createCorporateInquiry` → a
  thank-you state.
- `lib/types/shared.ts#SellerApplication` (+`SellerApplicationCategory`/
  `SellerApplicationStatus`) — the one new domain type M7b adds; modeled
  identically to the existing standalone `CorporateInquiry` (no user FK).
  Every other M7b entity (`Referral`, `LoyaltyAccount`, `Notification`,
  `NotificationPreference`, `SupportTicket`) was already fully modeled at
  M0.
- `lib/api/sell.ts` + `lib/data/sell.ts` — `getSellerBenefits`,
  `getSellerSteps`, `getSellerCategories`, `createSellerApplication`
  (session-scoped mock `SellerApplication` "table"; every application
  seeds with `status: "waitlisted"`, not `"new"` — matching the plan's
  "future-flagged" framing rather than an active review queue).
- `app/sell/page.tsx` + `components/sell/SellerApplicationClient.tsx` —
  a prominent "Coming soon" banner, a benefits grid, a "how it works"
  4-step ladder, and a real, submittable application form (business/
  contact/email/phone/city/category/description) → `createSellerApplication`
  → a "you're on the waitlist" confirmation. The future-flag is expressed
  as banner copy + a `"waitlisted"` status, not a disabled control — a
  literally-disabled submit would block exercising the mock submit →
  confirmation flow the brief calls for.

### Changed

- `components/account/AccountShell.tsx` — `ACCOUNT_NAV_ITEMS` gained
  Referrals (`Gift` icon) and Notifications (`Bell` icon) between
  Wishlist and Profile — the exact extension point M7a's brief left for
  it; no other shell logic touched.
- `lib/data/site.ts#footerColumns` — Services column gained "Corporate
  gifting" (`/corporate`) and "Sell on Homekrafted" (`/sell`); Account
  column gained "Referrals & loyalty" (`/account/referrals`). "Support"
  already linked `/support` since M0 (the route just didn't exist until
  now).

### Notes / decisions for Opus to confirm

- **`applyReferralCredit()` picks the oldest `joined` referral before
  falling back to the oldest `pending` one**, advancing it straight to
  `rewarded` in one step rather than modeling the `pending`→`joined`
  transition separately — the demo button represents "a friend accepted
  your invite and completed their first order" as a single simulated
  event, not two.
- **The referral/notification/support/corporate/seller mock "tables" are
  session/module-instance-scoped**, same caveat as every prior mock
  mutation in this codebase (`createOrder`, address CRUD, etc.) — live
  browser QA confirmed a hard reload / fresh tab always sees the pristine
  server-seeded state, never a previous tab's mutations (verified via a
  direct `curl` of the SSR'd `/account/referrals` HTML after mutating
  client-side, and via a fresh `newtab` navigation).
- **`NotificationsClient`'s preference grid scrolls inside its own card**
  (`overflow-x: auto`, `min-width: 400px` on `.prefsRow`) at the
  narrowest supported width (360px) rather than a redesigned stacked
  layout — the page itself never gains horizontal scroll (verified via
  `document.documentElement.scrollWidth` vs `clientWidth` at
  360/768/1180), but the 5-column category×channel table is tight at
  360px. Flagging as a candidate for a stacked-card redesign if a future
  design pass wants to remove the internal scroll entirely.

### Verified

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean from
`client/`. Live browser QA (`browse` skill) at 360/768/1180px: referral
copy/share, the demo "apply referral credit" flow end-to-end (wallet
balance +₹250, a new `category: "referral"` ledger row titled "Referral
credit — Karthik Rao", referral status flips to Rewarded), loyalty
tier/points/progress-meter rendering, notification preference toggles
persisting (mock) across a toggle + inbox mark-as-read + unread-filter
round trip, the support chat widget (keyword-matched auto-reply verified
for a laundry-themed message), the `tel:` call CTA, the support ticket
form → confirmation, the corporate inquiry form → thank-you state, and
the seller application form → waitlist confirmation. Re-verified the
M7a account shell (`/account`, `/account/orders`, `/account/addresses`,
`/account/wishlist`, `/account/profile`) still renders cleanly with the
two added nav entries, no console errors on any route. No page-level
horizontal scroll at any width; all interactive controls meet the 44px
tap-target guideline.

## [M7a] — Account core — 2026-07-25

Auth UI, the account shell, unified order history, address book,
profile, and the wishlist store. M7b (referrals, notifications, support,
corporate, sell) is a separate later milestone, not built here.

### Added

- `lib/wishlist/WishlistContext.tsx` — the third real cross-page client
  store after `CartContext`/`WalletContext`, `localStorage`-persisted,
  hydration-guarded the same way, exposing `useWishlist()`: `productIds`,
  `has(id)`, `toggle(id)`, `remove(id)`, `count`. Wired into
  `ProductGridCard` and `ProductPurchasePanel`'s hearts (previously
  local-only `useState`) and the header wishlist icon's badge
  (`HeaderClient`/`MobileDrawer`), matching the wallet-chip/cart-badge
  pattern.
- `lib/auth/AuthContext.tsx` — mock auth store: a `localStorage`-persisted
  `isSignedIn` flag over the single seeded `currentUser` (M0), exposing
  `useAuth()`: `user`, `isSignedIn`, `ready`, `signIn(provider?)`,
  `signOut()`. Defaults to signed-in on both server and pre-hydration
  client render (per the brief, "account pages assume the demo user is
  signed in") — only `signOut()` (Profile) flips it. No real credential
  check; every sign-in path converges on the one demo user until Auth.js
  lands in M8.
- `app/login/page.tsx` + `components/auth/LoginClient.tsx` — phone-OTP
  (number → send → enter code → verify), email, and social (Google/Apple,
  inline SVG glyphs) tabs, plus a "sign in as demo user" shortcut. All
  mock — every path calls `useAuth().signIn()` and redirects to
  `/account`. Shows an "already signed in" state with a sign-out option
  when revisited while signed in.
- `app/account/layout.tsx` + `components/account/AccountShell.tsx` — the
  account section nav (Overview/Orders/Addresses/Wishlist/Profile, a
  plain array — `ACCOUNT_NAV_ITEMS` — so M7b can append Referrals/
  Notifications without restructuring). Sidebar on desktop, sticky;
  collapses to a horizontally-scrollable tab strip below 780px via a CSS
  layout swap (same technique `Header.module.css` uses for its own
  desktop/mobile split — no conditional-JS hydration risk). Gates on
  `useAuth()`: signed-out shows a "sign in" prompt instead of a broken
  tree.
- `app/account/page.tsx` + `components/account/AccountOverviewClient.tsx`
  — greeting, a live wallet-balance snapshot (`useWallet()`), and
  quick-link tiles into Orders/Addresses/Wishlist/Profile with counts
  (order/address counts server-fetched from the seeded history; wishlist
  count and wallet balance read live).
- `lib/api/history.ts` — unified order-history read layer.
  `OrderHistoryEntry` normalizes a Marketplace `Order` or Laundry
  `LaundryBooking` into one shape (`kind`, `number`, `date`, `statusLabel`,
  `steps`, `total`, `summary`). `getOrderHistory()` merges
  `lib/data/orders.ts`'s new `seedOrders` + `lib/data/laundry.ts`'s new
  `seedLaundryBookings` (6 orders + 4 bookings spanning the full status
  range, three order numbers — HK1987/HK2031/HK2043 — deliberately
  matching `lib/data/wallet.ts`'s existing ledger references) with
  whatever `createOrder`/`createBooking` placed live this session
  (`getPlacedOrders()`/`getPlacedBookings()`, new exports on
  `lib/api/orders.ts`/`lib/api/laundry.ts`), sorted newest-first.
  `getOrderStatusSteps`/`getLaundryStatusSteps` reuse the exact
  Placed→Confirmed→Packed→Shipped→Delivered /
  Scheduled→Picked up→In progress→Out for delivery→Delivered pipelines
  `OrderConfirmation`/`LaundryBookingConfirmation` (M3/M4) already port;
  `cancelled`/`returned` collapse to a short two-step line.
- `app/account/orders/page.tsx` + `components/account/OrdersListClient.tsx`
  — unified list, filterable (All/Marketplace/Laundry via `Chip`), each
  row tagged by kind with its status and total. Fetches
  `getOrderHistory()` client-side on mount (not a server prop) so a live
  order/booking placed earlier in the session surfaces on top of the
  seeded history when reached by client-side navigation — see
  `docs/DESIGN-SYSTEM.md`'s M7a section for why.
- `app/account/orders/[id]/page.tsx` +
  `components/account/OrderDetailClient.tsx` — basic status
  `<StatusTimeline>` (no live tracking), items/booking-line summary,
  shipping/pickup-delivery address, payment method, cashback line, and
  `<AppTrackingBand>` for laundry bookings still in flight (per
  `lib/channel.ts`'s `liveTracking: "app-only"`).
- `lib/api/addresses.ts` — full address-book CRUD
  (`createAddress`/`updateAddress`/`deleteAddress`/`setDefaultAddress`,
  plus `getAddressById`), mutating the same in-memory `addresses` array
  `lib/api/site.ts#getAddresses` already reads (and Checkout's
  `initialAddresses` seeds from) — same session-scoped mock-mutation
  pattern as `createOrder`/`createBooking`, not a new `localStorage`
  store. `deleteAddress`/`setDefaultAddress` enforce exactly one default
  address at all times.
- `app/account/addresses/page.tsx` +
  `components/account/AddressBookClient.tsx` — full CRUD UI: add, edit,
  delete, set-default, over the M3-seeded address book. Deleting the
  current default promotes the first remaining address automatically.
- `lib/api/site.ts#updateUser` — mock profile-edit mutation
  (`Object.assign` onto the shared `currentUser` record). `app/account/
  profile/page.tsx` + `components/account/ProfileClient.tsx` — view/edit
  name/email/phone, member-since/referral-code meta, sign-out (→
  `/login`).
- `app/account/wishlist/page.tsx` +
  `components/account/WishlistPageClient.tsx` — grid of wishlisted
  products (filters the catalog by `useWishlist().productIds`), remove
  (unwishlist), "move to cart" (adds to the real cart via `useCart()` and
  removes from the wishlist in one action).

### Changed

- `app/layout.tsx` — wraps the app in `<AuthProvider>` (outermost) and
  `<WishlistProvider>` (innermost, alongside `CartProvider`), joining the
  existing `WalletProvider`/`CartProvider`.
- `components/product/ProductGridCard.tsx`,
  `components/product/ProductPurchasePanel.tsx` — wishlist hearts now
  read/write `useWishlist()` instead of local `useState` no-ops.
- `components/layout/HeaderClient.tsx`,
  `components/layout/MobileDrawer.tsx` — wishlist icon now shows a live
  count badge (desktop header pill; mobile drawer's utility row), same
  pattern as the existing cart badge/wallet chip.
- `lib/api/orders.ts`, `lib/api/laundry.ts` — added `getPlacedOrders()`/
  `getPlacedBookings()` (read the existing in-memory `orders`/`bookings`
  arrays `createOrder`/`createBooking` already wrote to — no behavior
  change to either mutation).

### Notes / decisions for Opus to confirm

- **Address CRUD stays a separate mock-mutation layer from Checkout's
  own inline "add address" flow**, not unified into one shared client
  store this milestone. Both ultimately read/write the same
  `lib/data/user.ts#addresses` array, but Checkout's `CheckoutClient`
  keeps its own local `addressList` state (unchanged from M3) rather than
  calling `lib/api/addresses.ts`'s mutations — verified this still works
  end-to-end (checkout still shows the seeded 3-address book and places
  orders correctly). Worth unifying once a real backend makes "the
  address book" a single source of truth everywhere, but forcing that now
  would mean touching M3's checkout flow inside an M7a brief.
- **Order/booking history fetched client-side, not via a server prop** —
  necessary (not just a style choice) for live-session orders/bookings to
  ever be visible on `/account/orders`, since `createOrder`/`createBooking`
  have no server boundary yet. This means a *server-rendered first paint*
  of `/account/orders` (e.g. a hard reload, or an SEO crawler) only ever
  sees the seeded history — acceptable for a pre-M8 account screen, but
  flagging it as a real limitation of the mock layer, not just this
  milestone's implementation choice.
- **Icon-button tap targets in new M7a components standardized on 44px**
  (address book row actions), diverging from a few pre-existing ~36-38px
  icon buttons elsewhere (`Header`, `MobileDrawer`) that this milestone
  didn't touch — flagged rather than silently drifting the convention;
  worth a follow-up pass to align the older ones if that bar matters
  platform-wide.

### Verified

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all clean from
`client/`. Live browser QA (`browse` skill) at 360/768/1180px: wishlist
round-trip (shop card heart → header badge → product-detail heart →
wishlist page → move-to-cart → cart), mock login (phone OTP happy path,
demo-user shortcut, sign-out → signed-out gate on `/account`), account
shell (sidebar at 1180, tab strip at 360/768, no horizontal overflow at
any width), unified orders list + detail (all 10 seeded entries, status
colors, stepper, `<AppTrackingBand>` on in-flight laundry bookings),
address CRUD (add/edit/set-default/delete, exactly one default enforced
throughout), profile edit + sign-out, and a live order placed through
Checkout mid-session correctly surfacing on `/account/orders` (client-side
navigation) with a working detail page. Re-verified M2 product/shop
hearts and M3 checkout's saved-address-book usage still work unchanged.
No console errors on any account route.

## [M6] — Wallet — 2026-07-25

The single cross-module wallet: a real (mock) ledger store
(`lib/wallet/WalletContext.tsx`, `localStorage`-persisted, mirrors
`CartContext`'s pattern exactly) backing a new `/wallet` screen, and the
back-wiring of M3 Checkout's and M4 Laundry's previously display-only
wallet-pay into real balance debits + cashback credits. New route
`/wallet` under `app/`; new feature component under `components/wallet/`
(see `docs/DESIGN-SYSTEM.md` → "M6 feature components").

### Added

- `lib/wallet/WalletContext.tsx` — `WalletProvider` + `useWallet()`:
  `balance`, `pendingCashback`, `lifetimeSaved`, `transactions`,
  `autoTopup`, `ready`, and `topUp`/`pay`/`earnCashback`/`refund`/
  `setAutoTopup`. Every ledger-mutating op appends a `WalletTransaction`
  with the correct `direction`/`category`/`balanceAfter`/`refType`/
  `refId`. `pay(amount, ref)` returns `{ ok: false }` without mutating
  state when the balance can't cover `amount`; a successful `pay` that
  drops the balance under the configured `AutoTopupRule.thresholdAmount`
  (when `enabled` + `trigger: "below-threshold"`) auto-appends a second
  `topup` credit for `topupAmount` — reactive only, it never rescues an
  insufficient payment. `topUp(amount)` above `TOPUP_BONUS_THRESHOLD`
  (₹2,000) also appends a 3% bonus credit (`category: "cashback"`),
  actually wiring the prototype's "Get 3% extra..." copy instead of
  leaving it decorative. Wrapped around the app in `app/layout.tsx`
  alongside `CartProvider`. Hydrates post-mount from `localStorage`,
  falling back to `lib/api/wallet`'s seeded mock wallet/ledger/rule on
  first-ever load — same SSR/client markup-mismatch guard `CartContext`
  established in M3, same "deliberate pre-backend client exception"
  status.
- `app/wallet/page.tsx` + `components/wallet/WalletClient.tsx` (+ CSS) —
  ported from the prototype's `isWallet` block: `WalletBalanceCard`
  (live balance, pending cashback, lifetime saved), an "Add money" card
  (`AmountPicker` presets + custom amount input → `topUp`, bonus note),
  an auto-top-up rule editor (enable checkbox + threshold + amount inputs
  — genuine M6 addition, the prototype never shows one), a pay-with-
  wallet info card (default-on messaging, no toggle), and a transaction
  history (`TransactionRow` list, all 6 categories, "View full history"
  expand with month grouping).
- Back-wired wallet-pay into `CheckoutClient.handlePlaceOrder` and
  `LaundryBookingClient.handleConfirm`: both now call `useWallet().pay()`
  when `paymentMethod === "wallet"` (referencing the created order/
  booking's number as `refId`), then `earnCashback()` — Checkout
  unconditionally (matches its pre-existing `cashbackEarned`, earned
  regardless of payment method), Laundry only when the booking's
  `walletCashback` is set (matches M4's existing wallet-only scoping).
  Both components now read `useWallet().balance` live for the
  `walletSufficient` gate and the payment-tile hint text, instead of the
  server-fetched `wallet` prop's point-in-time balance — the prop is
  still used to seed the *initial* payment-method preference (see
  "Decisions" below).
- `HeaderClient`/`MobileDrawer` — the wallet chip now reads
  `useWallet().balance` live instead of a `walletBalance` prop `Header.tsx`
  fetched once server-side (same upgrade M3 gave the cart badge). Shows
  "…" instead of a misleading ₹0 while the wallet store is still
  hydrating.
- `lib/data/wallet.ts` — added a `refund` and a `loyalty` ledger row (the
  prototype's 6 sample rows only covered `topup`/`cashback`/`payment`/
  `referral`) so the seeded history exercises all 6
  `WalletTransactionCategory` values; `balanceAfter` reconciled backwards
  from the unchanged ₹1,250 current balance across all 8 rows. Added
  `defaultAutoTopupRule` (off by default, `below-threshold`, ₹300/₹1,000).
  `lib/api/wallet.ts` — added `getAutoTopupRule()`.

### Decisions for Opus to confirm

- **`preferredPaymentMethod`'s initial value is seeded from the
  server-fetched `wallet` prop, not the live `useWallet().balance`** —
  found during QA: `WalletContext` hydrates from `localStorage`
  *after* mount (same as `CartContext`), so on a hard navigation/reload
  the live balance briefly reads 0, which would wrongly default this
  one-time preference to Razorpay even when `payWithWalletDefault` is on
  and the real balance is healthy. The prop is only ever a starting
  guess; `walletSufficient` (live) still gates the *effective*
  `paymentMethod` on every render, so this can never let an actually-
  insufficient wallet get selected — just avoids a wrong default.
- **Cashback timing: earned immediately into `balance` + `lifetimeSaved`
  at order/booking placement**, not held in `pendingCashback` until some
  later "clearance" event — no clearance flow is scoped for M6, and this
  matches the pre-existing UI copy ("Earn ₹X cashback on this order")
  and the seed ledger's own cashback rows, which were always direct
  balance credits. `pendingCashback` stays a separate, currently-static
  display figure (not touched by any M6 op) — flagging as a gap a real
  clearance-window feature would need to fill in later (M7/M8).
- **`refund()` credits `balance` but not `lifetimeSaved`** — a refund
  returns the shopper's own money rather than saving them anything, so it
  shouldn't inflate the "lifetime saved" figure the way cashback does. No
  order-level "request a refund" UI exists yet (out of scope per the
  brief — "a full order-level UI can live in M7"); `refund()` and the
  `refund` ledger category are exercised today only via the seed data.
- **Auto-top-up editor has no UI for the `scheduled` trigger** — only
  `below-threshold` (enable + threshold + amount), matching the DoD's
  "auto-top-up fires on low balance." `AutoTopupRule.trigger` stays a
  2-value union on the type; a scheduled/recurring top-up UI is a fair
  future add if wanted.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/wallet` prerenders statically alongside every other
  route; `/checkout`/`/product/[slug]`/`/shop`/`/storefront/[vendor]`/
  `/collections/[occasion]` still build as before (dynamic/static
  unchanged).
- Live QA via headless browser at 360/768/1180px: `/wallet` — selected a
  preset tile then a custom amount (₹3,000, above the ₹2,000 bonus
  threshold) and confirmed both `topUp` calls updated the balance card,
  the header chip, and prepended the correct ledger rows (a "Top-up bonus
  (3%)" row above its "Wallet top-up" row, exact 3% amount); toggled
  auto-top-up on with a threshold above the live balance; expanded "View
  full history" (11 rows, correctly month-grouped) and collapsed it back.
  Full wallet-paid checkout loop: added a product to cart, `/checkout`
  defaulted to Wallet (live balance/cashback shown), placed the order —
  balance debited the order total, then auto-top-up fired (balance had
  dropped under the configured threshold), then cashback credited; header
  chip and `/wallet`'s ledger reflected all three new rows in the correct
  order with correct signs/colors. Repeated for a full wallet-paid
  Laundry booking (`/laundry` → Confirm pickup) with the same result,
  confirming cashback was correctly gated to the wallet-paid case only.
  Forced an insufficient-balance state (₹50) via `localStorage` and
  reloaded both `/checkout` and `/laundry`: the Wallet tile correctly
  showed `disabled` + "insufficient for this order/estimate" and the
  effective payment method fell back to Razorpay on both screens; placed
  a Razorpay order from that state and confirmed cashback still credited
  (Checkout's "earned on every order" rule) with no wallet debit. Zero
  console errors at any width, zero horizontal overflow
  (`document.documentElement.scrollWidth === clientWidth` verified at
  360px), auto-top-up-rule fields and toggle measured — the toggle
  row initially measured 21px tall (a real gap found during QA, same
  category as M3's under-44px text-link fix); padded its hit area to 45px
  without changing the visible checkbox/label size.
- Colors verified: pine primary (balance card gradient, buttons), gold
  decorative-only (`ADD MONEY`/`AUTO TOP-UP` eyebrows, bonus note at
  small size via `--hk-gold-text-sm`, "Last 30 days"/"All time" meta),
  terracotta on debit rows (`↑ − ₹560` etc.) — matching `TransactionRow`'s
  existing credit-green/debit-terracotta convention. Wallet gold-tint
  surfaces (`--hk-gold-tint`/`--hk-gold-border` on the pay-with-wallet
  info card) match the prototype's own `#FBF1D6`/`#E4CF8F` panel exactly.

### Notes for M7/M8

- **M7 (Account)** owns a real order-level "request a refund" UI —
  `refund()` and the `refund` ledger category exist and work today, just
  with no UI trigger beyond the seed data.
- **`pendingCashback` has no clearance flow** — it's a static seeded
  figure M6 displays but never mutates; a real "cashback pending N days
  before it clears into balance" feature is unbuilt (see "Decisions"
  above). Whoever builds it should decide whether `earnCashback` moves to
  crediting `pendingCashback` first, with a separate "release" op moving
  it into `balance` once real clearance timing exists.
- **M8 (backend)** must make the ledger **server-authoritative and
  idempotent** — today's entire implementation
  (`lib/wallet/WalletContext.tsx`) computes `balanceAfter` client-side and
  trusts its own `localStorage`, exactly the anti-pattern
  `docs/DATA-MODEL.md` already flags as unacceptable long-term. M8 needs:
  a real `/api/wallet` ledger table where the server (not the client)
  computes and writes `balanceAfter` inside the same transaction that
  mutates `Wallet.balance`; idempotency keys on `pay`/`topUp` calls (so a
  retried request from a flaky connection can't double-charge or
  double-credit); and the order-placement + wallet-debit sequence in
  `CheckoutClient`/`LaundryBookingClient` becoming one atomic transaction
  server-side (today `createOrder`/`createBooking` and the wallet `pay()`
  are two separate, non-rollback-able mock calls — a `pay()` failure after
  a successful mock `createOrder` leaves an inconsistent local order with
  no wallet debit, a known mock-layer gap called out inline in both
  components).

## [M5] — Snacks + Food Delivery promo — 2026-07-25

Snacks' browsable menu + WhatsApp-only ordering, and a new `/app-promo`
page for full meals. Channel-critical milestone: Snacks carries no
on-site cart/checkout (`lib/channel.ts` — `hasCartOnWeb`/
`hasCheckoutOnWeb` both `false`), and full meals carries no menu
(`hasMenuOnWeb: false`) — both pages assert their channel rule in code
and throw if it's ever relaxed without a deliberate redesign. Snacks is
ported from the prototype's `isSnacks` block
(`handoff/prototype/Homekrafted.dc.html`); `/app-promo` has no prototype
screen and is new M5 content. New routes `/snacks`, `/app-promo` under
`app/`; new feature components under `components/snacks/` (see
`docs/DESIGN-SYSTEM.md` → "M5 feature components").

### Added

- `app/snacks/page.tsx` (+ `Snacks.module.css`) — server wrapper: fetches
  snacks + category filters via `lib/api`, renders the hero (`ChannelBadge
  channel="snacks"`, "No checkout — we reply on chat" pill, title, copy),
  asserts `getChannelRule("snacks")` still has `hasCartOnWeb`/
  `hasCheckoutOnWeb` both `false`, hands data to `SnacksClient`.
- `components/snacks/SnacksClient.tsx` (+ CSS, `"use client"`) — category
  `Chip` row filtering a `SnackCard` grid; a local snack-list selection
  (`Record<snackId, quantity>` state, never `useCart`) rendered through
  `StickySummary` (`stickyOnMobile`) with a `QuantityStepper` + remove per
  line and a real computed estimate total; "Send list on WhatsApp"
  (`Button variant="whatsapp"`) opens a `wa.me` link built from
  `buildSnackListMessage` + `buildWhatsAppLink`; a second card below shows
  the informational WA order-status `StatusTimeline` (`tone="whatsapp"`:
  received → accepted → out for delivery) and a "full meals & live
  tracking are on the app" note.
- `app/app-promo/page.tsx` (+ `AppPromo.module.css`) — full-meals promo:
  dark-gradient hero (`ChannelBadge channel="full-meals"`, headline,
  `mealPromo.description`, `StoreBadges`, hero `ImageSlot`), a "why the
  app" 4-card value-prop grid (fresh copy — live rider tracking, full
  meal menus, faster reordering, app-only offers), and a "get the app"
  section reusing `components/home/AppInstallPanel` as-is. Asserts
  `getChannelRule("full-meals").hasMenuOnWeb` is still `false`.
- `lib/snacks/message.ts` — `buildSnackListMessage(items, estimateTotal)`,
  formats the WhatsApp order text from a live selection, matching
  `sampleSnackList.whatsappPayload`'s wording so a real list and the mock
  fixture read identically in chat.
- `lib/messaging.ts` — exported `HOMEKRAFTED_WHATSAPP_NUMBER` (was a
  private literal inside `ClickToChatMessaging`) so `SnacksClient` can
  build its own outbound `wa.me` link via `buildWhatsAppLink` directly
  (the customer messages the business here, not the reverse, so it
  doesn't go through `Messaging.sendStatus`) without re-hardcoding the
  number.
- `lib/data/snacks.ts` — `SnackCategoryFilter` type + `snackCategoryFilters`
  ("All" + the 4 `SnackCategory` values, ported from the prototype's
  `snackCats`), typed locally like `NavItem` rather than joining
  `lib/types/food.ts` (it's a UI filter option, not a schema entity).
  `lib/api/snacks.ts` — `getSnackCategoryFilters()` getter, re-exports the
  `SnackCategoryFilter` type.

### Decisions for Opus to confirm

- **`SnackCard`'s add/added toggle sets quantity 1; a `QuantityStepper`
  in the sticky list adjusts it from there** — the prototype's snack list
  only ever renders a static "×1", no interactivity. `SnackListItem`
  already had a `quantity` field, so this uses the schema as designed
  rather than leaving every line permanently at 1.
- **`ChannelBadge` replaces the prototype's plain mono-text eyebrow** on
  both pages (same substitution `CraftCard` made on Home in M2) — badge
  copy now sources from `lib/channel.ts` instead of being hand-typed per
  screen.
- **`/app-promo`'s "why the app" value props are new copy**, not a port —
  the prototype has no dedicated Food Delivery screen (only the dark
  "Coming soon" card on Home, already ported as `CraftCard` in M2).
- **WA status timeline is static/illustrative** (received done, the rest
  pending) exactly like the prototype's fixed `waSteps` — not wired to
  the actual send action. A real per-order status feed is an M9 (WhatsApp
  Cloud API) concern, noted below.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — both `/snacks` and `/app-promo` prerender statically.
- Live QA via headless browser at 360/768/1180px on both routes: zero
  console errors, zero horizontal overflow at any width. On `/snacks`:
  category chips filter the grid without clearing the snack list;
  clicking "+ Add"/"✓ Added" toggles list membership; the
  `QuantityStepper` recomputes the estimate live (verified 2× Masala
  Mathri (₹120) + 1× Chakli Spirals (₹110) → Estimate ₹350); "Send list on
  WhatsApp" is disabled with an empty list and opens
  `https://wa.me/919999999999?text=Hi%20Homekrafted!%20I'd%20like%20to%20order%3A%0A2x%20Masala%20Mathri%0A1x%20Chakli%20Spirals%0A%0AEstimated%20total%3A%20%E2%82%B9350`
  once populated; the sticky list's CTA bar confirmed `position: fixed`
  to the viewport bottom below 640px (`stickyOnMobile`, same M3
  mechanism). On `/app-promo`: hero/value-props/install panel all render,
  no menu/cart/checkout markup present at any width.
- Tap targets: `QuantityStepper` buttons and `SnackCard`'s "+ Add"/quantity
  controls measured; the snack-list row's remove "✕" is 24×24px, matching
  `HamperBasket`'s already-reviewed M3 remove-button precedent exactly
  (not a new gap introduced here) — flagging since it's under the 44px
  guideline, same as that established pattern.
- Colors verified: WhatsApp green (`--hk-whatsapp`/`-deep`/`-tint`/
  `-border`) confined to `/snacks` and the Snacks-related Home surfaces
  only; `/app-promo` reuses the existing dark-gradient/gold-bright
  "app-only" palette, no WhatsApp green on that page.

### Notes for M9

- **WA status timeline is display-only** — `StatusTimeline`'s three steps
  (received/accepted/out-for-delivery) don't reflect a real per-order
  state today. M9's WhatsApp Cloud API integration is the natural hook to
  make this live: a real `SnackList.status` transition (already modeled
  in `lib/types/food.ts`) driving which step shows `done`/`current`,
  pushed via `Messaging.sendStatus` (the `Messaging` interface in
  `lib/messaging.ts` is already implementation-swappable — see its
  `CloudApiMessaging` stub) instead of the current click-to-chat-only
  flow where a human replies manually in WhatsApp.
- **`buildSnackListMessage`/`buildWhatsAppLink` stay the "compose" half**
  of ordering even after M9 — Cloud API automation would consume the same
  formatted list server-side (e.g. to auto-acknowledge an inbound
  message) rather than replacing how the message is built.

## [M4] — Laundry booking flow — 2026-07-24

The Laundry, Cleaning & Ironing bookable flow: service picker (all 3
pricing models), two-slot pickup/delivery scheduling, dry-clean item
count + photo estimate, special instructions, a recurring-subscription
toggle, wallet/online/COD payment, and a mock booking confirmation with a
basic status line + an app-tracking band. Ported from the prototype's
Laundry screen (`handoff/prototype/Homekrafted.dc.html`, `isLaundry`
block: hero, service picker, pickup slot, how-it-works, booking summary,
app-tracking band), extended with the pieces the prototype doesn't have
(separate delivery slot, item photos, special instructions, subscription,
COD, real confirmation state). New route `/laundry` under `app/`; new
feature components under `components/laundry/` (see
`docs/DESIGN-SYSTEM.md` → "M4 feature components").

### Added

- `app/laundry/page.tsx` — server wrapper: fetches services, pickup/
  delivery availability, "how it works" steps, subscription plan
  options, the wallet, and the default address via `lib/api`, hands them
  to `LaundryBookingClient`.
- `components/laundry/LaundryBookingClient.tsx` (+ CSS) — the full
  booking form: `ServiceCard` grid (Wash & Fold `per-kg`, Dry Clean
  `per-item`, Steam Ironing `per-item`, Home Cleaning `per-hour`, all
  three pricing models exercised), a shared `QuantityStepper` relabeled
  per pricing model (weight/items/hours) driving the live estimate,
  `PhotoUpload` shown only for the item-priced services, two independent
  `SlotPicker` pairs (pickup day+time, delivery day+time — the prototype
  only had one pickup picker), `Textarea` for special instructions, a
  recurring-subscription toggle + weekly/biweekly/monthly `Chip` picker,
  wallet/online(Razorpay-stub)/COD payment tiles (wallet defaults on when
  `wallet.payWithWalletDefault && balance > 0`, auto-falls-back to
  Razorpay if the balance can't cover the estimate — same derived-value
  pattern as `CheckoutClient`'s bugfix), and a `StickySummary`
  (`stickyOnMobile`) booking summary whose CTA calls the mock
  `createBooking` (+ `createSubscription` when the toggle is on) and
  swaps in `LaundryBookingConfirmation`. Validates the delivery date
  isn't before the pickup date before submitting.
- `components/laundry/LaundryBookingConfirmation.tsx` (+ CSS) — post-
  booking state (not a separate route, mirrors `OrderConfirmation`):
  booking number, `StatusTimeline` (scheduled → picked-up → in-progress →
  out-for-delivery → delivered, first step done, no live tracking), line-
  item summary, cashback line when paid by wallet, "Book another pickup"
  CTA that resets the form.
- `components/laundry/AppTrackingBand.tsx` (+ CSS) — the closing "Live
  rider tracking is on the app" band, ported from the prototype's dark
  gradient card (same `#2B241C→#3a3025` recipe as Home's food-delivery
  `CraftCard`). Composes `<ChannelBadge channel="full-meals">` (reusing
  its "On the app · Coming soon" gold-dark pill for this app-only
  feature) and `<StoreBadges variant="outline">` (real store links,
  replacing the prototype's static "Notify me →" pill). Rendered
  whether or not a booking has been placed yet, enforcing
  `lib/channel.ts`'s `liveTracking: "app-only"` rule in the UI itself —
  no map/rider tracking is ever rendered on web.
- `lib/api/laundry.ts` — `createBooking(input)` and
  `createSubscription(input)` mock mutations (in-memory arrays, same
  reset-on-reload caveat as `lib/api/orders.ts`'s `createOrder`), plus
  `getLaundrySubscriptionPlanOptions()`. `lib/data/laundry.ts` —
  `laundrySubscriptionPlanOptions` (weekly/biweekly/monthly labels+
  hints) and `nextBookingNumber()` (an "LB"-prefixed sequence, kept
  visually distinct from `Order.orderNumber`'s "HK" prefix for the M7
  unified order-history list).
- `lib/types/laundry.ts` — `LaundryBooking.bookingNumber: string`, the
  same id/human-number split `Order` already has. Every other M4 field
  (`pickupSlot`/`deliverySlot`, `photos`, `specialInstructions`,
  `subscriptionId`, `paymentMethod`) was already on the type from M0.

### Decisions for Opus to confirm

- **`LaundryBooking.bookingNumber` is a new field**, added because the
  confirmation screen needed a short human-readable number ("Booking
  #LB1042") the same way `Order.orderNumber` backs Checkout's
  confirmation — `id` alone (`lb-<timestamp>`) isn't customer-facing.
- **`AppTrackingBand` reuses the `full-meals` channel badge** ("On the
  app · Coming soon") rather than adding a fourth `ChannelBadgeVariant` —
  the band's message is specifically about live tracking being an
  app-only feature, which is exactly what that badge already says;
  flagging in case a dedicated "tracking" badge variant is wanted later.
- **Booking form keeps the last-picked service selection across "Book
  another pickup"** (only the booking/photos/instructions reset) —
  matches a real re-order flow better than snapping back to Wash & Fold
  every time, but flagging since nothing in the brief specified this
  either way.
- **No address picker on `/laundry`** — bookings post to the account's
  single default address (`getDefaultAddress()`), same simplification
  Checkout's M3 build didn't have this problem for (it has full
  multi-address). Full address selection here is a fair M7 add once
  address-book CRUD exists, not required by this milestone's brief.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/laundry` prerenders statically.
- Live QA via headless browser at 360/768/1180px: service picker cycles
  through all 4 services (photo upload confirmed appearing only for Dry
  Clean/Steam Ironing, disappearing for Wash & Fold/Home Cleaning),
  independent pickup + delivery day/slot selection, item photo add/
  remove, subscription toggle + plan chip selection, all three payment
  tiles (wallet auto-shows cashback, wallet tile disables when balance
  is insufficient), delivery-before-pickup validation confirmed blocking
  submission with an inline error, successful booking → confirmation
  screen (booking number, status timeline, summary, no cashback line
  when paid COD, app-tracking band) → "Book another pickup" resets and
  returns to the form. Zero console errors, zero horizontal overflow at
  any width, sticky summary's CTA correctly bottom-anchors below ~640px
  (clears via the same `stickyOnMobile` pattern M3 established), all
  M4-specific tap targets (`ServiceCard`, photo tile, payment tiles,
  "Confirm pickup") measured ≥44px.
- Colors verified: pine primary/headings, gold decorative-only (eyebrows,
  "choose a service"/"how it works" labels), terracotta on service prices
  (matches the M1-documented laundry-price-uses-terracotta port), the
  prototype's laundry green tint reused via `--hk-pine-tint` for the hero
  gradient and `AppTrackingBand`'s dark gradient reusing the exact
  `CraftCard` food-variant recipe.

### Notes for M6/M7/M8

- **M6 (Wallet)** owns the real wallet-debit ledger entry — `createBooking`
  currently only records `walletCashback` on the `LaundryBooking` without
  writing a `WalletTransaction` or decrementing `Wallet.balance`, same gap
  M3's `createOrder` has.
- **M7 (Account)** unifies Marketplace `Order`s and `LaundryBooking`s into
  one `/account/orders` list (per `docs/PRD.md`) — the "LB"/"HK" number
  prefixes are deliberately distinct so that list can visually
  disambiguate the two without a separate "type" column. No address
  picker exists on `/laundry` yet (bookings use the single default
  address) — worth adding once address-book CRUD lands.
- **M8 (backend)** swaps `lib/api/laundry.ts`'s in-memory `bookings`/
  `subscriptions` arrays and `nextBookingNumber()` sequence for real
  Postgres tables/endpoints (`POST /api/v1/laundry/bookings` +
  `/subscriptions`, per `docs/API.md`) — same call-site-stable swap
  `lib/api/orders.ts` is already set up for.

## [M3] — Buy flow — 2026-07-24

The Gifting Marketplace's buy flow: Hamper builder, Cart, and
multi-address Checkout with gift-to-recipient — the first milestone with
real cross-page client state. `lib/cart/CartContext.tsx` is a
`localStorage`-persisted React context (no backend yet); every
add-to-cart control from M2 (`ProductPurchasePanel`, `ProductGridCard`)
and the header cart badge now read/write it for real. New routes
`/hamper`, `/cart`, `/checkout` under `app/`; new feature components
under `components/{hamper,cart,checkout}/` (see `docs/DESIGN-SYSTEM.md` →
"M3 feature components").

### Added

- `lib/cart/CartContext.tsx` — `CartProvider` + `useCart()`: `items`,
  `hampers` (assembled `Hamper` records handed off from `/hamper`),
  `addItem`/`updateQty`/`removeItem`/`assignAddress`/`addHamperItem`/
  `clear`, derived `count`/`subtotal`, and `lineInfo()` (resolves a
  product-or-hamper line to display data). Hydrates from `localStorage`
  after mount (avoids an SSR/client markup mismatch) and loads the
  product/hamper-box catalog once via `lib/api` for price resolution.
  Wrapped around the whole app in `app/layout.tsx`. Documented as the
  deliberate pre-backend exception to "components only read via
  `lib/api`" — M8 swaps its internals for server-backed calls without
  changing any `useCart()` call site.
- `lib/cart/pricing.ts` — shared shipping/cashback math
  (`computeShipping`, `computeCashback`, `SHIPPING_FEE`,
  `FREE_SHIPPING_THRESHOLD`, `CASHBACK_RATE` — flat 5%, matching the
  existing product/home copy) so Cart, Checkout, and the mock
  `createOrder` never compute different numbers for the same cart.
- `app/hamper/page.tsx` + `components/hamper/HamperBuilderClient.tsx` (+
  `HamperFillTile`, `HamperBasket`) — the hamper builder, ported from the
  prototype's combined Box+Fill screen but split into a real 3-step
  wizard (Box → Fill → Message; `StepPills`' 4th "Checkout" pill is
  reached by navigating away, not rendered locally): box-size picker,
  capacity-capped fill grid, gift note/wrap/ribbon/name-card message
  step. Finishing calls `useCart().addHamperItem` (assigns the hamper an
  id, stores it, adds one `hamperId` cart line) and routes into
  `/checkout`.
- `app/cart/page.tsx` (+ CSS) — line items (`CartLineRow`: image, name,
  weight/hamper label, unit price, `QuantityStepper`, remove), order
  summary (subtotal, shipping, wallet-cashback preview, total), empty
  state, "Proceed to checkout" CTA. Client component directly (no
  server/client split) — there's no unique server fetch, the cart store
  already resolves its own pricing.
- `app/checkout/page.tsx` + `components/checkout/CheckoutClient.tsx` (+
  `AddressForm`, `OrderConfirmation`) — multi-address split (group cart
  lines by assigned address, per-group `SlotPicker` delivery date, inline
  "add address"), a single order-wide gift-to-recipient toggle (recipient
  address + hide-price + message — ships the *whole* order to one
  recipient rather than mixing with per-item multi-address splitting),
  wallet/Razorpay payment (wallet auto-falls-back to Razorpay when
  balance can't cover the total), and an in-place order-confirmation
  state (order number, basic status stepper, no live tracking) on
  successful `createOrder`.
- `lib/api/orders.ts` — `getDeliveryDateOptions()`, `createOrder(input)`
  (mock mutation: computes subtotal/shipping/cashback from
  `lib/cart/pricing`, generates an id + order number, "persists" to an
  in-memory array). `lib/data/orders.ts` — `deliveryDateOptions` (4
  real-2026-weekday options) + `nextOrderNumber()` sequence continuing
  from the wallet ledger's existing `HK2043` sample. Both mutation and
  sequence run in the browser tab (called from a client component, no
  "use server" boundary) — they reset on a hard reload/new tab, not a
  server restart; same caveat as the cart itself would have without
  `CartContext`'s `localStorage` persistence.
- `lib/data/user.ts` — `addresses[]` (3 seeded addresses: Home/Office/
  Amma's place) replacing the single M0 `demoAddress`, + `getAddressById`.
  `lib/api/site.ts` — `getAddresses()`.
- `lib/api/products.ts` / `lib/data/products.ts` — `getProductById`
  (cart/hamper lines only persist `productId`, need this to resolve a
  line's product record).
- `components/ui/StickySummary` gained two additive props —
  `beforeLines?` (slots a `<CapacityMeter>` between the title and line
  items, keeping the Hamper basket one bordered card) and
  `stickyOnMobile?` (pins the CTA to a fixed bottom bar below ~640px so
  a long scrollable list never buries the primary action). Both
  off-by-default; every existing call site renders unchanged.
- `lib/types/marketplace.ts` — `CartItem`/`OrderItem` are now
  polymorphic (`productId`+`sku` *or* `hamperId`, optional instead of a
  required `productId`) to model a hamper as a real cart/order line;
  `Order.deliveryDate` (single, order-wide) replaced by `Order.shipments:
  OrderShipment[]` (`{addressId, deliveryDate?}`, one per shipping
  address) for real per-address delivery dates.

### Decisions for Opus to confirm

- **Gift-to-recipient ships the whole order to one recipient**, rather
  than being combinable with per-item multi-address splitting — you're
  either shipping your cart across your own saved addresses, or sending
  the entire order to someone else as a gift, not both at once. Simpler
  mental model, matches how gifting actually works; flag if a mixed
  "some items to me, one item to a gift recipient" flow turns out to be
  wanted.
- **Hamper's recipient/hide-price fields go unused by the builder UI** —
  `Hamper.recipientAddressId`/`hidePrice` exist on the type (from M0) but
  the Message step only sets `giftNote`/`wrap`/`ribbon`/`nameCard`;
  gift-to-recipient is Checkout's order-wide `Order.gift`, applied
  uniformly whether the cart holds products, a hamper, or both.
- **Hamper builder is 3 real wizard steps, not the prototype's one
  combined Box+Fill screen** — `StepPills` implies a genuine wizard, so
  Box and Fill were split into their own screens (box picker only, then
  fill grid only) rather than reproducing the prototype's single static
  view with both visible at once.
- **Checkout's inline "add address" and the gift-recipient form share
  one `AddressForm` field-set component** rather than each rolling their
  own inputs — same fields (name/phone/line1/line2/city/state/pincode),
  no existing `ui/` text-input primitive to reuse.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — `/hamper`, `/cart`, `/checkout` all statically prerender.
- Live QA via headless browser at 360/768/1180px: full flow exercised
  end-to-end — add from Product detail *and* a Shop grid card → header
  badge updates on both → Cart (qty edit, remove, merge-on-re-add
  confirmed) → Checkout (multi-address reassignment, per-address
  delivery date, gift-to-recipient with hide-price + validation on an
  incomplete recipient form, wallet vs. Razorpay) → place order → order
  confirmation → cart cleared (`localStorage` verified empty) — twice,
  once as a plain product order and once as a hamper (Box→Fill,
  capacity-capped at 5/5 for Signature confirmed disabling further
  "+ Add"s →Message→ hand-off into Checkout as one line). Reloaded mid-
  cart to confirm `localStorage` persistence survives a refresh.
  Zero console errors, zero horizontal overflow at any width, tap
  targets re-checked ≥44px on mobile (two found under 44px during QA —
  Cart's "Remove"/"Continue shopping" text links — padded to a 44px hit
  area without growing the visible text).
- Colors verified: pine primary/headings, gold decorative-only (eyebrows,
  capacity fraction, cashback lines), terracotta on marketplace prices/
  remove — the Hamper fill-grid/basket item prices intentionally stay
  pine (not terracotta), matching the prototype's own hamper screen
  exactly (only the box-tier price is terracotta there).
- Found and fixed one real bug during QA: the wallet payment tile could
  end up simultaneously `disabled` (insufficient balance) and visually
  "selected" when a hamper hand-off grew the cart total after Checkout
  had already picked a default payment method — `paymentMethod` is now a
  *derived* value (`walletSufficient ? preferredPaymentMethod :
  "razorpay"`) instead of state that could go stale, so it can never
  under-report `walletApplied` at order time.
- Found and fixed one design gap during QA: the initial mobile "sticky
  aside" (`position: sticky; bottom: 0` on the whole card) never
  actually stuck — a long fill grid or address list scrolls the aside's
  normal-flow position far below the fold before sticky has anything to
  pin against. Replaced with `StickySummary`'s new `stickyOnMobile` prop
  (fixed-position CTA bar only, card stays in flow) — verified by
  scrolling a long Hamper fill grid and confirming the CTA stays pinned.

### Notes for M4/M6/M8

- **M4 (Laundry)** can reuse `StickySummary`'s new `beforeLines`/
  `stickyOnMobile` props for its own booking summary if useful — both
  are additive and off by default.
- **M6 (Wallet)** owns the real wallet-debit ledger entry on order
  placement — `createOrder` currently just records `walletApplied` on
  the `Order` without writing a `WalletTransaction` or decrementing
  `Wallet.balance`; M6 should wire that ledger write in.
- **M7 (Account)** owns full address-book CRUD — Checkout's inline "add
  address" only appends to an in-session list (`lib/data/user.ts`'s
  `addresses[]` isn't mutated); order history/detail (`/account/orders`)
  reads the `Order`s `createOrder` produces.
- **M8 (backend)** swaps `lib/cart/CartContext`'s `localStorage`
  read/write for server-backed calls (same `useCart()` shape), and
  `lib/api/orders.ts`'s in-memory array/sequence for a real Postgres
  `Order` table — both currently run client-side with no persistence
  beyond a browser tab/session, called out inline in each file's
  comments.

## [M2] — Marketplace browse — 2026-07-24

The Gifting Marketplace's read/browse surfaces: Home, Shop listing,
Product detail, Maker storefront, Occasion collections, and a new
Reviews UI — all ported from `handoff/prototype/Homekrafted.dc.html`
(Home/Shop/Product) or built from the same design language for the two
screens the prototype doesn't cover (Storefront, Collections — both
spec'd in `handoff/specs/screens.md` under "To build"). Composes the 26
M1 primitives; adds feature components under `components/{home,product,
storefront,review}/` (see `docs/DESIGN-SYSTEM.md` → "M2 feature
components"). Cart/checkout/hamper stays out of scope — M3.

### Added

- `app/page.tsx` (+ `page.module.css`) — full Home, replacing the M0
  placeholder: hero (`components/home/Hero.tsx`), shop-by-occasion
  (`OccasionTileLink` → `/collections/[occasion]`), shop-by-category
  (`CategoryTileLink` → `/shop?category=`), "this week's small batches"
  featured rail, hamper + wallet `PromoBand`s, "One home, three crafts"
  services band (`CraftCard` × 3 — Laundry/Food Delivery/Snacks, each
  sourcing its badge from `lib/channel.ts`), and the app-install panel
  (`AppInstallPanel`).
- `app/shop/page.tsx` + `ShopClient.tsx` (+ CSS) — filter sidebar
  (category/dietary/occasion checkboxes + `PriceRange`), sort (most
  loved/price asc/desc), removable active-filter chips, `ProductGridCard`
  grid, pagination (6/page). All filter/sort/pagination state is
  client-side over the mock catalog. `?category=`/`?occasion=` query
  params (set by Home's tiles) seed the initial selection. Sidebar
  collapses to a "Filters" toggle below 900px.
- `app/product/[slug]/page.tsx` (+ CSS, `notFound()` on a bad slug) —
  gallery (`ProductGallery`), maker eyebrow linking to the storefront,
  title, rating, `ProductPurchasePanel` (weight chips, quantity, wallet
  cashback line recomputed per selected weight, add-to-cart as a local
  no-op + inline toast — M3 owns real cart, add-to-hamper CTA, gift
  block), and `ProductTabs` (Description + spec table / Reviews).
- `app/storefront/[vendor]/page.tsx` (+ CSS, `notFound()` on a bad slug)
  — `StoreHeader` (banner, avatar, name, rating, `FollowButton`, bio,
  location), that vendor's `ProductGridCard` grid, and their reviews.
- `app/collections/[occasion]/page.tsx` (+ CSS, `notFound()` on a bad
  slug) — occasion hero + `ProductGridCard` grid. Uses the curated
  `Collection` (title/description/hand-picked order) when one exists for
  the occasion (Diwali, Corporate), else falls back to a plain
  `getProductsByOccasion` filter so every occasion slug still resolves.
- `components/review/ReviewCard.tsx` + `ReviewList.tsx` (+ CSS) — star
  row, author + `formatDate`, verified-purchase badge, body; reused on
  Product detail and Storefront.
- `components/product/ProductGridCard.tsx` — thin client wrapper around
  `ProductCard` (navigate on click, local wishlist/"added" state); the
  one shared piece every product grid in M2 reuses.
- `lib/data/reviews.ts` + `lib/api/reviews.ts` — 27 seeded reviews across
  products and vendors (`getReviewsForProduct`/`getReviewsForVendor` data
  helpers, `getProductReviews`/`getVendorReviews` API functions).
- Small `lib/data`/`lib/api` additions needed for the new lookups:
  `getCategoryById`, `getVendorById`, `getCollectionByOccasionId` (data)
  and their `lib/api` counterparts — all following the existing
  by-slug getter pattern.

### Decisions for Opus to confirm

- **Home's occasion tiles now link to `/collections/[occasion]`** rather
  than the prototype's undifferentiated `goShop()` — a deliberate M2
  extension now that Collections is a real route, not a demo screen
  switch. Category tiles link to `/shop?category=[slug]` for the same
  reason (real filtering vs. the prototype's flat click-through).
- **Shop's price-range bounds are computed from the live product set**
  (`Math.min`/`Math.max` over each product's default-weight price)
  rather than the prototype's hardcoded ₹120–₹1,500 — ties the filter to
  real data instead of a demo constant that would silently go stale.
- **Reviews tab on Product detail is a genuine M2 addition** — the
  prototype never shows reviews anywhere; built to spec via
  `handoff/specs/screens.md`'s "Ratings & reviews" line item and the
  `Review` type that was already in `lib/types/shared.ts` from M0.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` — all 6 new/changed routes compile (`/`, `/shop`,
  `/product/[slug]`, `/storefront/[vendor]`, `/collections/[occasion]`
  dynamic; `/` static).
- Live QA via headless browser at 360/768/1180px across all 6 surfaces
  plus `?category=`/`?occasion=` query variants: zero console errors,
  zero horizontal overflow, two-column sections collapse to one column
  on mobile, Shop's sidebar collapses to a working "Filters" toggle,
  weight-selector price/cashback recompute live, Reviews tab renders,
  `notFound()` confirmed on bad `/product`, `/storefront`, `/collections`
  slugs. Fixed one bug found in QA: `StoreHeader`'s vendor name/rating/
  follow button were overlapping the banner image at all three widths
  (the banner-overlap negative margin was applied to the whole header row
  instead of just the avatar) — moved the `-40px` overlap onto `.avatar`
  alone so only the avatar pokes over the banner, matching the intended
  profile-header look.
- Colors verified: pine primary, gold decorative-only (eyebrows, "view
  all"), terracotta on prices, WhatsApp green confined to the Snacks
  `CraftCard` and its `ChannelBadge`.
- Channel correctness on Home confirmed against `lib/channel.ts`:
  Laundry badge is "Book online now" (pine) linking to `/laundry`, Food
  Delivery is "On the app · Coming soon" (gold-dark) with no web
  order path, Snacks is "Order on WhatsApp" (whatsapp) linking to
  `/snacks`.

### Notes for M3

- Add-to-cart in `ProductPurchasePanel` is a local no-op (`added` state +
  inline toast, no cart mutation) — M3 should wire it to a real
  `lib/api` cart mutation, using `selectedSku` + `quantity` (already
  tracked in that component's local state) as the payload shape.
- `ProductGridCard`'s wishlist toggle is local-only (no persistence) —
  M3/M7 should lift this to a real wishlist mutation once one exists;
  the prop shape (`wishlisted`/`onToggleWishlist`) is already what
  `ProductCard` expects.
- `Product.weightOptions` (sku/label/price/mrp/stock) is the shape M3's
  cart line items should key off — `ProductPurchasePanel` already
  resolves the selected `WeightOption` by `sku`, so a cart item is just
  `{ productId, sku, quantity }` plus whatever `giftWrap`/`addressId`
  checkout adds.

## [M1] — UI primitives — 2026-07-24

26 `components/ui/` primitives ported from `handoff/design-system/components.md`
into CSS Modules over `tokens.css`, plus the dev-only gallery used to QA them.
Built against the now-monorepo layout (`client/` holds all web source;
`server/` and root `app/` are M8+/future placeholders).

### Added

- `client/components/ui/` — all 26 primitives from the component inventory:
  `Button`, `QuantityStepper`, `Chip`, `ChannelBadge`, `Tag`, `DietDot`,
  `Card`, `ProductCard`, `CategoryTile`, `OccasionTile`, `SnackCard`,
  `ServiceCard`, `PromoBand`, `WalletBalanceCard`, `StickySummary`,
  `SearchField`, `SlotPicker`, `AmountPicker`, `PriceRange`, `PhotoUpload`,
  `Textarea`, `StepPills`, `CapacityMeter`, `StatusTimeline`,
  `TransactionRow`, `QRTile`, `StoreBadges`. Named exports, `Thing.tsx` +
  `Thing.module.css` co-located, every image area routed through
  `<ImageSlot>`, every color a `var(--hk-...)` token reference.
- `client/styles/tokens.extend.css` — centralizes the M0-flagged token
  gaps (on-pine copy, small-size gold text, the footer's on-pine-deep
  ramp, the scrollbar tint) as real custom properties instead of
  hardcoded-per-component hex; imported once in `app/layout.tsx` right
  after `globals.css`. `tokens.css` itself stays untouched. See
  `CLAUDE.md` → "Known token gaps" and `docs/DESIGN-SYSTEM.md` for the
  full var list.
- `client/app/gallery/` (`page.tsx` + `GalleryClient.tsx` +
  `gallery.module.css`) — dev-only gallery rendering every primitive in
  every documented state against real `lib/api` mock data. Guarded with
  `notFound()` when `NODE_ENV === "production"` (verified: the production
  build emits a 404 response for `/gallery`); unlinked from any nav.

### Verified

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean from
  `client/` (cleared `.next` first to rule out stale-cache errors).
- Live QA via headless browser at 360 / 768 / 1180px: every primitive +
  documented state renders, zero console errors, zero horizontal scroll
  (`document.documentElement.scrollWidth === clientWidth` at all three
  widths), colors correct — pine primary, gold decorative-only (eyebrows/
  labels, never small regular-weight body text), terracotta on
  prices/remove/ServiceCard pricing, WhatsApp green confined to the
  `whatsapp` Button variant and the `snacks` ChannelBadge.
- Icon-button `sm` size (36px) is intentionally below the general 44px
  tap-target guideline — `components.md` itself documents the icon-button
  range as "30–52px", so this is spec-compliant, not a gap.

### Notes / decisions for Opus to confirm

- A small set of intentional deviations from the prototype are documented
  inline in the affected component and summarized in
  `docs/DESIGN-SYSTEM.md` → "Documented deviations from the prototype":
  `ProductCard`'s filled-heart wishlisted state (prototype never shows
  one), `StatusTimeline`'s `current` (in-progress) step, `PriceRange`
  built as two real range inputs instead of the prototype's static bar,
  and a few near-identical prototype hex values normalized to the nearest
  existing token (`#C9A24a` → `--hk-gold-border`, `#EEEDE9` →
  `--hk-border`).
- `ServiceCard`'s per-unit price uses `--hk-terracotta` — `design-system.md`'s
  color table scopes terracotta to "Marketplace prices... remove ✕", but
  the prototype's own laundry service cards render `s.price` in the
  identical `#B65D3C` (confirmed in `Homekrafted.dc.html` line 248), so
  this is a faithful port, not a scope violation — the doc's wording is
  just narrower than the prototype's actual usage.

## [M0] — Foundation — 2026-07-23

Greenfield scaffold. No feature screens yet (those start M2) — this
milestone is tokens, types, mock data, the app shell, and living docs.

### Added

- Next.js app scaffolded at the project root (App Router, TypeScript,
  ESLint, npm), `@/*` path alias, git repo initialized (no commits made).
  `handoff/` left untouched alongside it.
- `lucide-react` + `clsx` added as dependencies. Prisma/Auth.js/Razorpay
  intentionally **not** added (M8).
- `styles/tokens.css` — verbatim copy of
  `handoff/design-system/tokens.css` (single source of truth).
  `styles/globals.css` — reset, base body, `::selection`, scrollbar,
  `hkfade` keyframe, next/font-to-token variable bridge, `.container`
  layout utility.
- `lib/tokens.ts` — typed mirror of `tokens.json`.
- Fonts wired via `next/font/google` in `app/layout.tsx`: Fraunces
  (400–700 + italic), IBM Plex Sans (400/500/600), IBM Plex Mono
  (400/500) — exposed as CSS vars that `--hk-font-*` tokens consume.
- `lib/types/` — full domain model (schema contract for the M8 Prisma
  pass): `shared.ts`, `wallet.ts`, `marketplace.ts`, `laundry.ts`,
  `food.ts`, barreled via `index.ts`. Every entity from the plan's domain
  model section is present with precise union types for every enum-like
  field (order/booking status, payment method, transaction category,
  pricing model, etc.).
- `lib/data/` — mock data seeded from the prototype's real sample data:
  8 products (+ featured subset), 8 vendors, 8 categories, 8 occasions, 2
  collections, 6 snacks (+ a sample snack list), 4 laundry services + 4
  pickup days + 3 slots + 4 how-it-works steps, 1 wallet + 6 reconciled
  ledger transactions, 3 hamper boxes, 4 top-up options, footer columns,
  trust stats, announcement items, a demo user + address + cart.
- `lib/format/` — `formatCurrency` (₹, `en-IN` grouping,
  optional signed ledger format) and date helpers (`formatDate`,
  `formatShortDate`, `formatDayLabel`).
- `lib/channel.ts` — `CHANNEL_RULES` encoding the plan's channel matrix
  (Marketplace/Laundry web-checkout, Snacks WhatsApp-only-no-cart, full
  meals promo-only-no-menu) as data, plus channel badge config.
- `lib/messaging.ts` — `Messaging` interface, `buildWhatsAppLink`
  (`wa.me` deep link), `ClickToChatMessaging` implementation, documented
  stub for the M9 WhatsApp Cloud API implementation.
- `lib/api/` — typed `async` client-stub functions over `lib/data`
  (products, vendors, catalog, snacks, laundry, wallet, site chrome) —
  the only data-access boundary components should use; swapping to real
  endpoints in M8 only touches this layer.
- App shell (`components/layout/`): `AnnouncementBar`, `Header` (server
  data-fetch wrapper) + `HeaderClient` (interactive), `MobileDrawer`,
  `Footer` — wired into `app/layout.tsx`. Header collapses to a hamburger
  + slide-in drawer below ~840px; wallet chip and cart badge stay visible
  at all widths.
- `components/placeholder/ImageSlot.tsx` — labelled diagonal-hatch
  placeholder (ratio/label/size/shape props), the only sanctioned way to
  render an image slot until real photography exists.
- `app/page.tsx` — minimal, token-styled Home placeholder (real Home is
  M2).
- Root `CLAUDE.md`, `docs/{PRD,API,ARCHITECTURE,DATA-MODEL,
  DESIGN-SYSTEM}.md`, `docs/adr/0001-stack.md`, this `CHANGELOG.md`.

### Notes / decisions for Opus to confirm

See "Decisions made in M0 that Opus should confirm" in `CLAUDE.md` —
covers the `/about` nav target, Wishlist added to `MobileDrawer`,
`LoyaltyTier` naming, laundry `pricingModel` assignment, corrected
laundry day-picker calendar labels, the recomputed snack-list estimate,
and seeding all 8 vendors rather than a subset. Also see "Known token
gaps" — a handful of prototype colors (on-solid-pine text, small-size
gold-family text, the footer's on-pine-deep ramp) aren't in `tokens.css`
yet; hardcoded locally with comments rather than invented or left
under-contrasted.

### Verified

`npm run build`, `npx tsc --noEmit`, and `npm run lint` all clean.
Dev server boots with no console/runtime errors; shell + minimal Home
render correctly. Compiled CSS confirmed to carry the 840/780/640/480/
420/400px responsive rules; no horizontal-overflow-prone fixed widths
found.
