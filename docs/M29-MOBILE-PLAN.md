# M29 — Mobile viewport UI/UX pass (plan)

Planning document only. Written from source reading on 2026-08-10; the dev
environment was not running, so anything that needs a screenshot to decide
is marked `[inferred]` with the command that settles it
(`node e2e/sweep.mjs --viewport=mobile --only=/route`). All paths are
relative to `client/` unless they start with `e2e/` or `docs/`.

---

## Implementation status — 2026-08-10

**Shipped:** every P1 in the table plus the guardrails. Rows 2–13 (the
input-zoom class, fixed with one global rule rather than 34 module blocks —
see the note below), 14–16 (shell parity via the extracted
`.hk-strip-fade`), 17 (the portal nav, with a **corrected diagnosis** — see
below), 18 (the reel viewer dialog contract, which turned up a latent bug
in the M16 focus selector), 19 (the notification matrix), 20 (the stale
comment), 22–23 (the two isolated touch targets). Plus one defect this plan
did not find, surfaced by the sweep: `/checkout` rendered **no `h1`** for a
signed-in buyer with an empty cart.

**Row 1 — the plan's headline item — was a false finding.** `.featuredGrid`
was real, its arithmetic was right, and the reference fix it was compared
against was real, so it survived both the plan's own source check and mine.
Nothing renders it: `app/page.tsx` is that stylesheet's only importer and
stopped referencing the class in M20. The live home page has no product
grid at all. Caught by opening the deployed site at 390px — about ten
seconds of looking, after the "fix" had already shipped. The dead rule and
`.servicesGrid` (dead since the same milestone) are deleted, with the
reasoning left in `page.module.css`. **A defect found by reading a
stylesheet is a hypothesis until a rendered page confirms it** — dead CSS
reads exactly like live CSS.

**Three more places the plan was wrong, recorded because the reasoning
matters more than the outcome:**

1. **The input-zoom fix is one global rule, not 34 module blocks.** The
   plan's per-module recommendation was correct about specificity — an
   element selector in `globals.css` does lose to a module class — but
   drew the wrong conclusion. The class of bug is "somebody added a text
   control and didn't know", and 34 copies teach the 35th file nothing.
   One `!important` rule inside a mobile media query, plus the sweep's
   `inputzoom` flag, holds the rule where 34 copies would drift. Verified
   before shipping that it raises values and never lowers them: no control
   in the tree sets a font-size at or above 16px, and none uses
   em/rem/clamp.
2. **Row 17's "something resets `scrollLeft`" was not reproducible.**
   Measured before writing any fix: `scrollLeft = 739` on
   `/seller/payouts` clamped to 726 and was still 726 twelve hundred
   milliseconds later, with no `scroll` event in between. The cause was the
   *other* hypothesis TODOS.md named — a late mount. So the plan's
   watchdog-rAF proposal was dropped: it would have been permanent code
   fighting nothing. Full account in `TODOS.md`.
3. **Row 14's `[inferred]` overflow risk was not confirmed as a live
   overflow** — the sweep reports zero horizontal scroll on `/account/*`
   both before and after. The `align-items: stretch` override was applied
   anyway, on the narrower ground that both sibling shells carry it with a
   comment explaining a bug found live at 360px, and a third shell
   silently lacking it is a difference nobody chose.

**Not done, deliberately:** row 21 (`/account/orders` status timeline) —
the sweep reports no overflow there, so the `[inferred]` premise did not
hold. Rows 24–25 (the `Button.sm` / `iconSm` / header-icon question) — open
owner decision, unchanged; see "Open questions" §1. Phase 4's admin form
inputs are covered by the global rule rather than per-module. Breakpoint
normalisation remains fold-on-touch as recommended.

**Verified:** 193 client unit tests, 163 browser tests, a clean production
build, and both sweeps (87 routes × 4 roles) with one flagged row each —
`/laundry` 404, which is correct. Zero overflow, zero axe violations, zero
`inputzoom`, zero undersized targets. Then re-verified against the deployed
site at 390px: login inputs measure 16px, `/`, `/shop`, `/snacks` and
`/sell` measure zero horizontal overflow — and row 1's grid turned out not
to exist.

Working constants used throughout: mobile viewport is **390×844**
(`e2e/sweep.mjs:166`); `.container` pads 16px per side below 420px
(`styles/globals.css:146-150`), so the content column at 390px is **358px**.

---

