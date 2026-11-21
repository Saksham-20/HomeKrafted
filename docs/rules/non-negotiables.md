# Non-negotiable rules, in full

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` carries a one-line summary of each.

## Non-negotiable rules

- **`handoff/` is the design system, not code to copy, and it stays
  untouched.** `tokens.css`, `tokens.json`, `design-system.md`,
  `components.md` are the visual contract. `Homekrafted.dc.html` (the
  `x-dc`/`DCLogic` comp) is a proprietary reference for exact colors,
  layout and sample data — never lift its markup or its inline-style
  approach, and never edit or delete anything under `handoff/`.
- **`styles/tokens.css` is law.** It's a verbatim copy — don't edit it to
  "fix" something; if a value is missing (see "Known token gaps" below),
  hardcode it locally with a comment and flag it, don't invent a token
  name and drop it straight into `tokens.css`.
- **White-first, warmth is accent-only.** Canvas `#F4F3F0`, cards
  `#FFFFFF` + `1px #ECEAE4` border. Never reintroduce beige/cream fills.
- **Gold (`--hk-gold` `#B98724`) is for fills, borders and rules — never
  for text.** Its contrast is 3.2:1 on white and 2.9:1 on the canvas.
  This rule used to carve out "pure decoration (eyebrows, 'view all')";
  the 2026-08-08 contrast audit deleted that carve-out, because an
  eyebrow labels a section and "View all" is a link — both are words
  somebody reads, and axe fails them. Small gold text takes
  **`--hk-gold-text-sm`**, which exists for exactly this. Terracotta
  (`--hk-terracotta`) is for prices/remove in the marketplace.
- **Every new surface owes a contrast pass, and two things measure it.**
  `e2e/tests/a11y.spec.ts` runs axe's `color-contrast` plus the structural
  WCAG rules over `e2e/tests/public-routes.ts` — **fourteen routes** since
  R4 added the three `/rider*` pages and R6a a fourth (`/rider/delete-account`) (this line said eight when the list
  held ten), a fast CI gate, not "every public route" (the claim this file
  carried until M26, and why 114 contrast failures accumulated on the
  other eighty).
  That list is shared with `presentation.spec.ts` since M27; the two used
  to disagree. Add a route there when you add one, and run `node e2e/sweep.mjs` (every
  route in its `ROUTES` list as the role that can reach it,
  at 2 viewports, screenshots included) before calling a
  visual change done. `--only=/some/route` while iterating.
- **Real photos where supplied, placeholder otherwise — always via
  `<ImageSlot>`.** Brand photography lives under
  `client/public/images/{products,categories,snacks,vendors,site}`;
  HomeKrafter- and buyer-uploaded photos live at `/uploads/...` (M14, see
  below). Both are just a `src` — `<ImageSlot src={...}>` falls back to the
  labelled diagonal-hatch placeholder when it's absent. **Never generate or
  AI-fabricate product/food imagery** (Firefly/Canva/Higgsfield image-gen
  stay unused) — only real assets, real uploads, or the placeholder.
  **Licensed stock photography counts as a real asset with two
  conditions (M56):** every committed stock file is recorded in
  `docs/IMAGE-LICENSES.md` (source URL, photographer, licence — Pexels
  only so far, and never a platform-labelled AI image), and it is a
  stand-in for the *demo* catalogue, replaced listing-by-listing as real
  makers upload their own work. New batches go through
  `client/scripts/process-stock-images.mjs` (1000×1000 JPEG q80, EXIF
  stripped — the M25 rule applied to our own assets).
