# Seller and admin portals

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## The portal kit (2026-09-04) — every `/seller/*` and `/admin/*` screen

`components/portal/` is the one set of form and list primitives for both
portals, and `lib/portal/dirty.ts` the one dirty check. It exists
because thirteen screens each carried a private input recipe (11px mono
uppercase labels — mono is receipt type for counts and eyebrows, never a
form label; see `DESIGN.md`), chip rows claimed `role="tablist"` (an axe
critical: a tablist may only contain tabs), and forty-one places said
"Loading…". Rules that are easy to undo by accident:

- **A new portal screen composes the kit; it does not write an input.**
  `Field` wires `id`/`aria-describedby`/`aria-invalid` to the `Input`/
  `Select`/`TextArea` inside it by context; a bare `<input className=…>`
  in a portal component is the drift starting again.
- **A form is `FormSection`s with ids inside a `FormPage`, saved from a
  `SaveBar`.** Save is enabled by `isDirty(initial, current)` and the
  baseline is **reset after a successful save** (`setInitial(toForm(
  updated))`), or the bar stays lit for ever. `alwaysEnabled` is for
  create screens only. Section ids are what the nav scrolls to and what a
  validation error focuses, so they are stable strings, not indexes.
- **A list is `Toolbar` + `SegmentedFilter` + `Pager`.** `SegmentedFilter`
  is a `role="group"` of `aria-pressed` buttons — never `role="tablist"`
  on chips, and never `<Chip>` as a pager. A sub-nav of *links* is a
  `<nav>` with `aria-current="page"` (`CatalogTabs`, `CollectionsTabs`).
- **The default filter is the one with work in it** — Waiting, Pending,
  Needs a hand, Not booked — and **counts come from the server's
  summary**, never re-derived from the page in hand (that is the
  "increment a denormalised aggregate" pattern, and it read "0 waiting"
  the moment anybody filtered).
- **Outcomes are a `Notice`; waiting is `LoadingRows`.** Seller-side
  loading copy comes from `kitchenLoading("surface", MAKER_LOADING)`;
  the admin panel stays plain (M28). Danger notices are `role="alert"`,
  success ones `live`.
- **A failed read renders a `Notice` with Try again — never the empty
  state, and never a rethrow.** `if (!isForbidden(error)) throw error`
  inside a data-loading effect reaches no error boundary (an effect's
  rejection is not a render error), so the screen falls through to
  "nothing here yet" over real data. Keep `loadError` next to
  `unavailable`, bump a `reloadToken` to retry, and keep the two apart:
  `unavailable` is a 403 and means "not your module", `loadError` means
  "we could not tell".
- **No `window.prompt`/`window.confirm` in either portal.** A decision
  that needs a reason or a confirmation is an inline two-step in our own
  type, with the sentence saying what the button does *before* it —
  despatch call-off, category rename, quote-link withdrawal, order
  refund, status override are the shape to copy.
- **The admin sidebar's queue badges** (`AdminShell#queueCounts`) read the
  dashboard snapshot once and refresh on window focus **at most once a
  minute — true since 2026-09-19**; before it every focus fetched, because
  the last-poll time was `useState` read from a handler registered once and
  closed over `0`. It is now a **ref stamped when the poll starts** (a
  failing poll is not retried on every focus), the rule is
  `lib/portal/queue-poll.ts#shouldRefetchQueues`, and a hidden tab skips it.
  They are a courtesy, not the gate (M47), and they require `analytics`
  scope or no scopes; a sub-admin without it sees the groups and no numbers.
- **An ordered-list screen composes `lib/portal/reorder.ts`** (pure
  `moveItem`/`removeItem`/`appendItem`/`canAppend`, never mutating).
  `FeaturedClient` (`/admin/catalog/featured`) is the reference: buttons,
  not drag (operable from a keyboard and a screen reader as they stand),
  focus follows the row that moved, a polite live region says where it
  went, Save is `isDirty`-enabled and the baseline reset from the response.
- **Nav `aria-label`s stay `"HomeKrafter"` and `"Admin"`** —
  `e2e/tests/portal-nav.spec.ts` finds the strips by them.
