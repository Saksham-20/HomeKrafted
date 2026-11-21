# How to add things, in full

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` carries a one-line summary of each.

## How to add things

- **New domain field/entity:** edit the right file under `lib/types/`
  (`shared` / `wallet` / `marketplace` / `laundry` / `food`), export it
  from `lib/types/index.ts` (barrel already does `export *`), then add/
  update the corresponding mock data in `lib/data/` and a getter in
  `lib/api/`. This is the same shape that becomes the Prisma schema in M8
  — model it like a real column, not a UI convenience field.
- **New mock data:** add it in `lib/data/<area>.ts`, export from
  `lib/data/index.ts`, then expose it through an `async` function in
  `lib/api/<area>.ts` — components should only ever import from
  `@/lib/api`, never reach into `@/lib/data` directly (keeps the M8
  mock→real swap to one layer).
- **New component:** CSS Modules co-located with the `.tsx`
  (`Thing.tsx` + `Thing.module.css`), named export (not default), styles
  reference `var(--hk-...)` tokens. If it needs client interactivity
  (state, event handlers), split a server wrapper (data fetching via
  `lib/api`) from a `"use client"` component (interaction) the way
  `Header.tsx` → `HeaderClient.tsx` does — don't make an entire
  data-fetching tree client-side just because one button needs state.
- **A failed request is never an answer, and a credential is deleted only
  on one (2026-09-06).** `lib/auth/session-answer.ts` is the single place
  that decides: **401/403 are the server saying the session is over**;
  status 0 (no response at all), any 5xx, a timeout and anything that is
  not an `ApiError` are **not**, and the session survives them.
  `AuthContext`'s restore used a bare `catch` that ran `clearSession()`,
  so a browser smoke test measured a valid 874-byte token pair **deleted
  by one page load with the API unreachable** — every account screen said
  "You're signed out" to somebody who was not, and the network coming
  back could not heal it because the credential was gone. That is M39's
  rule one layer down and destructive rather than confusing. It fails
  toward keeping somebody signed in on purpose: that costs one retry, the
  other direction costs them their account, and for a HomeKrafter the
  door back needs SMS that is not wired. `sessionUnverified` is kept
  apart from `isSignedIn`, and a screen offers `retrySession`, never a
  sign-in form.
- **A failed read is a Notice with Try again — never the empty state, on
  the consumer side too.** The portal kit has said this since 2026-09-04;
  the shopper screens learned it one context at a time, and the count is
  now six (`CartContext`, `WishlistContext`, `WalletContext`, both order
  screens, the subscriptions list). The shape is always the same: a
  `.then()` with no rejection handler and `setReady(true)` inside it, so
  the screen either waits for ever or renders "your cart is empty" over a
  filled basket. Every store keeps `loadFailed` apart from empty, settles
  in a `.finally`, and never writes the zero value on failure — zero is a
  real balance and an empty cart is a real cart. **`e2e/smoke-a5.mjs` is
  what checks it**: it blocks the API at the browser and asserts each
  screen settles, names the right party, and does not show its empty
  state.
- **Anything that can fail:** read `docs/ERROR-HANDLING.md` — it is the
  project standard and it exists because a misconfigured nginx vhost
  locked real users out of their accounts while every dashboard stayed
  green. Four rules in short: the app is served from **one origin**
  (`www` 301s to the apex, guarded by `scripts/healthcheck.sh`); a
  rejected `fetch` is **classified, not guessed** at
  (`lib/api/unreachable.ts` asks whether our own origin still answers, so
  "you are offline" and "we are broken" stop being the same message);
  error copy **names the right party** — never tell somebody to check a
  connection that is working; and a browser-side failure is **beaconed to
  `/client-errors`**, a Next route on the page's own origin, because a
  report posted to the API would be blocked by the very fault it reports.
  Every 5xx also carries an 8-hex `reference`, in the body, the
  `X-Request-Id` header and the log line.
- **A `lib/api` mutation must never swallow its own refusal (M36).**
  Sixteen wrappers ended `catch { return undefined }`, which turns a
  rejected promise into a resolved one and makes every `catch` built on
  top of it unreachable. `approveSellerApplication` was one: the server
  refuses an approval on purpose in three cases, each carrying the
  sentence saying what to do next, and the admin screen's error banner,
  `aria-live` region and correct `catch` **never fired once** — Approve
  looked like a dead button for months. Two of the sixteen were
  `issueRefund` and `adjustWallet`. Reads may answer `undefined` for "no
  such thing"; a **write** that reports nothing has discarded the only
  explanation anybody was going to get. A wrapper that must absorb one
  specific outcome narrows the catch and rethrows the rest — see
  `adjustWallet`, which keeps its documented "insufficient balance is not
  an exception" contract by testing for a 402. Pinned by
  `client/lib/silent-failure.spec.ts`, which now covers `lib/api` itself.
- **`addItem` rejects, and "Added ✓" waits for it (2026-09-03).** The
  cart store was the one `lib/api`-shaped swallower the M36 rule above
  missed: `void addCartItem(...).then(...)`, no `catch`, so a refusal
  (signed-out, delisted, over stock) vanished while the button said
  "Added ✓" — and sixteen live listings sat at `stock: 0` because the
  long listing form turned a blank stock into 0 (now `parseStock`,
  blank = `DEFAULT_STOCK`, a typed 0 stays 0). Every add-to-cart surface
  awaits `addItem`, maps the rejection through `lib/cart/add-error.ts`,
  and says sold out up front (`lib/cart/purchasable-sku.ts` for a card's
  one-press "+"). While the cart holds anything, `components/cart/CartBar`
  (rendered by `ConsumerChrome`, hidden on `/cart` and `/checkout`) keeps
  it one press away on every shopper page; a page with its own docked
  bottom bar publishes its height as `--hk-dock-h` on the root so the
  two stack instead of overlap — `ProductPurchasePanel` is the one that
  does today.
- **New loading state or buyer-facing status label:** take the words from
  `lib/kitchen-copy.ts` (M28), don't write "Loading…". Three rules live
  there and each is a trap: **never pick a line randomly** (server and
  browser then disagree — React #418, the M12 lesson; `kitchenLoading()`
  hashes a stable surface key instead), **every order-stage label must be
  true of a candle as well as a curry** (one pipeline carries food and
  craft since M20, so "on the stove now" is wrong for half the
  catalogue), and **the admin panel stays plain** — an operator is there
  because something needs deciding, and whimsy over a queue holding
  somebody's income reads as not taking the job seriously. Both the
  determinism and the craft-safety are pinned in `kitchen-copy.spec.ts`.
- **New screen/route:** follow the route tree in the plan
  (`app/{shop,hamper,laundry,snacks,wallet,account/...}`). Reuse
  `ImageSlot` for every image, check `lib/channel.ts` before adding
  cart/checkout UI, use `formatCurrency`/`formatDate` from `lib/format`
  rather than ad hoc formatting.
- **A listing page's filters, sort and page number belong in the URL**
  (`lib/browse-params.ts`, used by `/shop` and `/gifts`). State that is
  only in React is lost the moment somebody opens a listing and presses
  Back, and a narrowed view that cannot be sent to anybody is half a
  browse page. Write it with **`router.replace`, debounced** — `push`
  makes every checkbox a history entry, and
  `window.history.replaceState` does not survive Back (the App Router
  restores its own `renderedSearch` and the query is gone before
  `popstate` fires). Parse defensively: it is a URL, so it comes from
  anybody. **Category is the one single-select scope; every other facet
  stays multi.** The codec keeps `BrowseParams.categories: string[]` because
  `mobile/` still writes `?category=a,b`; the web reads the first slug that
  resolves (`category-sections.ts#resolveCategorySelection`) and writes at
  most one (`categorySlugsForUrl`). A legacy `a,b` link opens on `a` and the
  first-run guard rewrites the URL; an unknown slug means All.