## Verdict

Mobile here is in far better shape than a 105-of-193-modules-have-no-media-query
count suggests. The consumer buy path has been genuinely worked — the
two-products-per-row fix is propagated across `/shop`, `/search`, `/gifts`,
`/hamper`, `/snacks`, `/storefront`, `/guides` and `/collections/[occasion]`
with the reasoning written into each file, checkout and cart have a
deliberate fixed-CTA-bar pattern with cleared padding, the announcement bar
was single-lined for phones, and forms collapse their grids. What remains is
narrow and specific: **the home page itself missed the two-per-row grid fix**
that every other browse surface got; **every text input on the site is 13–14.5px,
which makes iOS Safari zoom the page on focus** — a mechanical, site-wide
class including login, checkout address entry and the wallet top-up;
**the account and admin portal nav strips never received the M28 affordance
and overflow fixes the seller strip got**; the reel viewer claims
`aria-modal` and honours none of the M16 dialog contract; and the seller
nav scroll-to-active item from TODOS.md is still open. A modest set of
sub-44px touch targets rounds it out — all of them pass the WCAG 2.2 floor
the sweep enforces, so they are guideline improvements, not violations.

## The breakpoint decision

**Recommendation: name a rail set, mandate it for new code, and do not
run a normalisation pass.**

The proposed rails are the five values that already carry the bulk of the
codebase — **420, 560, 640, 780, 900** (together over 600 of the measured
uses) — plus two protected constants that are *measurements, not
design decisions*: **1190** (the header collapse point, measured in M21,
per CLAUDE.md do not change without re-measuring) and the `.container`
padding steps at 780/420 (`styles/globals.css:140-150`), which already
sit on the rails. Rough semantics: 420 = small phone, 560 = phone, 640 =
large phone / where fixed CTA bars engage, 780 = the shell/sidebar
collapse, 900 = two-pane layouts go single-column.

Where they live: **as documentation only** — a short block in `CLAUDE.md`
(and this file). They cannot live as code: CSS custom properties are not
valid inside `@media` conditions, and the only mechanisms that fix that
(`postcss-custom-media`, a preprocessor) are new dependencies, which this
plan is not allowed and the repo does not want. A constants file that
components interpolate would mean CSS-in-JS. So the rail set is a
convention, enforced at review time.

Why not normalise the 27-value sprawl now: the long tail (270, 280, 380,
400, 440, 460, 620, 680, 700, 720, 760…) is `max-width` queries, where an
odd value is cognitively untidy but almost never *wrong* — each was
picked by looking at where that component broke. Rewriting them is a
100+ file mechanical diff with no user-visible payoff, unreviewable in
exactly the way TODOS.md's apostrophe entry declined ("a mechanical sweep
over every string at the least stable moment before launch"). The
migration stance instead: **when this plan already touches a file for a
real defect, fold its off-rail breakpoints to the nearest rail in the
same commit** — the diff is then reviewed in the context of a substantive
change, and files nobody touches keep working values. Over a few
milestones the tail shortens by attrition instead of by churn.

---

## Phases

Each phase ends the same way: `node e2e/sweep.mjs --viewport=mobile
--only=<the routes touched>` — screenshots plus the OVERFLOW / tap / axe
flags — and the contrast columns of that output are the contrast pass
CLAUDE.md requires. None of the fixes below changes a text/background
colour pair; the fades in Phases 2–3 are decorative gradients over
`--hk-surface` carrying no text (same recipe already shipped in M28).

### Phase 1 — Consumer buy path