- **User-facing labels changed with it:** Listings → **Products**, Menu →
  **Snacks menu**, Profile → **About you** (was "About your kitchen" until 2026-09-15 — the screen is for every maker), Storefront → **Shop
  page**, Payouts → **Earnings & payouts**. Routes and code names are
  unchanged (`/seller/listings`, `ListingsClient`), same reasoning as the
  HomeKrafter/seller split.

## Sub-admins (M47) — sections, not permissions

`User.adminScopes: AdminScope[]` — `catalog · sellers · orders · support ·
finance · users · settings · analytics`, enforced by `AdminScopeGuard`
(global, after `RolesGuard`) and declared with `@RequireAdminScope(...)`
on every admin controller.

- **A scope is a section of the panel**, because a section is what an
  operator is actually handed. Per-endpoint permissions read as more
  rigorous and end with everybody holding every checkbox. If a route
  belongs to two sections it belongs to neither and needs its own.
- **Empty means nothing, not everything.** The M47 migration backfilled
  every existing admin with the full set so that could be the safe
  direction — "empty is everything" hands the panel to any sub-admin whose
  scopes somebody forgot to tick. The cost is that **anything minting a
  full admin outside the sub-admin screen must say so**, reading
  `ALL_ADMIN_SCOPES` (`src/common/admin-scopes.ts`, derived from the
  Prisma enum). The seed and the e2e harness did not, and a bare
  `role: 'admin'` promotion produces an account that signs in, renders an
  empty panel and 403s everywhere — which reads as a broken deploy.
  Pinned by `test/unit/admin-scopes.spec.ts`.
- **Read from the database, never the token.** Revocation has to bite
  immediately; a JWT claim would leave a pulled `finance` scope working
  for the rest of an access token's life.
- **Fail-closed on `/api/v1/admin`, same as `@Roles`** — a route with no
  scope is refused, and `rbac-structure.spec.ts` fails the build on one.
  The guard *also* fires on a handler-level `@Roles('admin')`, which is
  what covers the three privileged routes hanging off consumer
  controllers (two of them move money).
- **Hiding a nav item is a courtesy, not the gate.** A drift between
  `AdminShell`'s map and the server costs a visible link that 403s with a
  sentence, never access.
- **Granting has four guardrails** (`AdminUsersService.setAdminAccess`):
  no self-change, the last `users` holder cannot lose it, an admin with no
  sections is refused, and removing access clears the scopes. Each is a
  400 with the sentence saying what to do instead.
- **`users` is the scope that grants scopes** — hand it out last, and the
  admin screen says so.

## Vendor avatars — one component, a picker, and a guard (M38b)

**Nothing reads `Vendor.avatarSrc` directly. Render
`components/vendor/MakerPortrait`.** Ten seeded storefronts once pointed
at one file, `/images/vendors/avatar.jpg`, so two different kitchens
rendered under the same stock photograph of the same woman — on a
platform whose whole pitch is that a real person made this. M28 stopped
the seeds writing it; **the rows written before that day still hold it**
and nothing has cleared the column. `lib/maker-portrait.ts#ownAvatarSrc`
filters those rows back to "no picture".

**A HomeKrafter chooses their own character now, and the assigned
caricature is gone (owner, 2026-08-29).** M38b drew one of ten line-art
faces from a hash of the slug, so a kitchen that had never opened the
portal still had a portrait — one nobody chose. `/seller/storefront`
offers **sixteen characters** under the photo upload
(`lib/avatars/chef-characters.ts`, `components/seller/CharacterPicker`),
and against a real choice an assigned face is the wrong trade twice
over: it is an invention on a page claiming a real person made this, and
it hid the gap from the only people who can close it. A kitchen with
neither a photo nor a character shows the **labelled hatch
placeholder** — which looks like a missing asset because it is one.

**A shopper picks a picture the same two ways (2026-09-04).**
`User.avatarSrc` mirrors `Vendor.avatarSrc` — an upload
(`POST /uploads?purpose=profile`, its own purpose because the folder is
`sellerId ?? userId`) or a chef character, a path either way — and
`/account/profile` offers both, upload first. **Nothing is ever
assigned**: no picture means the initial-letter disc, for the same reason
a kitchen with neither shows the hatch. `CharacterPicker` lives in
`components/ui/` and takes `legend`/`lead`/`name`. `ImageUpload`'s
`previewSrc` shows a chosen character in the photo slot **without it
counting as a value** — picking one used to leave the slot on the empty
hatch, so the control the choice was about said nothing had happened.