- **Browse machinery is shared (M56, rebuilt M59/M59b): `components/browse/`**
  — the two listing pages are **sidebarless**: a hero band (tinted
  full-bleed, italic terracotta accent word — gold never carries text;
  since M59c it also carries a `HeroBanner` — one committed photograph
  behind the copy under a wash that stays solid tint over the text
  column. **The M59c rotating featured row is gone (owner, 2026-09-05:
  "this area looks messy… reduce the number of elements").**
  `FeaturedKitchens`, `FeaturedPicks` and `useFeaturedRotation` were
  deleted, not parked: on `/shop` the strip sat directly above the
  kitchen grid it was a sample of, and on `/gifts` above the product
  grid. The hero now holds the breadcrumb, the title with its tagline on
  one baseline, one mono line of counts and the location control — and
  the copy column caps at 780px so the photograph is seen, not just
  present. The `KitchenCrossLinks` rail also left `/shop` (Meal plans
  is a nav tab; Snacks stays in the home strip and the drawer); it
  remains on `/snacks` and `/meal-plans`. Don't put a "featured" strip
  back on a page whose grid already shows the same objects.),
  then one floating control card holding `QuickFilterChips` (the category
  rail: a **single-select `radiogroup`** of icon tiles — `<Icon>` from
  `Category.icon`, never an emoji; `lib/category-emoji.ts` is deleted — with
  an **All** tile first. Selected is a **solid pine face with a `Check`
  badge**. There is **no dimmed+disabled zero-count tile**: an empty shelf is
  simply not rendered, and a selected empty one stays, so a shared link still
  shows where you are. **`/gifts` is the same contract over a two-level
  tree** (`DepartmentTiles`, single-select too): pressing a department
  *selects* it and reveals its subcategory row, and that row is **derived
  from the selection** — no `openDepartment` state — so a shared
  `/gifts?category=earrings` link reopens the right row; pressing a child
  *replaces* the department; the row's first chip "All {Dept}" is the parent
  selection and "All gifts" leaves the shelf. **A parent shelf matches its
  children** (`lib/category-sections.ts#expandShelfSelection`; D2/D3 in
  `docs/GIFTING-REWORK.md`), on `/shop` as well since 2026-09-19.
  `components/browse/radio-group-keys.ts` is the shared arrow-key layer:
  arrows move focus *and* select, and the group is one tab stop) over
  `FilterPillBar` (Airbnb-shaped dropdown pills for
  the 2–3 most-used facets + an "All filters" button; popovers, not
  dialogs — Esc/outside-press close, no trap owed). The full checkbox
  set lives in `MobileFilterSheet` at **every** width (real dialog:
  shared focus trap, Esc, scroll lock, live "Show N results") — **with no
  Category group**, since the shelf is chosen in exactly one place.
  `FilterGroup` (collapsible; zero-count dimmed and partitioned after
  usable rows; M58 parent trees as labelled sections via
  `lib/category-sections.ts`) + `FilterOptionList` feed both sheet and
  popovers from **one** set of option arrays, so the two cannot drift.
  `ActiveFilterBar` (removable chips + Clear all at ≥2 — filters only, never
  the category), `SortSelect`
  (pill around a native select — don't swap in a custom listbox),
  `BrowsePagination`, and the `useBrowseFilters` hook holding the URL
  machinery. Both listing pages
  compose these; a new listing page should too, not re-derive them. The
  facet predicates are pure in `lib/browse-facets.ts` (`isOnSale` is
  presence of the server-computed discount, never arithmetic — M46).
  Filtering stays a client-side `useMemo` over a **500-listing** fetch
  (`getFoodProducts`/`getCraftProducts`; 500 is the server's own `@Max`, and
  it was 100 until the catalogue outgrew it — M49: instant, no spinners);
  revisit only when the catalogue outgrows one page.
- **A category is a scope, not a filter (2026-09-19, owner: "pressing on a
  category should change the category, not add them").** It is not an
  `ActiveFilterBar` chip and not in the All-filters sheet; the "All filters"
  badge and "Clear all" count refinements only, and `clearFilters` **leaves
  the shelf** — `clearCategory` and `showAll` are the ways out. Empty states
  name the shelf (`lib/browse-empty.ts`) and offer **Clear filters** (keeps
  it; only when there are some) and **Show all** (leaves it) separately,
  because a sentence built from chips alone blamed "Pure veg" for an empty
  shelf. `resetCategoryScopedFacets()` in `useBrowseFilters` is the one place
  facets that belong to one shelf (the G1 attributes) will reset when the
  shelf changes; there are none yet. `/shop`'s shortcut row is labelled
  **Quick filters** (hairline above, label hidden under 640px) and its
  selected state is a **tinted pill with a check** — deliberately unlike the
  rail's solid pine, so a refinement never reads as a shelf; don't give a
  second control the solid-pine state.
- **`shippingScope` is the fresh-vs-shippable split, and it is a
  filter now (M56).** The owner's framing: some food *is* a craft in
  shipping terms — a jar of pickle or a tin of cookies posts anywhere
  (`national`), a thali or warm brownies are eaten fresh nearby
  (`local`). The "Delivery" facet on both listing pages reads it
  (labels in `lib/browse-facets.ts#SHIPPING_LABELS`); absent means
  `local` (pre-M20 rows). Demo food rows were backfilled by
  `seed-catalogue.ts`; a real kitchen's own choice is never touched.
  **A gift is always `national` (2026-09-15, owner)** — both forms stop
  asking for a craft, and `SellerListingsService` forces it on create and
  edit, so "I deliver it nearby" is a food-only question.
- **The three nav tabs carry dropdown panels (M56)**, built server-side
  in `components/layout/Header.tsx` from the live category/occasion
  tables (never a second hand-kept list) and revealed by CSS
  `:hover`/`:focus-within` in `HeaderClient` — absolutely positioned, so
  the row-capacity arithmetic is untouched (1092px then, 1352px since the
  header went two-row and both rows moved to `container-wide`);
  `visibility: hidden`
  keeps closed panels out of the tab order; hover reveal is wrapped in
  `(hover: hover)` so a touch tap just follows the tab's own link.
- **New milestone:** read the plan's milestone table + this file, build
  exactly to the brief's scope (resist finishing later milestones early),
  self-check the Definition-of-Done, update `CHANGELOG.md` and any
  affected `docs/*.md`, then report back with what changed and any
  decisions that need Opus's confirmation.