**1a. The home page browse grid.** `app/page.module.css:69-73`
`.featuredGrid` is `repeat(auto-fill, minmax(210px, 1fr))`: two columns
need 210+16+210 = 436px, which 358px never has, so the featured products
render **one ~360px card per row on the highest-traffic page of the
site** — the exact defect whose fix is documented in
`app/shop/ShopClient.module.css:190-203` ("a marketplace that shows one
product per screen is a marketplace nobody browses") and was propagated
to seven other surfaces but not to `/`. Fix: the same
`@media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--hk-s3); }`
block, same comment convention. `.occasionGrid` (120px) and
`.categoryGrid` (140px) already fit two-plus columns and need nothing.
Verify: `node e2e/sweep.mjs --viewport=mobile --only=/` — compare the
screenshot against `.qa-shots/mobile/shop.png`.

**1b. iOS input zoom, consumer files.** iOS Safari zooms the page when a
focused `input`/`select`/`textarea` has font-size under 16px. Every form
control in the codebase is 13–14.5px (full inventory in the table), so
every focus on an iPhone shifts the layout and leaves the page zoomed.
Fix pattern, applied per module (a global element rule in `globals.css`
loses to every module's class selector, so it must be per-module): inside
the module's existing mobile block or a new
`@media (max-width: 780px)` block, set the input class to
`font-size: 16px`. Keep desktop sizes untouched. The two primitives
(`components/ui/SearchField.module.css:23-32`,
`components/ui/Textarea.module.css:13-25`) cover many callers at once —
SearchField is in the header drawer (`components/layout/MobileDrawer.tsx:123`)
and `/snacks`; Textarea is reviews, support, the checkout gift note.
Then the consumer form modules: `components/auth/LoginClient.module.css:142-148`,
`components/auth/PasswordResetClient.module.css:54`,
`components/checkout/AddressForm.module.css:26-31`,
`components/wallet/WalletClient.module.css:128-137`,
`components/search/SearchForm.module.css:36`,
`components/sell/SellerApplicationClient.module.css:144-149`,
`components/account/AddressBookClient.module.css:80`,
`components/account/ProfileClient.module.css:104`,
`components/review/ReviewForm.module.css:83-88`,
`components/corporate/CorporateInquiryClient.module.css:76-81`,
`components/corporate/QuoteClient.module.css:259`,
`components/support/SupportClient.module.css:213-218`.
Do **not** touch the viewport meta (`maximum-scale=1` also suppresses the
zoom but disables pinch-zoom for everyone — an accessibility violation).
Verify: the new sweep probe in Phase 5 flags nothing on these routes; spot
check on a real iPhone if one is at hand.

**1c. Reel viewer dialog contract.** `components/home/ReelViewer.tsx:77`
renders `role="dialog" aria-modal="true"` with Escape handling and scroll
lock, but none of the three things CLAUDE.md's M16 floor says a dialog
owes: no focus moved in on open, no Tab trap, no focus restore to the
opener. On a phone this is a full-screen surface reachable from the home
rail. Fix: port the mechanics from `MobileDrawer` (named in CLAUDE.md as
a reference implementation) — focus the close button on open, trap Tab at
both ends, restore to the triggering reel card on close. Verify: extend
`e2e/tests/focus-traps.spec.ts` (see Tests owed).

**1d. Touch targets on the buy path.** All current offenders clear the
24px+spacing WCAG 2.2 floor the sweep enforces, so these are 44px-guideline
upgrades, cheap where the layout already has room:
`components/layout/MobileDrawer.module.css:69-79` close button 36→44px
(the header row has the height); `app/shop/ShopClient.module.css:158`
pagination `.pageBtn` 40→44px min (it is the last control on the page,
nothing constrains it). Leave `Button` `.sm`/`.iconSm` and the 38px
header icons for the batch decision in "Open questions" — changing the
`Button` primitive re-densifies every screen at once and deserves its own
sweep run.

### Phase 2 — Account

**2a. AccountShell strip parity.**
`components/account/AccountShell.module.css:49-66` is the pre-M28 version
of the portal strip: 10 destinations, ~4 visible at 390px, and it is
missing all three things its siblings have — (1) the
`align-items: stretch` override both `SellerShell.module.css:154-172` and
`AdminShell.module.css:176-185` carry with a comment explaining the
found-live-at-360px content-clipping bug (`.page` sets
`align-items: flex-start` at `AccountShell.module.css:3`, so in the
stacked column layout `.content` shrink-to-fits and wide children — the
referrals stat grid `ReferralsClient.module.css:296`, order rows — can
clip against `body{overflow-x:hidden}` silently) `[inferred from the
documented sibling bug, not re-measured]`; (2) the edge-fade affordance
block (`SellerShell.module.css:181-214`) that says the strip scrolls; (3)
`-webkit-overflow-scrolling: touch` + scrollbar suppression. Fix: apply
the same three blocks. The fade recipe is currently written inline in
SellerShell; copying it twice more is three copies of a non-trivial
recipe — extract it as a `.hk-scroll-fade` utility in
`styles/globals.css` next to `.hk-scroll` (it is behavioural CSS like
`.hk-sr-only`, exactly what globals.css centralises), and re-point
SellerShell at it in the same commit.

**2b. Notification preference matrix.**
`components/account/NotificationsClient.module.css:60-67`: rows are
`grid-template-columns: 1.2fr repeat(4, 58px)` with `min-width: 400px`
inside an `overflow-x: auto` wrapper — at 358px it scrolls ~42px
sideways with no affordance, hiding the WhatsApp column, and this is the
screen where a buyer turns order updates on. 4×58px + 3×6px gaps = 250px,
leaving 108px for category labels at 358px. Fix: shrink channel columns
to 44px (still a full-size checkbox target), tighten to
`1fr repeat(4, 44px)` = 194px + labels 164px, drop the `min-width`, and
let category labels wrap to two lines. If the labels can't survive 164px
`[needs the screenshot]`, keep the scroll and add the Phase 2a fade
utility instead. Verify:
`node e2e/sweep.mjs --viewport=mobile --only=/account/notifications`.

**2c. Screenshot-first checks (no code until seen).**
`components/account/SubscriptionsListClient.module.css:200` — the
delivery row is `1fr auto auto auto` (date + mono window + mono status);
three no-shrink auto columns plus gaps may squeeze the date to nothing at
358px `[inferred]`. Also fix the stale comment at :198 — it promises "the
media query at the end" and the file has none (the reason line actually
wraps via `.deliveryReason { grid-column: 1 / -1 }` at the file's tail).
`components/account/OrderDetailClient.module.css:52-54` — `.statusCard`
is `overflow-x: auto` around the `StatusTimeline`; if the timeline
overflows at 390px it scrolls with no affordance `[inferred]` — if the
screenshot confirms, the Phase 2a fade utility is the fix. Verify both:
`node e2e/sweep.mjs --viewport=mobile --only=/account/subscriptions,/account/orders`.

### Phase 3 — Seller portal

**3a. Scroll the active nav item into view** — the TODOS.md item; full
proposal in its own section below.

**3b. Seller form inputs to 16px on mobile** (same class as 1b; a
HomeKrafter runs their business from a phone):
`components/seller/ListingForm.module.css:49` and the `.weightInput` at
:128, `components/seller/MealPlanForm.module.css:49`,
`components/seller/SnackMenuForm.module.css:43-48`,
`components/seller/SellerProfileClient.module.css:82-87`,
`components/seller/SellerStorefrontClient.module.css:50-55`.
Verify: sweep `--only=/seller/listings/new,/seller/menu/new,/seller/profile`.

### Phase 4 — Admin

Kept minimal on purpose — CLAUDE.md: the admin panel stays plain, and an
operator is mostly on a desktop. Two items only:
`components/admin/AdminShell.module.css:187-197` gets the Phase 2a fade
utility (13 destinations, ~4 visible; a fade is affordance, not whimsy)
and, if 3a's shared hook lands cleanly, the same scroll-to-active. The
admin form inputs (`SettingsClient.module.css:43-48`,
`AdminLoginClient.module.css:84`, `PayoutsClient.module.css:138`,
`OccasionsClient.module.css:82`, `CollectionEditorClient.module.css:58`,
`HomePromoEditorClient.module.css:48`,
`CorporateInquiryDetailClient.module.css:171`,
`AdminUserWalletDetailClient.module.css:64`) take the same 16px mobile
rule as 1b/3b — it is the same three-line block, and `/admin/login` is
reachable from a phone — but it is P2 and can trail.

### Phase 5 — Guardrails (make the classes unregressable)

See "Tests owed". Also: add the rail-set paragraph to `CLAUDE.md` (the
breakpoint decision above), and update `docs/TESTS.md` for the new spec.

---

## Per-defect table

Severity: P0 blocks a task on a phone / P1 makes it painful / P2 cosmetic
or guideline. "16px block" = the per-module
`@media (max-width: 780px) { <input class> { font-size: 16px; } }` fix.

| # | file:line | What breaks at 390px | Sev | Fix | Verified by |
|---|---|---|---|---|---|
| 1 | ~~`app/page.module.css:71`~~ | **FALSE FINDING.** The rule and its arithmetic are real; nothing renders the class. `app/page.tsx` is the only importer and dropped it in M20, so `/` has no product grid. Verified in a browser at 390px against the deployed site | — | rule deleted as dead CSS | live browser, not the stylesheet |
| 2 | `components/ui/SearchField.module.css:27` | 13px input → iOS zooms on focus (drawer search, snacks) | P1 | 16px block | new `inputzoom` sweep flag |
| 3 | `components/search/SearchForm.module.css:36` | 13px input, `/search` + header search | P1 | 16px block | same |
| 4 | `components/ui/Textarea.module.css:18` | 14.5px textarea → zoom (reviews, support, gift note) | P1 | 16px block | same |
| 5 | `components/auth/LoginClient.module.css:147` | 14px inputs on the login form; zoom on the first field of every session | P1 | 16px block | same |
| 6 | `components/auth/PasswordResetClient.module.css:54` | 14px inputs | P2 | 16px block | same |
| 7 | `components/checkout/AddressForm.module.css:31` | 14px inputs; zoom + layout shift mid-purchase | P1 | 16px block | same |
| 8 | `components/wallet/WalletClient.module.css:133` | 14.5px custom top-up amount input | P1 | 16px block | same |
| 9 | `components/sell/SellerApplicationClient.module.css:149` | 14px inputs on the supply-side application | P1 | 16px block | same |
| 10 | `components/account/AddressBookClient.module.css:80`, `components/account/ProfileClient.module.css:104` | 14px inputs | P2 | 16px block | same |
| 11 | `components/review/ReviewForm.module.css:88`, `components/support/SupportClient.module.css:218`, `components/corporate/CorporateInquiryClient.module.css:81`, `components/corporate/QuoteClient.module.css:259` | 14px inputs | P2 | 16px block | same |
| 12 | `components/seller/ListingForm.module.css:49,128`, `MealPlanForm.module.css:49`, `SnackMenuForm.module.css:48`, `SellerProfileClient.module.css:87`, `SellerStorefrontClient.module.css:55` | 13.5–14px inputs across the whole seller portal | P1 | 16px block | same |
| 13 | admin form modules (list in Phase 4) | 12.5–14px inputs, incl. `/admin/login` | P2 | 16px block | same |
| 14 | `components/account/AccountShell.module.css:49-66` | Mobile block lacks `align-items: stretch` → wide account content can clip against `body{overflow-x:hidden}` `[inferred from the documented sibling bug, SellerShell.module.css:154-172]` | P1 | copy the sibling override + comment | sweep `--only=/account` OVERFLOW flag + screenshot |
| 15 | `components/account/AccountShell.module.css:55-61` | 10-item nav strip, ~4 visible, no edge fades — items 5–10 invisible, the M28 seller-strip defect verbatim | P1 | `.hk-scroll-fade` utility (Phase 2a) | screenshot |
| 16 | `components/admin/AdminShell.module.css:187-197` | Same, 13 items | P2 | same utility | screenshot |
| 17 | `components/seller/SellerShell.tsx:174` + `TODOS.md` | Active portal nav item starts off-screen; `aria-current` points at something invisible | P1 | see next section | new `portal-nav.spec.ts` |
| 18 | `components/home/ReelViewer.tsx:77` | `aria-modal` with no focus-in / trap / restore — M16 contract unhonoured on a full-screen mobile surface | P1 | port `MobileDrawer` focus mechanics | `focus-traps.spec.ts` addition |
| 19 | `components/account/NotificationsClient.module.css:62,67` | 400px min-width prefs matrix scrolls ~42px with no affordance; WhatsApp column hidden | P1 | shrink to `1fr repeat(4,44px)`, drop min-width; fallback fade | sweep `--only=/account/notifications` |
| 20 | `components/account/SubscriptionsListClient.module.css:198-200` | Comment references a media query that does not exist; `1fr auto auto auto` row may crush the date column `[inferred]` | P2 | screenshot first; fix comment regardless | sweep `--only=/account/subscriptions` |
| 21 | `components/account/OrderDetailClient.module.css:52-54` | Status timeline scrolls sideways with no affordance `[inferred — may fit]` | P2 | fade utility if confirmed | sweep `--only=/account/orders` |
| 22 | `components/layout/MobileDrawer.module.css:69-79` | Close button 36×36 (passes 24px floor; under the 44px target) | P2 | 44×44 | sweep tap flag |
| 23 | `app/shop/ShopClient.module.css:158` | Pagination buttons 40×40 | P2 | 44px min | sweep tap flag |
| 24 | `components/ui/Button.module.css:42-45,101-104` | `.sm` computes ≈41px tall; `.iconSm` 36×36 — used portal-wide | P2 | owner decision (see Open questions) — `min-height: 44px` on `.sm` and 44px `.iconSm` re-densifies every screen | full mobile sweep after |
| 25 | `components/layout/Header.module.css:163,203` | 38×38 header icon buttons (cart, account) | P2 | fold into the #24 decision | same |

Not defects, confirmed while looking: cart/checkout/snacks fixed-CTA-bar
pattern (`StickySummary.module.css:83-96` + cleared padding in each
page), the announcement bar single-line scroll (`AnnouncementBar.module.css`),
footer collapse (`Footer.module.css:85-96`), `ListingForm`'s weight-row
flex-wrap fallback (:183-200), `CorporateInquiryDetailClient`'s 560px
stack (:243-249), `QuantityStepper` (52px targets), `Chip` (32px is a
documented deliberate floor, `Chip.module.css:24-30` — not relitigated).
`[inferred fine, screenshot to confirm]`: `/collections` hub tiles and
`/meal-plans` plan cards at one per row (rich, wide cards — plausibly
intended), `app-promo` at 230px minmax.

---

## The seller mobile nav (TODOS.md findings 1–3)

The three findings stand and are the starting capital: (1)
`scrollIntoView({inline:'nearest'})` no-ops here; (2) `offsetLeft` is
wrong because the nav establishes no containing block —
`getBoundingClientRect` deltas are the correct measure; (3) with correct
numbers the scroll *works* and something writes `scrollLeft` back to 0
within 500ms, and it was not `scroll-snap` (already removed,
`SellerShell.module.css:190-198`).

**Step 1 — identify the writer, exactly as TODOS.md prescribes.** In dev,
attach `nav.addEventListener('scroll', () => console.trace())` plus a
mount/unmount log in the shell. Two live hypotheses to separate: the App
Router's scroll handling on load/navigation, versus the nav element being
remounted after the effect (a remounted element has `scrollLeft` 0 and
would produce exactly this signature — worth checking even though
`SellerShell` lives in the persistent `(dashboard)/layout.tsx`, because
hydration or an auth-`ready` flip re-rendering the tree could still swap
the node). One dev session with the trace answers this; do not skip to
the fix.

**Step 2 — the fix, written to survive either answer.** A shared hook,
`lib/useScrollActiveIntoView.ts` (client-only — it reads the DOM, never
the clock, so no React #418 exposure):

- On `pathname` change (and once post-mount), find
  `[aria-current="page"]` inside the nav ref, compute the delta via
  `getBoundingClientRect` (finding 2), set `nav.scrollLeft` in a
  `useLayoutEffect`.
- **Watchdog for the resetter:** for the following ~800ms, if
  `scrollLeft` is externally reset toward 0 while the target was >0,
  re-apply once per animation frame — unless a `pointerdown`, `wheel` or
  `touchstart` has been seen on the nav, in which case the user owns the
  strip and the hook stands down permanently for that route. This wins
  against whatever Step 1 finds without needing to patch the router, and
  costs nothing after the first second.
- If Step 1 shows a remount, additionally keying the effect off the
  element instance (callback ref instead of `useRef`) fixes it at the
  root and the watchdog becomes belt-and-braces.

Apply the hook in `SellerShell`, then `AccountShell` and `AdminShell`
(same strip, same defect once their fades land — Phases 2a/4). Update the
TODOS.md entry and the pointer comment at `SellerShell.tsx:170-173` in
the same commit.

**Acceptance:** on a 390px viewport, navigate to `/seller/payouts`; 1s
later the `aria-current` item's box intersects the nav's visible box and
`scrollLeft` is stable. Pinned by the new `portal-nav.spec.ts` (below).
If Step 1 finds the resetter is unbeatable from component scope (e.g. a
router behaviour with no seam), ship the diagnosis back into TODOS.md
with the trace attached — that would still be more than the three
findings we have now — but the watchdog makes that outcome unlikely.

---

## Tests owed

- **iOS input zoom (the class, at full breadth):** extend the probe in
  `e2e/sweep.mjs` (~line 303, next to `unlabelledInputs`) to collect
  visible `input/select/textarea` with computed `font-size` < 16px, and
  print an `inputzoom:N` flag (~line 508). This covers all 87 routes × both
  viewports and makes the regression loud forever.
- **iOS input zoom (fast gate):** one new test in
  `e2e/tests/presentation.spec.ts` — at 390px, over `PUBLIC_ROUTES`, no
  visible text control under 16px. Reuses the existing 8-route list
  (`e2e/tests/public-routes.ts`) — **no routes added**, so the CI cost is
  one more loop over pages the gate already visits.
- **Portal nav scroll-to-active:** new `e2e/tests/portal-nav.spec.ts`,
  390×844, seller storage state (already minted by `auth.setup.ts`):
  goto `/seller/payouts`, assert the `[aria-current="page"]` item's
  bounding box intersects the nav's, and that it still does 1s later
  (the reset was measured inside 500ms, so the wait catches it). Add
  consumer/admin cases when 2a/4 land.
- **Reel viewer dialog:** a third case in `e2e/tests/focus-traps.spec.ts`
  (the file exists to hold exactly the M16 three-part contract): open a
  reel from the home rail, assert focus moved in, Tab wraps at both
  ends, Escape restores focus to the opening card.
- **Home grid:** no dedicated test — a computed-column assertion is
  brittle against legitimate redesign. The mobile sweep screenshot is the
  instrument (`CLAUDE.md` already requires the sweep before calling a
  visual change done), and `presentation.spec.ts`'s existing overflow
  test already covers the failure mode that would matter.
- **Docs in the same commits** (per CLAUDE.md's upkeep table):
  `docs/TESTS.md` for the new spec, `TODOS.md` for the nav item's
  resolution, `CHANGELOG.md` for the milestone.

## Explicitly not doing

- **Breakpoint normalisation as its own pass** — reasons in "The
  breakpoint decision": max-width tails are untidy, not broken, and a
  193-file mechanical diff is unreviewable pre-launch. Fold-on-touch only.
- **`styles/tokens.css` edits, of any kind** — law. Nothing in this plan
  needs a new token; the one shared addition (`.hk-scroll-fade`) is a
  utility class in `globals.css` beside `.hk-scroll`, not a token, and
  carries no text over its gradients so no contrast question.
- **Palette / texture / typeface changes** — open owner decision, not
  reopened here. Same for anything that reads as brand voice: no new
  loading strings (anything needed comes from `lib/kitchen-copy.ts`).
- **A viewport meta `maximum-scale` "fix" for input zoom** — it disables
  pinch zoom for every user; the 16px fix is the honest one.
- **Enlarging `Chip` to 44px** — `Chip.module.css:24-30` documents the
  32px floor as a deliberate call; the sweep's WCAG 2.5.8 spacing model
  passes it. Relitigating it is a density/brand call, flagged below only
  as part of the Button question.
- **A bottom tab bar or hamburger for the portal navs** — the shells'
  own comments already argue the strip over a drawer ("one fewer thing to
  get wrong on mobile") and against wrapping ("three stacked rows of
  chrome"); nothing found here overturns that.
- **Admin table/queue restructuring for phones** — the admin rows are
  flex-wrap with min-width floors and already collapse
  (`ApplicationRow.module.css:1-15` et al.); admin is a desktop surface
  and CLAUDE.md says it stays plain. Fades + inputs only.
- **`/gallery`** — dev-only QA surface, unlinked; not worth mobile
  polish.
- **Stored image variants / upload optimisation** — already tracked in
  TODOS.md with a seam; not a viewport issue.

## Open questions for the owner

1. **Do `Button.sm` (≈41px), `Button.iconSm` (36px) and the 38px header
   icons move to a 44px minimum on touch?** Two readings: "44px minimum"
   as a hard rule re-densifies every portal screen and the header (the
   header's height is load-bearing — the fixed-CTA clearance paddings
   and `top: 84px` stickies are tuned around it); "WCAG floor + spacing"
   (what the sweep enforces today) says they already pass. The plan
   fixes the two cheap, isolated cases (drawer close, pagination) either
   way; the primitive-level change is one decision with one full-sweep
   verification and should be made once, not per-file.
2. **The notification matrix at 358px:** if 44px channel columns leave
   category labels too cramped (screenshot will tell), is a sideways
   scroll with a fade acceptable on that screen, or should the matrix
   restructure to stacked per-category rows? The stacked form is more
   work and changes the screen's shape; two readings, materially
   different diffs.
3. **If the nav-strip resetter turns out to be router-level with no
   component-scope seam** (Step 1 outcome), is the watchdog's
   fight-the-router approach acceptable to ship, or does the item go back
   to TODOS.md with the diagnosis attached? The plan assumes the former;
   saying so out loud since M28 already chose "ship neither" once.