- **CSS Modules only**, consuming token vars (`var(--hk-...)`), not
  scattered hex. No inline `style={{...}}` styling (that was the
  prototype's technique, not ours) except for genuinely dynamic values
  (e.g. `<ImageSlot>`'s `aspect-ratio`).
- Mobile-first, fluid. No fixed 430/1180 "stage" (that was the
  prototype's reviewer chrome). Container maxes out at 1180px via the
  `.container` utility class (`styles/globals.css`), grace­fully down to
  360px.

  **The consumer surface is 1440px wide; the portals stay 1180
  (2026-09-05).** `ConsumerChrome` renders a hidden
  `[data-surface="consumer"]` marker in the server HTML, and
  `styles/globals.css` widens `.container` inside `body:has()` of it — so
  every consumer page, the header and the footer share one left edge.
  The morning's version widened only `/`, `/shop`, `/gifts` and the
  chrome, and the design review measured the result: on every other
  route the lockup sat at x=44 and the page's first word at x=94, a 50px
  kink the eye reads as "off" without naming. The two portals have their
  own shells and their kit was measured against 1180 the day before, so
  they are deliberately outside the marker. **Running copy opts out with
  `container-prose`** (1180 — the legal pages and the home explainer
  band), because a 1352px line of body text is a readability failure.
  `container-wide` is now a no-op inside the consumer surface and is kept
  as the explicit spelling for a grid that must stay wide if this rule
  ever moves. The marker is server-rendered on purpose: setting a body
  attribute in an effect renders 1180 first and jumps to 1440, a layout
  shift on every navigation. The owner's brief was that the site read
  empty with 414px of dead canvas either side on a 1920 monitor — which
  is `DESIGN.md`'s own diagnosis ("premium = specificity + texture, never
  emptier whitespace"). It is **not a new breakpoint**: the five rails
  below are untouched and nothing changes under 1268px.

  Two things move with it. **Page sizes are a whole number of rows**:
  `/shop` dishes and `/gifts` page in **24** (divides by 6, 4, 3 and 2 —
  every column count the grid produces — and is inside Baymard's 24–48
  band), `/shop` kitchens in **9** (three clean rows of three). Both are
  free, because the page fetches 100 and filters client-side (M49).
  **And a rail of fixed-width cards that now under-fills takes
  `justify-content: safe center`**, never a plain `center` — an
  overflowing centred flex row clips its first item unreachably
  (`ReelsRailClient.module.css`). Header collapses to a hamburger + `<MobileDrawer>` below ~1190px.
  **1190 is not a fit width, and there isn't one** — corrected 2026-08-11.
  M21 recorded the row as needing "1170px plus 20px of container padding";
  the padding is `--hk-s8`, **44px a side**, so the row has **1092px**, not
  1160px. It was over capacity from that day, and `.searchPill`'s
  unlimited shrink meant the shortfall came silently out of the **search
  box, which rendered a 0px-wide input for every role from 1190 to 1920**
  — it looked like a search box and could not be typed in. Raising the
  breakpoint fixes nothing: `.container` caps the row at 1180px at *any*
  screen width, so capacity above 1190 is a constant.

  **M34 paid for the field by cutting the nav, and deleted the expansion
  that had been hiding the problem.** M21's fix kept all six labels and
  made the form go `position: absolute` over the nav on focus; it worked,
  and it still shipped a 38px circle claiming to be a search box (the
  2026-08-13 design audit measured it rendering as "Sear…" on
  production). `primaryNav` now carries **three catalogue items**
  (Homemade Food · Handcrafted Gifts · **Occasions** — M35 traded this
  slot: it was Gift Hampers, but /hamper listed one product and a top-3
  slot has to carry a catalogue; hampers return when ~6+ are live); Gift
  Hampers, Meal plans and Corporate & bulk live in **`secondaryNav`**,
  which renders as the home page's "Other ways in" notes
  (`components/landing/OtherWays`) and as the drawer's second group — joined there by
  Snacks on WhatsApp, which had never been in the nav at all. That is a
  promotion: a tile in the first screenful saying who a thing is for
  beats a 90px link that only names it. The freed ~287px goes to the
  slot (~325–370px by role, 210px floor), so the field is typable at
  rest.

  **2026-09-05 split the header into two rows, and that is what makes six
  items affordable (owner).** The ask was Homemade Food · Handcrafted
  Gifts · Occasions · Subscription Plans · Bulk & Party Orders · About Us
  — the exact set M34 measured as unaffordable. Everything above stays
  true of a *single* row, so the row was split instead of the nav cut
  again: the lockup, the search field and the controls keep the top row,
  and the tabs get a strip of their own (`.navBar` in
  `Header.module.css`), both on `container-wide`. The search field is a
  **sibling of `.actions`, not a member of it**, so it takes the row's
  slack rather than its leftovers — 509px measured at a 1280px viewport,
  against the 210px floor.

  Four rules. **The drawer keeps both groups** — dropping the secondary
  one there would leave the home strip and `/sitemap` as the only routes
  to `/corporate` on a phone — but it now **drops entries `primaryNav` already carries**,
  compared on `href` (the two lists word the same destination
  differently, and on the home page a tab and an explaining tile are two
  offers; in one vertical list they are the same link twice). **The tabs
  strip is the site's table of contents**, so an item earns a slot by
  being somewhere a visitor decides to go, not by being a catalogue —
  that is what lets About Us sit beside Homemade Food, and it replaces
  M34's "is it a catalogue you browse?". **Re-measure against 1352px**
  (`container-wide` less its 44px-a-side padding), not 1092px: these six
  labels spend ~800px of it, and a seventh is still a decision made with
  a tape measure. And **`/` is exempt** — the landing bar floats over the
  hero and keeps its single row with the tabs centred (M52), so a second
  strip is never rendered there. Pinned by
  `e2e/tests/header-capacity.spec.ts`, which asserts the field works with
  **no interaction** and does not resize on focus; it reads the row's box
  off the live DOM, which is why widening the container needed no edit in
  it.
- **`client/lib` is a two-package contract (2026-09-06).** The native app
  compiles these exact files through Metro rather than copying them, so a
  file under `lib/` may not import `react`, `react-dom`, `next`,
  `@/components/*`, or any `@/` alias that is not `@/lib/` — and may not
  touch a DOM global. Divergence goes in the app's own `platform/` shim,
  never here. Pinned by `client/lib/shared-boundary.spec.ts`, whose
  allowlist is a registry with a reason per entry (the React providers and
  `seo.ts` are web-only by construction and are listed there). Two of the
  bans are already scars: `lib/taxonomy-actions.ts` imported a type from
  `@/components/ui/Combobox`, which `tsc` follows into a CSS module whose
  ambient declaration lives in the **gitignored** `next-env.d.ts`; and a
  shared file importing `react` resolves to `client/node_modules/react`
  rather than the app's, which is "Invalid hook call" with a stack trace
  naming neither package. The app does not merely *avoid* the three
  web-coupled modules, it **aliases** them (`metro.config.js`), because
  with the path map in place a wrong import resolves rather than failing —
  so `client/lib/api/http.ts`, `auth/session.ts` and `api/unreachable.ts`
  are the three files a `client/` change must never assume the app is
  running. **The two `http.ts` forks share more since 2026-09-19:**
  `refreshOnce`, `doRefresh` (`RefreshOutcome`) and `unreachableError` are
  identical, and both import `syncFromStorage`, `withRefreshLock` and
  `isAccessTokenStale` from their session module (web: a real `localStorage`
  re-read and a Web Lock; app: a passthrough over memory).
  `mobile/test/http-parity.spec.ts` pins them — but its `extractBlock` stops
  `request` at the first `{`, the `= {}` default parameter, so that body is
  **not really compared** (the two differ only by `&& isBrowser()`, checked
  by hand). `lib/featured-order.ts`, `lib/home-rails.ts` and
  `lib/product/merchandising-badge.ts` are pure, clock-free and verified
  under `shared-boundary.spec`; `featured-order` is compilable by the app as
  `@shared/featured-order` (nothing there imports it yet). **The DOM-global half of the ban is only scanned since
  2026-09-06, and it took a year** — the rule was written here from the
  start and nothing checked it, so `lib/gift/gift-intent.ts` shipped
  reading `window.sessionStorage` and **catching its own TypeError**. On
  Hermes `window` exists and `sessionStorage` does not, so every read
  answers empty and every write vanishes, in silence, from a module whose
  comments promise the opposite. It resolves, compiles and typechecks and
  is wrong only on a device, so it is **refused** — a throw in Metro and
  at import under jest — rather than aliased or stubbed; `docs/APP.md`
  §5d says when each of the three applies. The scan matches property
  reads, not bare words (`vendor.location` and `orderHistory` are not DOM
  globals), and it will not special-case a local shadowing one of the
  names: a shadowing heuristic fails open, which is what this rule
  already did for a year. Everything else about the app — Expo, EAS,
  Metro — lives in `docs/APP.md` and stays out of this file.
- **Five breakpoint rails, by convention (M29): 420 · 560 · 640 · 780 ·
  900.** Roughly: 420 small phone, 560 phone, 640 large phone (and where
  fixed CTA bars engage), 780 shell/sidebar collapse, 900 two-pane goes
  single-column. New code uses these. They live here and nowhere else,
  because a CSS custom property is not valid inside an `@media` condition
  and the things that fix that (`postcss-custom-media`, a preprocessor)
  are new dependencies. **1190 is not a rail** — it is the *measured*
  header collapse width, above. There are 27 distinct `max-width` values
  in the tree; that tail is untidy rather than wrong (each was picked
  where a component actually broke), so it is folded to the nearest rail
  **only when a file is already being touched for a real defect**. A
  standalone 193-file normalisation diff is unreviewable and buys nobody
  anything.
- **A text control is never under 16px on a phone, and one global rule
  enforces it.** iOS Safari zooms the page when a focused
  `input`/`select`/`textarea` is smaller than that, and it does not zoom
  back out. All 36 text controls in the tree were 12.5–14.5px until M29,
  so every form on an iPhone — login, checkout address, wallet top-up,
  the whole seller portal — shifted the layout under the visitor's thumb.
  The rule is in `styles/globals.css` and is `!important` because module
  *class* selectors beat any element selector that file can write; it
  raises values and never lowers them (verified: nothing sets a control
  above 16px). Two things not to do: don't "fix" this instead with
  `maximum-scale=1` on the viewport meta (that kills pinch-zoom for
  everybody), and don't add a module rule that re-shrinks a control on
  mobile. `e2e/sweep.mjs`'s **`inputzoom`** flag and a
  `presentation.spec.ts` case are the guards.
