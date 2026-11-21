# Catalogue, listings and browse

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Subcategories and multi-shelf listings (M58)

`Category.parentId` (one level, self-relation) + `ProductCategory` (a
listing sits on several shelves). Seeded trees: **Shop by recipient** on
the gifts side, **Shop by cuisine** and **Shop by meal** on the food side
(`prisma/seed-subcategories.ts` — additive, idempotent, never overwrites).
The client's own shelf lists for the two browse pages live in
`prisma/seed-client-categories.ts`, same contract — it creates only the
names that are not already in the tree anywhere (top-level *or* as
somebody's child), so a list that repeats a live shelf never mints a
second one. "Gifts Under ₹999" is deliberately absent: a price band is
the price filter's job, and a hand-tagged shelf goes stale the moment a
maker edits a price.

- **One level deep, enforced from both ends.** A category under a
  subcategory is refused, and a category that *has* children cannot become
  one. Arbitrary nesting reads as more general and produces a tree nobody
  can browse and a breadcrumb nobody can render.
- **A parent is browsable and matches its children.** "Shop by meal" with
  nothing filed directly under it would otherwise render empty for
  everybody who clicks it, which reads as a broken site.
- **`ProductCategory` carries the complete set, primary included.** That
  is what makes "everything in this category" one query instead of an `OR`
  across two places — the shape that eventually disagrees with itself.
  `Product.categoryId` stays required and *primary*: the breadcrumb, the
  canonical URL, and what every pre-M58 reader already uses. The two are
  kept in step by `SellerListingsService`, the one owner of product writes
  (M44). `mapProduct` is the single place the primary is taken back *out*,
  so the editor's "also show it under" box never offers it twice.
- **Adding a shelf re-queues the listing; re-saving the same set does
  not.** The M22 rule: re-queueing nothing makes approval a formality you
  pass by listing something innocuous, and getting approved under
  "Pickles" then quietly adding "For Kids" is exactly that move. Compared
  as sets, so a re-order is not an edit.
- **An admin is the only writer, and there is now a route for it** —
  `POST/PATCH /admin/collections/categories`, the panel's "+" button.
  `server/test/unit/category-admin-only.spec.ts` fails the build if a
  `prisma.category.create` appears outside `src/admin/`; it deliberately
  does not match `productCategory`, which is the seller-side join every
  listing writes. Same shape and same reasoning as occasions (M43).
- **A HomeKrafter asks, and the ask carries a parent.** `parentForSuggestion`
  reads it off the shelf they already picked — a sibling of the child they
  chose, or the group itself. A childless top-level shelf yields `null`
  rather than being promoted to a parent on a guess; that is a structural
  decision an admin makes on the approve form.
- **A rename never re-derives the slug.** It is in every browse URL
  anybody has shared and everything Google has indexed.
- **A subcategory always follows its parent's `group`.** "For Her" under a
  food shelf is not something anybody meant, and the header's food/gifts
  split would render it on the wrong side.
- **Uniqueness is scoped to the parent**, so "Sweets" under two different
  groups are two shelves — and a duplicate is a **409 naming the existing
  row**, never a silent hand-back (M43).

## What a shelf asks is data (G1, 2026-09-16)

`docs/GIFTING-REWORK.md` §3–§4, and `docs/DATA-MODEL.md` has the shapes.
Four tables — `AttributeDefinition` (the question) → `AttributeOption` (an
allowed answer) → `CategoryAttribute` (which shelf asks it, how strongly) →
`ProductAttributeValue` (one listing's answer) — plus five new `Category`
columns (`icon`, `description`, `synonyms`, `archivedAt`, `mergedIntoId`).

It replaces `client/lib/sell/listing-families.ts`, a hardcoded slug map that
had **already drifted from the database**: `handmade-jewellery`,
`candles-home`, `self-care`, `personalised-gifts` and `home-decor-2` were in
no family, so thirty live bangle listings were asked the generic question
set — and the server knew nothing of families at all, so it could not refuse
a wrong answer. Rules that are easy to undo by accident:

- **Rows, never a JSONB column.** A facet count is a `GROUP BY optionId`, a
  label can be renamed without rewriting every listing that chose it, and
  "did this edit change something material" is a set comparison — the shape
  `ProductCategory` already uses. M15's rule holds: counts are computed
  from rows, **never incremented**.
- **The server is the authority; the client mirrors it looser.** Same
  direction as the two identifier parsers. `validateAttributeValues`
  (pure, `catalog/attribute-values.ts`) refuses a missing `required` answer
  or an unknown option with one sentence per field, and an answer to a
  question the shelf does **not** ask is **dropped rather than refused** —
  moving a listing from Candles to Home Décor must not meet a wall of
  errors about burn time.
- **Absence is not an answer**, again. No row for "metal" matches *no*
  metal filter and never reads as "none of them". A facet is offered only
  once **half** the listings in view have answered it, and the sheet says
  how many have not — a buyer cannot otherwise tell "none match" from
  "nobody was asked".
- **`trustSensitive` is never prefilled by a machine** (§8.2) — allergens,
  nickel-free, vegan, age suitability, small parts, shelf life, 925 silver.
  A wrong guess there is the platform making a safety claim on a maker's
  behalf, not a tidy-up somebody corrects later. It rides on the schema
  response so the form can mark it; a flag the client cannot see is a rule
  the client cannot honour.
- **`material` is M22's material change**, per attribute: editing that
  answer re-queues a live listing, and a colour swatch must not.
- **A child inherits its parent's questions and may override them**
  (`inheritedSpecs`), so the global questions (recipient, craft, colour)
  hang off the department and dropping one drops it everywhere under it.
- **Admin-only**, pinned by `test/unit/attribute-admin-only.spec.ts` —
  the third of these scans after categories (M58) and occasions (M43), for
  the same reason one layer down: a seller who could add a question would
  be writing the form every other maker on that shelf fills in.
  `ProductAttributeValue` is deliberately exempt; that is the maker
  answering. The screens are `/admin/catalog/attributes` (the question set)
  and `/admin/catalog/categories` (a shelf's description, synonyms, icon,
  and its retire/merge decisions), and the point of them is that **adding a
  question needs no deploy**.
- **A shelf is archived or merged, never deleted.** `archivedAt` retires
  one while every link, breadcrumb and order pointing at it keeps
  resolving (this is how M58's recipient shelves stop being categories once
  recipient is a facet); `mergedIntoId` folds the live "Home Décor"/"Home
  Decor" pair into one and 301s the old slug. A merge **never re-queues**
  the listings it moves — an admin tidying our own duplicate must not take
  a live catalogue off sale (M44).
- **Nothing is re-filed automatically** (§3.5). `/admin/catalog/recategorise`
  proposes and a person approves each row — there is deliberately no "move
  them all" button. Every row carries **the words it matched**, and the
  listings the rule could not place get their own filter rather than being
  dropped. `src/admin/recategorise.ts` is the pure matcher, shared with
  `prisma/propose-recategorisation.ts` (read-only, prints the same set as a
  CSV) so the offline review and the screen cannot drift. The M36 rule: a
  guess written onto a real storefront looks authoritative, and "a script
  did it" is not something a maker can argue with.
- **The seeds adopt, they do not rename.** `seed-gift-taxonomy.ts` files
  the new subcategories under the live shelf a department replaces
  (`formerly`) rather than minting a twin beside it, and only ever fills a
  blank `description`/`synonyms`. The rename is the data pass's job.

## Icons (G3, 2026-09-16) — a committed catalogue, and a picked id

`lib/icons/registry.ts` is the vocabulary; `scripts/build-icons.mjs` writes
`lib/icons/icon-bodies.generated.ts`; `components/ui/Icon.tsx` draws it.

- **Nothing is fetched, at build time or at request time.** The bodies are
  committed (the `build-chef-avatars.mjs` stance) and the
  `@iconify-json/*` packages are devDependencies that never reach a
  browser. **Don't reach for `@iconify/react`** — it asks
  `api.iconify.design` for icon data at runtime, which is a third-party
  host on the request path, and it is a client component that renders an
  empty span until it mounts. `unplugin-icons` wants webpack; this app
  builds with Turbopack.
- **Two vocabularies, one per level, never in the same row.** `craft:*`
  are the hand-drawn two-tone marks in `CraftIcon.tsx` and are for
  **department tiles** — at 40px a UI-chrome line icon reads as a button
  rather than an offer, and they are the only marks that exist for Diwali
  and Rakhi. Everything else is monoline `lucide`/`lucide-lab`/`hugeicons`
  for **chips, filter rows and attribute options**.
- **`Category.icon` is a stored id an admin picked, never derived from a
  slug.** A slug→icon map in code covers only the shelves that existed the
  day somebody wrote it, which is how seventeen tiles ended up on one
  basket emoji. The picker is on `/admin/catalog/categories`, and it is a
  list rather than a text box because a mistyped id **falls back silently**
  and looks like a shelf nobody got round to.
- **An unknown or empty id draws the wrapped gift.** `Category.icon` is
  admin input; a typo is a normal state and an empty box is not an error.
- **`icon-registry.spec.ts` fails the build** when the registry and the
  generated file disagree *in either direction*, when a `craft:` id has no
  art, and on a body carrying `<script`, `href`, `xlink:`, an `on*=`
  handler or a hardcoded hex. `Icon` writes bodies through
  `dangerouslySetInnerHTML`, which is safe only while that input is a
  committed build-time constant — an upstream set that started shipping a
  remote reference would otherwise arrive on the next `npm update`.
- **Emoji are gone from the browse pages.** `lib/category-emoji.ts` is
  deleted. An emoji renders differently on every OS.
- **A category draws its mark, never a photograph** (owner, 2026-09-16 —
  this reverses G3 §5.1.3, which faced each department tile with a real
  listing's photo). One listing standing in for a whole shelf goes stale
  the moment it sells, and a shelf whose listings carry no picture fell
  through to a hatch beside neighbours that had one. `CategoryTile`,
  `QuickFilterChips` and `DepartmentTiles` all draw `<Icon>`.
- **`mapCategory` must return `icon`.** It did not until 2026-09-16, so
  every chip and tile fell back to the wrapped gift however carefully an
  admin had chosen one — a column with no reader, which is the same bug as
  a column with no writer (that mapper's own `group` field carries the
  identical note from M20). `prisma/seed-category-icons.ts` gives the
  known shelves a starting mark: additive, idempotent, only ever fills a
  NULL, never overwrites a choice — the `seed-avatars.ts` contract.

## A gift is not a kitchen (2026-09-16)

`lib/product/delivery-copy.ts` decides what the product page says about
getting something to somebody, and it **branches on `kind` before
`shippingScope`**.

- A crocheted soft toy was described as "Tricity delivery in 2–4 hours",
  "Fresh batch prepared daily" and "Kitchen delivers within 15 km",
  because the panel read `shippingScope` alone — and `local` is what
  **every craft listed before the 2026-09-15 "a gift is always national"
  rule still carries**. So this was most of the gifts catalogue.
- **A craft posts, full stop.** `isPosted` is `kind === 'craft' ||
  shippingScope === 'national'`; only food is ever bound to the tricity,
  and only food gets a kitchen's language.
- **A gift's `prepTimeMins` counts days, not minutes.** Rendering it as
  "(10080 mins notice)" was the other half of the same bug; the gift side
  reads `lib/gift/fact-line.ts` instead, which says nothing at all when
  the maker answered nothing.
- This is M51's rule met from the other side: there a `kind` branch
  invented a trust claim, here the *absence* of one invented a delivery
  claim. Both are the platform speaking for a maker.

**Both availability switches, on every buyer surface.** `GET
/vendors/:slug/products` filtered on `PUBLICLY_LISTED` only, so a listing
the HomeKrafter had paused disappeared from `/gifts` and `/shop` and
stayed on their own storefront, openable and addable to a basket. The
rule has always been that a buyer needs both `moderationStatus` **and**
`isAvailable` to pass; a new query answering a buyer owes both.

**Browse spreads the makers** (`lib/gift-sort.ts#spreadByMaker`). A
round-robin over the ranked list under the default sort, so no one
storefront owns the first screenful. Deliberately **not** a shuffle: that
would disagree between the server render and the browser (React #418),
repeat a listing across pages, and show a shared link something else.
Ranking still decides which of a maker's gifts leads.

**Featured leads, and is never spread (2026-09-19).** The default `/gifts`
order is the admin's featured listings first (`featuredRank` ascending,
unranked last — `lib/featured-order.ts`), **pinned before `spreadByMaker`**,
then the maker-spread remainder, then sold-out. **`spreadByMaker` must never
be handed the featured half**: a round-robin deals them out one per maker and
scatters the running order an admin chose. Explicit price/nearest sorts
ignore featured — that is the buyer's question, not the page's.

## Diet marks and the pre-order badge (2026-09-05)

Two owner asks, and both turned on the same rule: **absence is not an
answer.**

- **`DietaryTag` gained `non_vegetarian` and `contains_egg`, because
  absence of `vegetarian` never meant non-veg.** A candle carries no
  dietary tags; so does a curry whose cook left the question blank. Read
  the mark through **`client/lib/diet.ts#dietOf`** and nowhere else — it
  answers `undefined` for a listing nobody asked, so no mark is drawn and
  it matches **neither** browse filter. Never
  `!dietary.includes("vegetarian") → non-veg`, which is the shortcut that
  function exists to stop. The asymmetry is the design: a wrong green
  mark means somebody eats something they would not have, a wrong red one
  is merely unhelpful — so contradictory data resolves to **non-veg**.
  **Egg is not a third mark** (FSSAI's scheme has two, and whether egg is
  vegetarian is answered differently by different people); it is a
  filterable fact that leaves the mark where the maker left it. **Nothing
  is backfilled** — a pre-2026-09-05 row reads as "we never asked", and
  the listing form closes the gap one listing at a time (the M36 pincode
  shape). The veg/non-veg pair is **exclusive in the form and not on the
  column**: one `dietary` array, one server contract, one browse OR.
- **`Product.prepTimeMins` is per-listing, and the badge reads it and
  nothing else.** The owner's rule was "prep time over 30 minutes gives a
  Pre-order tag"; `VendorProfile.prepTimeMins` is the *kitchen's* default
  and falls back to the platform's 90 minutes when unstated, so reading
  the badge through it would have stamped it on essentially every food
  listing — a badge every card carries is decoration. A kitchen answering
  "90 minutes" is describing a thali; its celebration cake needs two days.
  So `lib/pre-order.ts#isPreOrder` reads the listing's own figure,
  **never falls back to the vendor**, and a listing nobody asked gets no
  badge. NULL/blank is "not stated", **never 0** — `parsePrepTime` returns
  `undefined` for both, the same lesson as `parseStock`, where a blank
  becoming 0 took sixteen live listings off sale. The threshold is one
  exported constant. Editing it **does not re-queue** a listing (M22: a
  material change is name, description, category or photo, not a
  schedule). The kitchen's own figure still drives the scheduler,
  untouched.

## Catalogue review gate (M22) — a listing is checked before it is public

`ProductModerationStatus` is `pending | active | rejected | hidden |
flagged`, and **`pending` is the default** on `Product`, `MealPlan` and
`Snack`. Pre-M22 rows stay `active`: an approval gate applied retroactively
would delist a live catalogue and take every kitchen's income with it.

- **An admin can list a product, and it does not go in the queue (M44).**
  `POST /admin/catalog/products` defaults to the platform's own
  **Homekrafted** vendor (`vd8`, resolved by slug) and takes a
  HomeKrafter's `vendorId` to list *on their behalf* — their storefront,
  their reviews, their payout. That second case is the point: Swiggy does
  not make restaurants type their menus, and a home cook who cannot face
  the form is the normal case here. Two rules ride on
  `ListingWriteOptions` in `SellerListingsService`, which stays the one
  owner of every product write: an admin-created listing goes straight to
  `active` with that admin in `moderatedById` (queueing it would queue a
  listing for its own author), and an **admin edit never re-queues** (an
  operator fixing a typo must not take a live listing off sale). Neither
  applies to `actor: 'seller'`, which is the default and must stay it.
- **Filter on `PUBLICLY_LISTED` (`server/src/catalog/moderation.ts`), never
  on `{ not: 'hidden' }`.** Every public query was a denylist before M22,
  which was equivalent only while `hidden` was the one bad state. A
  denylist now *publishes unreviewed listings* — and looks like it works
  while doing it. Same rule client-side: `=== "active"`, not `!== "hidden"`.
- **Three different questions, three helpers.** `isPubliclyListed` (browse),
  `isDirectlyResolvable` (a direct link — `hidden`/`flagged` still resolve
  because carts and orders already reference them; `pending`/`rejected`
  404, or knowing a slug is a preview), `isPurchasable` (strictest —
  an existing order renders, nothing new may be bought).
- **A refusal requires a reason.** `reject`/`hide`/`takedown`/`flag` 400
  without one, it is stored on `moderationNote`, and it reaches the
  HomeKrafter **verbatim** on every channel their `account` preferences
  allow. Never paraphrase it in the notification layer — that sentence is
  the only thing telling them what to change. Category is `account`, not
  `promo` (see M18: a promo block is per-sender and costs every future
  order update).
- **An edit re-queues only on a material change** — name, description,
  category, photo (and `weeklyMenu` on a plan). Not price, stock or tags.
  Re-queueing everything makes editing something a kitchen avoids;
  re-queueing nothing makes approval a one-time formality you list
  something innocuous to pass. A `rejected` listing re-queues on **any**
  edit — that is the route back. A `pending` one keeps its `submittedAt`,
  so saving repeatedly is not a way to jump the queue.
- **`feature`/`unfeature` are merchandising, not moderation** — they must
  not touch `moderationNote`/`moderatedAt`, or the reason a listing was
  flagged is erased by putting it on the home page.
- **Merchandising is an admin's call (2026-09-19)** — the badges and the
  featured order, and both are easy to hand back to a maker by accident.
  **Badges (`Product.tags`)** are written only when `actor === 'admin'`
  (`server/src/seller/listing-tags.ts`); a HomeKrafter's `tags` is **ignored,
  not refused** — the DTO keeps the field (`forbidNonWhitelisted` would 400
  every shipped client), a create stores `[]`, and an update leaves an
  admin's badge untouched so a price edit cannot wipe it. Pinned by
  `test/unit/product-tags-admin-only.spec.ts` and
  `featured-merchandising.e2e-spec.ts`. **`featured` + `featuredRank`** are
  admin merchandising and **never a seller DTO field** (that spec asserts
  nothing under `src/seller/` names either). `PUT /admin/catalog/featured` is
  a **full replacement** — array order is the rank, anything unlisted is
  unfeatured with its rank cleared, audited `catalog.featured_set`;
  `unfeature` clears the rank and `feature` leaves it (NULL = featured but
  unranked, after every ranked one).
- **Whoever touches browse ordering:** the default order lives in
  `server/src/catalog/browse-order.ts` (`DEFAULT_BROWSE_ORDER` +
  `compareDefaultBrowse`) — `featured DESC, featuredRank ASC NULLS LAST,
  rating DESC, reviewCount DESC, id` — and **must change together with
  `Product_default_browse_featured_idx` and `products-browse.e2e-spec.ts`**.
  The SQL fast path, the phase-one candidate read and the in-memory
  comparator are that one constant; an index whose scan is by rating cannot
  serve an order that leads with `featured`, and losing it puts the default
  browse back on the sequential scan the k6 run measured at p95 2.06 s.
- **Seeds must set `moderationStatus: 'active'` explicitly.** They relied
  on the old default; without it the whole demo catalogue seeds invisible
  and every browse page, screenshot and fixture comes up empty with nothing
  obviously broken.

## Listing a product (M45) — two forms, one set of values

`/seller/listings/new` opens the **guided flow**
(`components/seller/GuidedListingForm.tsx`): four questions, one screen
each, photo first. `ListingForm` — the twenty-field long form — is one
link away from every step, and an **edit** opens it by default.

- **Both write the same `ListingFormValues`.** Switching either way loses
  nothing, and that is what makes the guided flow safe: it hides
  questions, never capability. Don't fork the state shape.
- **Photo first is a finding, not a preference.** Swiggy and Zomato do
  not make partners type menus — the restaurant sends photographs and
  somebody transcribes them (M44's admin listing screen is our backstop
  for that). The transferable part is the ordering: a photo is the one
  thing somebody in their kitchen can produce immediately.
- **The photo step must not block.** Refusing to continue without one
  strands somebody whose camera is in the other room, and the honest cost
  is a listing never written.
- **Nothing the guided flow skips may reach the server as a zero.**
  `mrp` = price unless "on offer" is ticked (0 renders a strikethrough
  against nothing; inflating it invents a discount), stock defaults from
  a plain-words question, the size label falls back to `"One"`.
- **Submit is handed the finished values**, not read from the parent's
  state — the last step fills those defaults in and React has not
  committed the `onChange` when submit runs.
- **What the long form asks is decided by a family, not by `kind`
  (2026-09-14).** `lib/sell/listing-families.ts` resolves one of seven
  (`cooked · baked · jarred · worn · room · skin · general`) and
  `FAMILY_FIELDS` names which questions each gets and how strongly. The
  category on **this** listing beats the account's specialties (one kitchen
  sells a thali and a jar of pickle); `kind` is the floor; a **recipient**
  shelf ("For her") resolves to `general` rather than being read as a
  product type, and the form says why. It fixes the old `kind === "food"`
  binary at both ends: a thali was asked for a shelf life it does not have,
  and a bar of soap — filed as `craft` — was asked for no ingredients at
  all. No schema change; it decides which existing columns are asked for.
- **The long form no longer asks for Tags (2026-09-19).** Bestseller / New /
  Festive / Curated are merchandising, so the admin editors carry an
  admin-only **Merchandising** section (`components/admin/MerchandisingSection.tsx`,
  four badge chips; the edit screen also shows the listing's featured place,
  read-only) **beside** the shared `ListingForm`, not behind a prop on it — a
  flag on a form both portals compose is one wrong call site from showing a
  HomeKrafter a control that does nothing.
- **`validateListingForm(values, family)` takes the family as a required
  argument**, deliberately not defaulted: all three editors pass it, and a
  caller that had not been updated would otherwise validate a jar of pickle
  against the rules for a thali. **Anything a family declares `required`
  must be refusable and reachable** — `dietary` was required by three
  families, checked by nothing, and labelled "Optional" on the form, which
  is the unfindable-refusal bug one layer down. `listing-families.spec.ts`
  fails the build on a required field the validator does not enforce or
  `LISTING_FIELD_ORDER` cannot jump to.
- **A failed save jumps to the first missing field and says how many.**
  `firstListingErrorId` + `countListingFormErrors` (pure, in `lib/sell`)
  and `components/portal/focus-first-error.ts` (touches `document`, so it
  is not in `lib/`). "It is marked on the form" is only true if somebody
  can find the mark, and the fields that fail sit two thirds of the way
  down a twenty-field page.
- **Colours are swatches in BOTH forms** (`components/seller/ColourSwatches`
  over `lib/sell/listing-colours.ts`). The long form — the one an edit
  opens by default — had a bare text box until 2026-09-14, so a maker had
  to type colour names, match whatever spelling the guided flow had
  written, and meet the 40-character label cap by being refused. The
  palette, the overflow guard and the tick-contrast rule live in the
  shared module; a swatch that would overflow is **disabled and says why**,
  never hidden. `isLightSwatch` derives the tick colour from luminance at
  the 0.179 crossover rather than a hand-kept list of names, which had
  drifted and was drawing a white tick on Blush at 2.0:1.
- **`Product.allergens` is asked on every food and skin listing, and never
  blocks.** An empty array is both "no allergens" and "we never asked", so
  the form stores an explicit **"None of these"** and `splitAllergens` is
  the one place it is taken back out — it must never reach a "Contains ___"
  line. A contradiction resolves toward the allergen. See
  `docs/DATA-MODEL.md`.

## Reels, gifting and the taxonomy queue (M50)

**Reels are real footage now (M52), served from `public/videos/reels/`.**
Four owner-supplied clips replaced the one Instagram embed (it was the
same creator's clip); `Reel.instagramUrl` + `lib/instagram.ts` stay as the
route for a reel we cannot host, with the M50 rules still holding —
**never mirror an Instagram poster frame** (signed, expiring URLs, and a
separate permission from embedding), **never print a zero count** beside
a real clip (`viewCount: 0` means "not published to us"), and **credit
the creator** (`Reel.authorLabel`, so somebody else's clip about us is
not rendered under our name). For a hosted reel:

- **Two renditions and a still, all real.** `videoSrc` (H.264, ≤720px,
  `+faststart`) is the viewer's; `previewSrc` (an 8-second silent 360px
  cut, ~300 KB) is the rail card's; `posterSrc` under `public/images/reels/`
  is a frame of the clip. Encode recipe in `docs/DEPLOY.md` § Reel
  footage. **A source that is already H.264 is remuxed, never
  re-encoded** — CRF on a 0.9 Mbps phone clip *inflated* it (7.7 → 12.9 MB).
- **Strip every byte of metadata** (`-map_metadata -1`). A phone clip
  carries the GPS of the kitchen it was shot in — the M25 photo rule, one
  directory over.
- **The card is the poster; the video is a courtesy on top of it.** The
  still is `next/image` sized for a 208px card; the `<video>` is
  `preload="none"`, has no poster of its own, and fetches nothing until
  `play()`. It never plays under `prefers-reduced-motion` or Save-Data
  (`lib/network.ts`), and it stays in the DOM either way: deciding after
  mount whether to render it is a hydration mismatch.

  **It autoplays in view on every device** (owner, 2026-08-29) — a
  0.75-in-view observer, with hover and focus as a second immediate
  trigger where a pointer exists and **no matching leave handler**: the
  observer owns stopping a preview, and pausing on pointer-leave blanks
  the rail the moment the mouse moves. This reverses M52's "two triggers,
  never both", and what that rule was protecting survives it.
  `previewBudget()` in `ReelCard.tsx` is the ceiling — four (what a wide
  rail actually shows) on a pointer device 900px and up, **one** on a
  phone, where decoders are dearer and the connection likelier metered.
  Two rules ride on it: **a card outside the budget is never handed a
  `src`** (setting one starts the fetch, and pausing afterwards saves
  nothing — the real M50 defect was unbudgeted fetching, not the
  observer), and the budget evicts **by live distance from the viewport
  centre**, never by arrival order, because the whole rail crosses the
  threshold in the same frame.
- `/videos/` gets a week of `Cache-Control` from `next.config.ts` and
  answers Range requests through Next. The filenames are not
  content-hashed, so a re-shot clip keeps its name and is stale for at
  most a week — don't make it `immutable`.
- **The five M2-era seed reels are gone.** They were poster-only with
  invented counts, and beside a real clip that prints no count the
  invented "1.2k · 18.4k views" became the louder number. The viewer's
  "Clip coming soon" branch stays for a reel filed ahead of its footage.
- **The rail is the landing page's third section, framed as proof**
  ("See what arrives"), not the seventh: the audit measured it 2.2–3.7
  screens down, past every decision it could have supported, and no
  incumbent food or gifting site carries landing-page video at all. Don't
  push it back under the catalogue sections.

**The "Make it a gift" block is three real controls now, and gift wrap had
no control anywhere.** `CartItem.giftWrap`/`OrderItem.giftWrap` are real
columns, both order screens have always printed "· gift wrapped", and
**nothing ever set them** — the product page advertised wrap "at checkout"
and checkout never asked. The block writes `lib/gift/gift-intent.ts`
(sessionStorage, per-tab, cleared once checkout consumes it) and checkout
pre-arms from it. `OrdersService` now separates **`shipsToRecipient`**
(where the parcel goes) from **`isGift`** (that gifting was asked for at
all): collapsing them meant a message card could only ride on a parcel
posted to somebody else, which is not the commonest gift. The maker sees
the message on their order detail — before this it was stored and
displayed nowhere, so nobody could write the card.

**A HomeKrafter can ask for a shelf or an occasion that isn't there.**
`TaxonomySuggestion` (`kind: category|occasion`), asked at
`POST /seller/taxonomy-suggestions`, decided at `/admin/catalog/suggestions`.
The design is the point and it is easy to "simplify" away:

- **The ask is not the write.** Approving is what mints the
  `Category`/`Occasion`, and that code lives in `src/admin/` so
  `occasion-admin-only.spec.ts`'s directory scan still covers it. Letting
  a seller create one outright ends the shared vocabulary — "Pickles",
  "Pickle" and "Achaar" as three half-empty shelves nothing can merge.
- **An admin renames on the way in.** That is what a human step buys: the
  person who can see the whole list turns "achaar" into "Pickles &
  Preserves" instead of refusing somebody who used their own words.
- **A duplicate is a 409 naming the existing row**, checked again at
  approval against the *final* name — never a silent de-duplication (the
  M43 rule).
- **A decline needs a reason and it is sent verbatim** (M22), category
  `account`, not `promo`.
- **`<Combobox>` closes its list on a refusal.** The listbox is absolutely
  positioned over everything under the input and the message renders below
  the field, so a refusal used to draw the explanation *behind* the open
  list — pressing the row looked like it did nothing. Found in the
  browser, not in review.

**A listing's category picker is a `<Combobox>`, not a `<select>`** —
because a `<select>` has no way to say "none of these is what I make".
`lib/taxonomy-actions.ts` is the one place deciding who may create and who
may only ask; it is exempt from `silent-failure.spec.ts` by a registry
entry, because its whole job is to hand the refusal up to the combobox
that displays it.

**The admin catalogue row previews the buyer-facing card.** A 48px
thumbnail is enough to *find* a listing and not to *judge* one, and the
question being answered is "would this look right in the grid". It
renders `<ProductCard>` itself — a mock-up would drift and start approving
listings against a rendering buyers never see — inside an `inert`
wrapper, since the card draws a wishlist heart and an add button that
nothing here should honour.

## Browsing food is browsing cooks (M51)

**`/shop` opens on kitchens, `/gifts` stays a product grid, and that
asymmetry is the point.** Ordering cooked food is a decision about *who
made it* — five identical jars from five kitchens are five hygiene
standards and five delivery radii. Buying a candle is not that decision.
Don't "unify" the two browse models; that trade throws away the only
thing making the food half honest.

- **`lib/kitchens.ts` derives, it does not fetch.** `buildKitchens`
  groups the listings the page already loaded, so a kitchen appears
  exactly when it has something live that reaches this buyer — the
  delivery-radius filtering is already done by `GET /products?lat&lng`,
  and a `GET /kitchens` would duplicate it in a second place. Pure and
  clock-free: it runs in the Server Component (the header count) and
  again in the browser (the grid), and those two must agree or hydration
  throws.
- **The dish grid is a `?view=dishes` toggle, not a deletion.** "Who has
  ragi cookies" is a real question. The view rides in `BrowseParams` with
  the filters and the sort, so switching keeps everything; `kitchens` is
  the default and is omitted from the URL.
- **A card previews the *filtered* dishes.** Tick "Pickles" and the four
  thumbnails are that kitchen's pickles — a preview reading the whole
  catalogue sends people into storefronts that don't sell what they
  ticked.
- **Never claim what the data doesn't say.** "Pure veg" only when *every*
  listing is vegetarian; `reviewCount: 0` renders "New kitchen", never
  0.0 out of five; a missing `distanceKm` prints nothing and sorts
  **last** under `nearest` — absent means "we weren't told where you
  are", the M12 rule again.

  **This binds every surface, and a 2026-09-14 sweep found four that
  broke it** (owner: "remove claims like these"). A claim is ours to make
  only if a column backs it and we read that column:

  - `ProductCard`'s badge chain ended in `shippingScope === "local"` →
    **"Fresh Today"** (that column is how far it travels, not when it was
    cooked — a six-month pickle wore it), `kind === "craft"` →
    "Handcrafted", and `kind === "food"` → **"Verified Kitchen"**, which
    claimed the M16 badge for every food listing without reading
    `fssaiVerified` at all. There is **no derived fallback** now, most cards
    carry no badge, and that is right — a badge every card carries is
    decoration, the same argument that keeps Pre-order off every listing.
    The chain lives in `lib/product/merchandising-badge.ts` (pure, tested)
    and ends in **one honest fallback, "Featured"**, read from the real
    admin-set `Product.featured` column: lowest priority after
    Bestseller/Festive/Curated/fresh-New, never shown on a sold-out card,
    never derived from `kind` or `shippingScope`. The rule against derived
    badges stands.
  - The product page asserted "FSSAI registered home kitchen" and "100%
    handmade by verified artisan" from `kind`, in a component that never
    fetches `VendorProfile` and so **cannot** see either flag — plus
    "hygienic", "premium materials" and "no commercial preservatives",
    none of which anything records. The honest version already exists on
    the storefront, with its working shown; a fabricated copy devalues it.
  - `FaqSection` described "our thorough home verification process
    covering clean prep areas, personal hygiene standards" — **no such
    inspection exists** — and a blanket "HomeKrafted Guarantee" of a
    prompt "full replacement or refund", which is the reverse of the M15
    rule that a return moves no money and a person decides.
  - A maker's **own** description saying "no preservatives" is their claim
    about their own product and stays. The rule is about the platform's
    voice.

  Two shapes to watch for, because both read as harmless: **a `kind`
  branch that produces a trust claim** (it is `kind`, not verification),
  and **a filter chip labelled as a property** — "⚡ Fresh Today" filtered
  `local`, and "🌱 Pure Veg / Jain" filtered `vegetarian`, which would
  hand somebody keeping Jain a dish with onion and garlic in it.
- **The default sort leads with featured (2026-09-19).** The dishes view uses
  `compareFeatured` as its first key; in the kitchens view a kitchen with a
  featured dish among the **filtered** dishes sorts first, by its best
  featured dish's rank, and `buildKitchens` pins featured dishes first in
  `Kitchen.dishes` (the card's four-dish preview). `Kitchen.makes` is
  deliberately still derived from the rating order — a featured dish must
  not change what a kitchen is said to make. The deliverable-first partition
  is still applied last, explicit price/nearest sorts are unaffected, and
  the "derives, does not fetch" rule above still holds.
- **`MakerPortrait`, never `avatarSrc`** (M38b) — this is a grid, and the
  pre-M28 rows would render several kitchens under one stock face.
- No stretched link on the card: the dish thumbnails are links, and an
  overlay would swallow every one of them.

## Hampers, auth and notifications (M18) — three rules that bite

- **A hamper is a `Product`, marked `isHamper`. There is no builder.**
  The buyer-assembled wizard (box tier → fill from the catalogue) is gone;
  a HomeKrafter lists a hamper they assemble and price themselves, and
  `/hamper` is the catalogue filtered on the flag. The flag must stay
  *only* a filter — the moment it decides visibility, pricing or
  eligibility, "a hamper is an ordinary listing" stops being true and the
  duplication comes back. A hamper still appears in `/shop`, search and its
  category; hiding it there would cost the kitchen sales for ticking a box.
  The `Hamper`/`HamperItem`/`HamperBox` tables and `POST /cart/hamper-items`
  survive **only** so pre-M18 orders still render — don't build on them.
- **`OTP_TEST_CODE` is scoped to `OTP_TEST_PHONES` and never applies to an
  admin.** `otp/verify` creates an account for a number it doesn't
  recognise, so a fixed code that worked for any number would be a
  complete authentication bypass — sign in as anyone, including a
  HomeKrafter whose payout details you could then change. Both env vars
  must be set or the bypass doesn't exist. Delete `OTP_TEST_CODE` the day
  real SMS works.
- **Every path that writes `Order.status` owes the buyer a message.**
  Three modules do (`OrdersService`, `SellerOrdersService`,
  `AdminOrdersService`) and all three go through
  `OrderNotificationsService`, never a bare `notify()`. Use `void` — a
  paid order must not roll back because a message failed. Transactional
  notification categories default to **WhatsApp on**; `promo` never does,
  because a WhatsApp block is per-sender and one promo would cost every
  future order update to that person.

## A listing's photos are a list (2026-09-17)

`Product.images` has been `ProductImage[]` since M2 and `ProductGallery`
always drew a main image plus a thumbnail row — but every write path took
a single `imagePath`, deleted every row and created exactly one, and the
thumbnails were not controls (no state, no swap, no viewer). Measured: 34
of 34 dev-database products held exactly one image, so the row had never
rendered for anybody. Both halves were fixed together; either alone is
still nothing a buyer can use.

- **`server/src/seller/listing-photos.ts` decides everything.**
  `imagePaths: string[]` (cap `MAX_LISTING_PHOTOS` = 6, matching
  `PhotoUpload`'s own default) with **index 0 the primary** — the product
  card, the OpenGraph image and the JSON-LD image, so its identity
  matters beyond the gallery. The single `imagePath` is **still
  accepted** (the native app ships its own compiled client, and
  narrowing a request value breaks clients already in people's hands);
  a request carrying both is answered by the list.
- **An empty list is an answer, absence is not** — `[]` means "remove
  the photos", omitting the field leaves the rows alone. The
  `parseStock` distinction, one column over.
- **The primary or the set re-queues; a reorder below it does not**
  (`photosChangedMaterially`). New imagery is something nobody approved;
  reordering four approved pictures is tidying, and re-queueing that
  teaches a kitchen not to touch its own gallery (M22).
- **Both forms and the admin one use `PhotoUpload`**, the same grid the
  storefront gallery uses — not a second upload recipe. Both write the
  same `ListingFormValues.imagePaths`, so switching between the guided
  and long forms still loses nothing (M45).
- **The gallery's thumbnails are `<button>`s** — a div with `onClick`
  does not fire on Enter or Space (M22's product-grid bug) — and ←/→
  move selection *and* focus. The full-screen viewer owes the whole M16
  dialog contract and honours it: focus in, shared `trapTab`, Escape,
  focus back to the opener, scroll lock. One photo renders no thumbnail
  row, no expand button and no counter: a gallery's furniture around a
  single picture reads as something that failed to load the rest.

## Occasions & guides (M16) — dates are set by a person

- **A HomeKrafter can now *ask* for one (M50), and that is not the same
  thing.** The picker used to say "ask an admin to add it" with no way to;
  `POST /seller/taxonomy-suggestions` files a `TaxonomySuggestion` and an
  admin approving it on `/admin/catalog/suggestions` mints the row. Two
  rules: **the ask must never become the write** — the approve code lives
  in `src/admin/` for exactly the scan below, and
  `occasion-admin-only.spec.ts` now pins the seller controller as
  create-free — and **a refusal carries a reason, verbatim** (the M22
  rule), because a decline with no sentence is how people stop asking.
  Same machinery covers categories, which had the identical dead end.
- **Only an admin creates an occasion (M43), and the route is the gate.**
  `POST /admin/collections/occasions` is the single writer; there is
  deliberately no `/seller/*` equivalent, and
  `server/test/unit/occasion-admin-only.spec.ts` fails the build if one
  appears. A HomeKrafter *tags* a listing with an occasion — they do not
  mint one. This is not permissions hygiene: occasions are a shared
  vocabulary the whole catalogue browses by, and one anybody can add to
  stops being one ("Diwali", "diwali " and "Deepavali" as three hub pages
  splitting a festival's traffic, unmergeable). The **create row on
  `<Combobox>` is a prop, not a permission** — withholding it hides a row
  in a menu and nothing more. A duplicate name is a **409 naming the
  existing occasion**, never a silent de-duplication: handing back the
  existing row makes the admin believe the date and tagline they typed
  were saved onto it.
- **`components/ui/Combobox` is the searchable picker** (M43) — WAI-ARIA
  editable combobox, list autocomplete, single or multi, no dependency.
  Reach for it instead of a `<select>` or a chip wall wherever the list
  grows over time. Focus stays on the input and the active row rides on
  `aria-activedescendant`; don't reimplement that with a focusable list,
  which is the version that breaks Enter and Space.
- **`Occasion.celebratedOn` is an absolute date, not a recurrence rule.**
  Diwali, Raksha Bandhan and Karwa Chauth are lunisolar and land on a
  different Gregorian date every year. Never add a "repeats yearly" flag
  or an `MM-DD` column — it would be wrong for exactly the occasions the
  hub exists for. An admin rolls them forward on
  `/admin/collections/occasions`.
- **`null` is evergreen, not missing.** Birthdays and thank-yous have no
  season; `/collections` lists them separately rather than giving them a
  countdown.
- **`lib/occasions.ts` never reads the clock** — every function takes
  `now`. That is what lets a Server Component compute a countdown once
  and ship it as text without re-deriving "today" during hydration
  (the M12 React #418 lesson). Any page rendering a countdown needs
  `revalidate` too, or a static prerender freezes it at build time.
- **A `Collection` is a gift guide with its own page** (`/guides/[slug]`),
  not only the curated ordering behind an occasion. `occasionId` stays
  optional — a standalone guide is normal. Don't merge the two routes:
  that would cap an occasion at one guide forever.

## Pre-order availability (M16) — absence is never a closure

Three switches, kept apart on purpose: `VendorProfile.workingDays` (the
weekly pattern), `VendorBlackoutDate` (specific exceptions),
`VendorProfile.prepTimeMins` (how much notice). Merging any two makes one
silently override another — the same reason `Product.isAvailable` and
`moderationStatus` stay separate.

- **No working days stated = open every day.** No prep time stated = the
  platform's 90-minute default, never zero. A HomeKrafter who has filled
  in nothing must not silently stop taking orders.
- **`getScheduleDays` was extended, not replaced.** Passing no
  `availability` reproduces the pre-M16 behaviour exactly. Keep it that
  way — every caller that doesn't know a vendor still needs a working
  scheduler.
- **Closed days render struck through, not dropped**, with the reason in
  the button's accessible name. A date that just isn't there reads as a
  bug.
- **Blackouts are specific dates, never a recurrence rule.** The weekly
  pattern already exists; this is the exception to it.