**The seeded DEMO storefronts carry assigned characters (M56, owner
2026-08-31), and that does not reopen the rule above.** A demo fixture is
not a person; each demo kitchen gets a *distinct* character (never one
file shared — the M28 failure), set in `client/lib/data/vendors.ts`,
`seed.ts`/`seed-crafts.ts`, and on production by
**`server/prisma/seed-avatars.ts`** — additive, slug-allowlisted, updates
only rows whose `avatarSrc` is NULL or still the pre-M28 stock path (so
it also finally clears those rows), and never overwrites a photo or a
picker choice. The allowlist must never grow an entry for an onboarded
seller. vd8 (the platform, not a person) and vd9 (withdrawn laundry)
stay faceless on purpose.

- **A photo still wins, and the screen says so.** The upload is above the
  picker, the picker says "or", and choosing a character never hides the
  upload. This is the second-best answer to "who cooked this", not a
  substitute.
- **The characters are Open Peeps by Pablo Stanley, CC0 1.0** — public
  domain, no attribution owed. `scripts/build-chef-avatars.mjs` composes
  them through DiceBear (code MIT) with **every parameter named**, and
  the output is **committed**: nothing fetches dicebear.com at build time
  or at request time, and `images.remotePatterns` stays empty. Re-run the
  script only to change the cast, and keep its `CAST` in step with
  `CHEF_CHARACTERS`.
- **A character is stored in `avatarSrc` like an upload**, as a `.webp`
  path. That is why it needs no column and no mapper change — and it has
  to stay raster, because `next/image` refuses SVG without
  `dangerouslyAllowSVG` and the storefront's OpenGraph card and
  `LocalBusiness` JSON-LD both point at that same string.
- **The cast is ordered so the head coverings and the grey hair are not
  at the bottom.** A grid whose first row is six young women with long
  hair has already told most of the people looking at it that it is not
  for them. Labels describe the **drawing** and name no community on
  somebody's behalf — "Turban and beard", not a religion.
- **Two kitchens may pick the same character.** That is the M28 shape
  again *only* in appearance: a face somebody chose is not a face
  somebody was given. Don't "fix" it by assigning one back.
- **`client/lib/vendor-avatar.spec.ts` fails the build** on any read of
  `avatarSrc` outside its allowlist, and separately asserts the
  storefront route launders *both* its images. Four files are
  allowlisted, each with its reason in the spec — a fifth entry is a
  claim you should have to write down.
- **Clearing the column on those pre-M28 rows is the real fix**, and
  `ownAvatarSrc` can go the day it happens. Until then it is the
  difference between the grid being wrong and the grid being right.

## HomeKrafter profiles & verification (M16) — the badge is the product

`VendorProfile` (1:1 with `Vendor`) and `VendorPhoto` hold everything a
buyer reads before trusting a stranger's kitchen. Rules that are easy to
undo by accident:

- **A seller can never set their own verification.** `fssaiVerified` /
  `identityVerified` / `addressVerified` are absent from
  `UpdateSellerProfileDto`; `forbidNonWhitelisted` turns an attempt into
  a 400. The only write path is
  `PATCH /admin/sellers/:id/verification`, which audits before/after.
  Adding these to the seller DTO "for convenience" destroys the only
  thing making the badge worth anything.
- **Submitting a changed `fssaiNumber` clears the verification.**
  Otherwise editing the thing being verified preserves the badge that
  verified it.
- **`fssaiNumber` never enters the public payload.** The buyer needs the
  verified fact, not the licence identifier.
- **Trust score, achievements and completion are computed on read**
  (`VendorProfileService`), never stored — same rule as M15's rating
  aggregates. `cancellationRate` is `null`, not `0`, before anything has
  closed.
- **Never render the trust score as a bare number to a buyer.** The
  storefront shows the tier plus every signal, met and unmet. A score
  with no working shown is a platform-invented metric nobody can act on.
- **Keep `/seller/storefront` and `/seller/profile` separate.** The
  first is the four catalogue fields that ride on every product card;
  the second is the story/hours/policies nothing else reads. Merging
  them puts a return policy on every listing query.
- **An empty profile renders as a shorter page, not an empty one.**
  Every section is conditional. A kitchen approved this morning is the
  normal case, and the completion meter — in the portal, aimed at the
  person who can fix it — is where gaps get named.
