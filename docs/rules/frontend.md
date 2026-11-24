# Frontend: tokens, images, a11y, SEO, landing

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Loading feedback (M49) — and why the slow notice is CSS

`RouteSkeleton` carries a line that appears after **four seconds**:
"Still going — this one is taking longer than usual."

- **It is a delayed CSS animation, never a `setTimeout`.** The first
  version was a client component with a timer, and throttled to 8 kb/s —
  the case it exists for — it never appeared, because its own JS chunk
  was queued behind everything else on the same slow connection. A
  slow-connection notice that needs JavaScript to arrive cannot fire when
  the connection is what is slow.
- **`aria-hidden`**: the skeleton already has one polite live region
  announcing the wait, and a second announcement of the same fact is
  noise.
- **Never blame the visitor's connection.** We cannot tell from here
  whether it is their network, our box or a slow query — same rule as
  `docs/ERROR-HANDLING.md`'s "name the right party".
- **It reserves its space either way**, so nothing shifts when it lands.
- **Don't add spinners to `/shop`'s filters.** They are a client-side
  `useMemo` over an already-loaded list — instant, so feedback there
  would be theatre.

## Known token gaps — centralized in `styles/tokens.extend.css` (M1)

The prototype uses a few recurring colors for text/dividers sitting on
solid or tinted brand backgrounds that aren't in `tokens.css` today.
Flagged locally-hardcoded-with-comments during M0; as of M1 they're
centralized as real CSS custom properties in `client/styles/tokens.extend.css`
(imported once, right after `globals.css`, in `app/layout.tsx`) so every
`components/ui/*.module.css` file can reference `var(--hk-...)` instead of
repeating the raw hex. `tokens.css` itself stays untouched and remains law —
`tokens.extend.css` is **almost** purely additive and NOT part of the
`handoff/` design system. It overrides `tokens.css` in exactly **three**
places, each documented at its own name in the file: the corrected
`--hk-muted`/`--hk-muted-2` (contrast), `--hk-dur`
(M28 — motion slowed from `.28s` to `.36s`; `--hk-ease` was left alone,
it is already a decelerating curve), and `--hk-font-body`
(2026-09-16 — Hanken Grotesk replaces IBM Plex Sans, below). Everything
else adds.

- `--hk-on-pine: #eadfc9` — copy on solid `--hk-pine` (announcement bar,
  tag chips, badges on dark cards, PromoBand's dark variant,
  WalletBalanceCard).
- `--hk-gold-text-sm: #886815` — **all** gold-family text, not only small
  text: `--hk-gold` fails AA everywhere it carries words (wallet chip,
  `ghost-gold` label, and since the 2026-08-08 audit the
  section eyebrows, "view all" links, shop filter headings and every
  product card's maker line). Darkened from the prototype's `#8a6a16`,
  which measured 4.49:1 on the gold tint — one hundredth short.
- A light-on-`--hk-pine-deep` ramp, used on the footer and any other solid
  dark-pine surface: `--hk-footer-ink: #c7d3c5` (body), `--hk-footer-ink-2:
  #a9bcae` (link list), `--hk-footer-muted: #9fb3a5` (brand blurb),
  `--hk-footer-mono: #869c90` (mono legal row — darker `#7e9488` was
  4.18:1, and that row is the legal notice), `--hk-footer-border:
  #2c473a` (divider above the legal row).
- `--hk-scrollbar: #d9cdb4` — the `.hk-scroll` scrollbar-thumb tint
  (decorative, low stakes; see `styles/globals.css`).
- `--hk-page-title: clamp(30px, 3.4vw, 40px)` — the inner-page `<h1>`
  size (2026-09-05 design review). Nine consumer pages hand-rolled a
  `clamp()` with five different vw slopes — 26/28/34/36/40/42/56px at
  1440 for the same role — and the handoff's `--hk-h1` (34–58px) is the
  landing hero's size, used by none of them. Set it with `font-size` only;
  family and weight stay per-module. A page that genuinely needs to
  differ says so in one line next to this name.
- `--hk-terracotta-text: #a04d2e` — terracotta *on the terracotta tint*
  (#f6e7e0), where `--hk-terracotta` is 3.77:1: the "Cancelled" and
  "Returned" pills in both order queues. On white it is 4.55:1, so a
  price stays on the base token.
- `--hk-whatsapp-text: #10803a` — WhatsApp green *as text*, and as a fill
  under white text. `--hk-whatsapp` (#1FA855) and `--hk-whatsapp-deep`
  (#128C3E) are brand fills and both fail as copy (3.1–4.0:1). Same shape
  as `--hk-gold-text-sm`: the brand colour is left alone.
- **`--hk-muted: #766c5d` and `--hk-muted-2: #6f6a5e` are the one
  override.** `tokens.css` documents `--hk-muted` as "meta, captions" —
  body text — and ships it at `#8A8070`, which is 3.50:1 on the canvas
  and 3.88:1 on a card. It is used 306 times across 135 files: every
  product card's maker line, every filter heading, the shop's breadcrumb
  and subtitle. Correcting the value beats re-pointing 306 call sites at
  a new name, which would leave the failing token in place for the 307th.
  Same hue, minimum darkening that clears AA on the hardest background.
  `tokens.css` is still untouched and still law; reverting is deleting
  two lines from `tokens.extend.css`.

**The native app generates its theme from BOTH files** (`mobile/npm run
theme`), which is why the two overrides above matter beyond the web: a
port of `lib/tokens.ts` — which mirrors `tokens.css` alone, by hand —
ships `--hk-muted` at the failing `#8A8070` and `--hk-dur` at the old
`.28s`, and carries none of the added names below. Add a token here and
it reaches the app on the next `npm run theme`; a spec fails the build if
one has no theme key. See `docs/APP.md` §5a.

A few narrower one-off gaps (each used in exactly one component) stayed as
local hardcoded-plus-comment values rather than joining `tokens.extend.css`,
since centralizing a single-use color doesn't pay for itself: ProductCard's
`.added` border (`#b7d0bd`), SnackCard's `.added` border (`#b7e0c4`),
TransactionRow's debit icon tint (`#f6e7e0`), StoreBadges' on-dark border
(`#56493a`). See each component's `.module.css` for the inline rationale.

## The home page — the client's seasonal mockup (2026-11-24)

`components/homepage/` is the page `/` renders; `app/page.tsx` owns its
freshness and the Organization/WebSite JSON-LD (the FAQPage node went with
the old page's visible questions). Words, pictures and doors live in
`lib/season.ts`, which also switches the site-wide seasonal dress.

- **Order, from the client's mockup:** hero (headline, two pill doors, a
  photograph fading into the paper) → "What are you in the mood for?" (six
  photographed doors) → the Winter Edit band (`#winter-edit`, which every
  "Winter Edit" link lands on) → bestsellers (the site's `ProductGridCard`
  in a white frame on a native scroll-snap row) → two promos → "Shop gifts
  by recipient" (`/gifts?recipient=…`) + the meal-plans card.
- **No generated pictures.** The mockup's were; every picture here is
  logged Pexels stock or the owner's first-build catalogue photography. A
  door whose subject has no such photo gets a drawn line icon, never a
  stand-in that pretends.
- **Data, not the mockup's listings.** Bestsellers come from the admin's
  `bestsellers-*` collections, else featured-then-top-rated; nothing live
  means no row. A category door narrows `/shop` only when that shelf is in
  the live catalogue (`seasonDoorHref`).
- **The seasonal dress (`SEASON.theme`)** is on every shopper page: the
  paper header (`.seasonal`), the "Winter Edit" tab, the footer's snow cap
  and snow. `theme: null` removes all of it in one edit. Portals are
  untouched. No announcement bar above the header (client, 2026-11-24).
- **Snow** (`components/season/Snowfall` + `SnowToggle`) runs only while
  `<html data-snow="on">`, which `SnowToggle` sets after mount, so a
  paused visitor never sees it flash. Every snowing area must ship with a
  `SnowToggle` reachable on the same page (WCAG 2.2.2), stay off text, and
  disappear under `prefers-reduced-motion`. Flake positions come from
  `lib/snow.ts` (seeded, so server and client render the same markup).
  A dark surface that wears snow takes `SnowCap.module.css`'s `.cap`
  (footer, Winter Edit band, meal-plans card) — never a copy of the SVG.
- **Bestsellers on `/` carry food only while `foodOrdersOpen`** (owner,
  2026-11-24): a row of "Coming soon" buttons sells nothing; gifts fill it.
- **A fixed dialog inside a sticky or transformed ancestor is trapped in
  that stacking context** — portal it to `<body>` (`ProductGallery`,
  `MobileDrawer`). `next/image` serves **WebP only** since 2026-11-24:
  the 1-vCPU box encodes each size on first request, and AVIF took
  1.5–3.4 s for the home hero (`next.config.ts`).
- **The home header is sticky, not fixed** — a translucent paper bar with
  logo, five tabs, search and icons, and `DeliveryLine` under it; its edge
  shadow appears once `#hk-hero-section` has scrolled under it.

## The previous landing page — "On the table" (2026-10-23; not rendered since 2026-11-24)

Kept in `components/landing/` (untracked) until the client signs the
seasonal page off; delete it then. The notes below describe it, not `/`.

`components/landing/` is the whole page; `app/page.tsx` owns only its
freshness (`force-dynamic`) and the Organization/WebSite/FAQPage JSON-LD.
Plan and history: `docs/LANDING-REDESIGN.md` (v2 is current; v1, "The
Maker's Notebook", was rejected at its specimen as "too symmetrical and
repetitive" and deleted). It replaced the M51–M53 split hero, the ticker,
the old ISB-banner-as-hero and every `components/home/*` section except the
reels (`ReelsRailClient`/`ReelCard`/`ReelViewer`) and `AppInstallPanel`
(still on `/app-promo`).

- **No two sections in a row share a composition, and each one answers the
  visitor.** Order (client change 2026-11-20, "a house, room by room"): split doors (the hero, untouched) → *Come on in* → the bestsellers (`PickShelf`: a plain four-card grid — photo, name, maker, price; order is the rank the page was handed) → Instagram link → *Who is it for?* → occasions as wall-calendar pages on a dusk-pine wall (brick header with brass rings, month and day split from the stored ISO string — never a `Date` — the occasion's name and tagline, no photographs; an undated occasion shows "Any day" and a drawn calendar mark, never an invented date; the corner curls on hover) → *Before you buy* → promises (six ruled tiles + one note card) → how it reaches you (dark hallway, the step's word crossfades in the pinned column on desktop) → **Homekrafted app, coming soon** (`AppSoon`: `StoreBadges` with no href, i.e. "Coming soon on App Store / Google Play" labels, never links until the apps are published) → other ways in (a ruled index) → categories as hung frames (12, two rows of six; a swipe rail under 640px), inserts, questions → sell (dark). The look is calm and grown-up on purpose (the client found the earlier tilted-sticker page childish): linen `#f7f2e8` and plaster walls, hairline rules, 6px radii, Fraunces/Hanken at 600 and moderate sizes, brass as a fill only. **No purple anywhere** (`--lp-madder` is terracotta `#a04d2e`). A `Waypoint` pill sits on four seams. The landing header at rest is ink on paper. The Diwali hero, draggable prints, "By HomeKrafted" shelf and reels rail are gone at the client's request; the Instagram section links to `@_homekrafted` rather than mirroring a feed (needs a Graph API token). A new
  section picks a composition its neighbours do not use — a heading bar over
  a rail, repeated, is the exact failure v1 and the 2026-09-22 passes were
  rejected for.
- **Two load-bearing ids in the hero.** `#hk-hero-brand` is now a
  zero-height marker (the hero's wordmark is gone — owner, 2026-11-21: the
  logo sits in the bar from first paint on `/` too, retiring the M56/D8
  handover). `HeaderClient` turns the bar solid once the marker scrolls
  under its 64px band; `#hk-hero-section` is the fallback target. The
  doors' height is `100svh` minus the bar and heading (`Doors.module.css`),
  so the first view ends on the doors at 1366×657 and 1536×730 (Windows
  laptops) as well as on a Mac.
- **`/gifts`'s sticky toolbar rides down with the page, then fades, and
  comes back on the way up** (`components/browse/useScrollAwayBar`,
  owner 2026-11-21): once pinned it stays fully visible for 240px of
  downward scroll, then fades over the next 120px in step with the scroll
  (a fade with a slight lift, never a slide off the top); any tick up fades
  it back in place (220ms ease-out); back at the top the sticky pin lets go
  and it sits in its original place. Writes styles directly (no React state
  per frame), never fades while focus is inside it, opacity-only under
  reduced motion. It pins at `top: var(--hk-s3)` because the header
  on `/gifts` is not sticky.
- **The ISB banner left the landing page on 2026-10-23.** The primary action
  is now the Diwali edit (`/gifts?occasion=diwali`), illustrated by a real
  live listing photograph with the licensed festive-hamper fixture as the
  honest fallback. `festiveGiftEdit` leads with a hamper, candle and crochet
  listing when those are live, then Diwali-tagged and other craft listings.
- **Landing typography is the site's own pair (owner, 2026-11-21 —
  supersedes 2026-10-23's Public Sans).** Fraunces headings (600, SOFT 40,
  set once by `.root :is(h1,h2,h3)` in `LandingPage.module.css`) over
  Hanken Grotesk body. Hanken loads 400/500/600 only, so nothing on `/` asks
  for 700 (it would be synthesised). Public Sans and Literata are no longer
  loaded anywhere; the landing header uses `--hk-font-body`.
- **Gift sequence customisation reuses featured ranking.** `/gifts` already
  honours `featuredRank`; an admin-only “Customise sequence” link in its
  sticky toolbar opens `/admin/catalog/featured`, the one persisted ordering
  surface. Do not introduce a second gift-order field.
- **The hero carries no product prints (client, 2026-11-20; removed, restored, removed again — final).** The split doors are the hero and nothing floats over or under them. Don't bring them back unless the client asks.
- **The doors are two clipped layers of one stage.** `--seam` (registered
  with `@property`) animates a `clip-path`; neither photograph resizes and
  no copy reflows. `clip-path` clips hit-testing too, so the stage's centre
  belongs to whichever half is wider. Gifts sit first and wider at rest
  (58%), focus counts as leaning, a touch screen gets two level stacked
  doors, and under reduced motion the seam never moves — pinned by
  `audit-regressions.spec.ts` "the landing doors", which reads the seam, not
  a box width (the boxes are the same size at every moment).
- **Every underlined phrase in the promises sentence is a rule the product
  enforces**, and its note says how. "Reviewed for hygiene" is gone for
  good (a person reviews listings, M22; nobody inspects a kitchen); the
  food-delivery phrase follows `foodOrdersOpen` ("don't know" reads as
  open). Notes render in one live region beside the sentence, never as
  popovers that can run off a phone.
- **Nothing on the page reads the clock in the browser.** Occasion
  countdowns are computed in `LandingPage` and shipped as strings (the M12
  React #418 lesson); the register's filtering is pure
  (`lib/landing/register.ts`, gifts first when interleaved); the FAQ is one
  list (`lib/landing/faq.ts`) read by both the accordion and the JSON-LD.
- **The pinned scroll story needs `position: sticky`, which only works
  because `html, body` are `overflow-x: clip`** (see the note in
  `styles/globals.css` — `hidden` made `body` a scroll container that never
  scrolls). Steps you have not reached are dimmed to 0.62, not lower: that
  is the floor where on-pine text still clears 4.5:1 (axe failed 0.38).
- **Copy rules carried over, with the owner's §12 answers applied:** gold
  never carries text, covers included (D7); no QR code and "order status
  updates", never "live tracking" (D3); the sell section promises neither
  zero commission nor an approval time; "How this works" says neither
  "clean kitchen" nor "guarantee" (D2); the reels link says "See real
  orders", not "Order homemade food" (D6); food is "cooked after you
  order", never "this morning" (D5).
- **Motion is CSS scroll timelines plus small client leaves.** Section
  rises are `.lp-rise` (`view()` timeline, gated on
  `prefers-reduced-motion: no-preference` and `@supports`, hidden state in
  the first keyframe only). No animation library; `framer-motion` is still
  banned.
- **Colours (2026-11-21):** linen/plaster walls, pine-deep for the
  occasions wall, ink-green `#14241f` (`--lp-walnut`, name kept) for the two
  dark rooms — brown on beige read muddy — and terracotta `#a04d2e`
  (`--hk-terracotta-text`) as the one warm accent. `.duskSheet` repoints
  `--lp-madder` to cream, so anything inside it that needs the real accent
  reads the `--hk-` token directly.

## Image uploads (M14) — read before adding another photo field

Never add a text input for an image path; that was the pre-M14 pattern and
it asked a home cook to type a server path. Use `<ImageUpload>` for a
single image or `<PhotoUpload>` for a list — both drag/click/paste, upload
to `POST /uploads?purpose=…`, and hand back a URL to store.

- **Store the `url`, not the `key`.** It's relative today (`/uploads/...`)
  and absolute behind a CDN driver; storing the URL is what makes swapping
  `StorageDriver` a config change rather than a data migration.
- **`purpose` is a closed set** (`listing|menu|storefront|application|
  laundry`) shared between `lib/api/uploads.ts` and
  `server/src/uploads/uploads.service.ts`. Adding a field means adding a
  purpose in both — it decides the folder, so it can never be free-form.
- **The server decides the file type from the bytes**, not the filename or
  `Content-Type`. Don't add a type to the allowlist without checking it's
  inert when served from our own origin (this is why SVG is excluded).
- **Nothing deletes old files yet.** Replacing a photo orphans the previous
  one. See `docs/DEPLOY.md`.
- **Nothing is stored as it arrived (M25).** Every accepted upload is
  re-encoded by `server/src/uploads/image-pipeline.ts` — metadata
  stripped, orientation baked in, longest edge capped at 2000px, output
  **always WebP q82**. Storage stays local disk on the VPS
  (`/var/lib/homekrafted/uploads`, nginx serves it; `STORAGE_DRIVER=local`).
  Three rules if you touch it:
  - **The metadata strip is a privacy control, not an optimisation.** A
    phone photo of a home kitchen carries EXIF GPS; publishing it
    published a home cook's address. Never add `.withMetadata()` to "fix"
    orientation — `.rotate()` already bakes it in, which is why the strip
    is safe.
  - **`.rotate()` must stay ahead of the strip.** Drop the orientation tag
    without applying it and every portrait phone photo is stored sideways.
  - **WebP, not AVIF, is a CPU decision.** AVIF encodes in seconds on a
    1 vCPU box and this runs inline on the request. Revisit only if the
    box grows; nothing stored has to move, because the extension is
    derived rather than echoed.

## Accessibility floor (M16) — what every new surface owes

- **`.hk-sr-only`** (`styles/globals.css`) is the screen-reader-only
  class. Don't copy a local one into a module — three had already been
  duplicated, and a recipe that gets one property wrong (`display: none`
  hides it from assistive tech too) fails invisibly.
- **A focus ring on a dark surface reads `--hk-focus-ring` (M34).** The
  global floor was a flat `--hk-pine`, which is **1.23:1 on
  `--hk-pine-deep`** — so on the footer, which is on every consumer page,
  a keyboard user lost the ring entirely for the last fifteen links of
  every page on the site, and the same held on both portal topbars, the
  dark PromoBand, the wallet card and the reel viewer. Every container
  painted pine-deep or the pine gradient now sets `--hk-focus-ring:
  var(--hk-gold-bright)` in its own rule, next to the background that
  causes it; the variable inherits, so one line covers everything inside.
  Two rules: **write the ring as `var(--hk-focus-ring, var(--hk-pine))`**,
  never the bare token, so a component that later lands on a dark surface
  stays visible — all 42 that hardcoded it were converted — and **a dark
  button on a light page needs none of this**, because `outline-offset`
  puts its ring on the page behind it. (`DepartmentTiles`' `.chipOn`
  gold-bright override was removed on 2026-09-19 for exactly that reason: it
  set the ring on a chip whose ring is drawn on the white page, ~1.6:1, under
  the 3:1 a focus indicator needs.)
- **`prefers-reduced-motion` is honoured globally (M34), so a component
  writes its own rule only to do something other than stop.** Six modules
  had opted in individually and about seventy had not, including the
  drawer slide and every hover transform. The CSS floor is in
  `globals.css`; the JS half is **`lib/motion.ts`**, and it is not
  optional — `element.scrollTo({ behavior: "smooth" })` is a script
  instruction and ignores the media query completely, so any scripted
  scroll takes `scrollBehavior()` rather than a literal.
- **A dialog owes three things**, not one: move focus in on open, trap
  Tab at both ends, restore focus to whatever opened it. `aria-modal`
  without them is a claim the page doesn't honour. **Use
  `lib/focus-trap.ts`** (`FOCUSABLE` + `trapTab`) — never write the
  selector or the wrap arithmetic again. `MobileDrawer` and
  `LocationPrompt` honoured all three from M16 but each held a private
  copy of the recipe, and `ReelViewer` — a full-screen player claiming
  `aria-modal` — honoured only the scroll lock from the day it shipped
  until M29. It survived review because the markup is right and a mouse
  never notices; only pressing Tab finds it. `lib/focus-trap.spec.ts`
  now fails the build on a private copy or on an `aria-modal` component
  that doesn't import the shared module, and
  `e2e/tests/focus-traps.spec.ts` presses the keys for all three.
- **Anything hidden off-screen must leave the tab order.** A
  `transform: translateX(100%)` panel is still focusable; use
  `visibility: hidden` (delay the transition so the animation survives).
  `aria-hidden` over focusable elements is itself a violation.
- **Icon-only buttons need `aria-label`.** `<Button variant="icon">`
  exists precisely so this is not forgotten.
- **A card that navigates is a link, not a `role="button"` div.** React's
  `onClick` on a div does *not* fire for Enter or Space, so a
  `role="button" tabIndex={0}` card is focusable and un-openable — which
  is exactly what every product grid shipped until M22. Use the stretched
  link (`ProductCard`'s `.nameLink::after` covering the card, buttons
  lifted above it with `z-index: 1`); it also buys open-in-new-tab, which
  a div never had. If a div genuinely must be the button, it owes an
  `onKeyDown` for both keys — `client/lib/keyboard-activation.spec.ts`
  fails the build otherwise.
- **`ImageSlot` needs a real `alt`** — see its section above.

## SEO — every new public route owes three things (M15)

`lib/seo.ts` is the seam: `pageMetadata()` for title/description/
canonical/OG in one call, `jsonLdProps()` for structured data,
`SITE_URL` from `NEXT_PUBLIC_SITE_URL`.

1. **Metadata** — `export const metadata = pageMetadata({...})`, or
   `generateMetadata` for a dynamic route. Never hand-roll a `Metadata`
   object; that's how a page ships a title and no canonical.
2. **`app/sitemap.ts`** — add it if it's public and indexable.
3. **`app/robots.ts`** — add it to `disallow` if it's behind a login,
   per-visitor, or a dev surface.

A `"use client"` route file **cannot export `metadata`** — split a server
wrapper the way `app/cart/page.tsx` → `components/cart/CartPageClient.tsx`
does. Only claim `aggregateRating` in JSON-LD where reviews actually
exist.

**Never put a `loading.tsx` over a route that can `notFound()`.** A
`loading.tsx` is a Suspense boundary; a dynamic route behind one starts
streaming — status line included — before the page body runs, so a later
`notFound()` can't set 404 and the visitor gets a **soft 404** (right
page, 200 status). Measured during M15: a root `app/loading.tsx` made
`/product/nope` and `/storefront/nope` return 200; deleting it restored
404. Boundaries therefore live only on `/shop`, `/search` and `/snacks`
— never app-wide.

**And a boundary costs ~285ms of the wait it covers, so it must be
earning that (M31).** Once React commits a Suspense fallback it throttles
replacing it, so a boundary whose content resolves in 20ms still holds
the skeleton for about three hundred milliseconds. Measured on the
production build, client-side navigation to a painted `h1`: `/seller`
385–401ms with a `loading.tsx` versus 80–100ms without; `/shop` 361ms
with, against 46–90ms for `/gifts`, `/hamper` and `/collections`, which
never had one. The two **dashboard groups' boundaries were deleted** for
this reason and the seller sign-in got 4× faster.

The line to hold: a `loading.tsx` is worth it only where the page is an
`async` server component that genuinely `await`s data — `/shop`,
`/search` and `/snacks` do, and there the skeleton covers real server
work that a slow response would otherwise turn into a dead click.
**Never add one over a route whose page is a thin wrapper around a client
component** (every `/seller/*` and `/admin/*` page is): the RSC payload
is static, so the boundary covers nothing but its own throttle. If you
add a boundary anywhere, measure the navigation before and after — `node
e2e/login-timing-dom.mjs` for the portal, and see M31 in `CHANGELOG.md`.

## Policy pages are the client's wording, held as data (2026-09-21)

`lib/policies/` holds the **sixteen client-reviewed documents** (consumer /
sellers / compliance) as typed data; `components/legal/PolicyDocument`
lays them out in `LegalPage`; each route is a five-line
`app/<slug>/page.tsx`. They replaced M18's hand-written `/terms`,
`/privacy` and `/refunds` (URLs kept; `/cancellation-returns` is new, so
"Cancellation & Returns" and "Refund Policy" are two pages, as the client
sent them). The footer's four columns and the `/sitemap` page are built
from the same list; `/sitemap.xml` (`app/sitemap.ts`) is separate and reads
it too.

- **The sentences are the client's — never paraphrase, merge or "align"
  one to the product.** M18's rule ("written from what the code actually
  enforces") is superseded. Where policy and product differ (a seven-day
  return window and cancel-until-`packed` in the server vs "preferably 48
  hours" and "before accepted" in the text; Seller Terms §10 "may deduct
  platform commissions" vs the markup model; cookie/analytics wording vs no
  analytics in use) it is **raised with the owner, not edited over**.
- **Two tokens only** — `{{supportEmail}}`, `{{grievanceEmail}}` — resolved
  from `lib/legal.ts`. An unset detail renders "not published yet", never
  the client's `[INSERT …]`. `legalName` is Tics Foodworks Pvt. Ltd. (from
  the client's text); `address`, `supportPhone` and `grievanceOfficer` are
  still `TO BE FILLED`. The "not published yet" banner is shown only where
  `showsBusinessDetails` (grievance, `/contact`), and names what is
  missing. `POLICY_LAST_UPDATED` is bumped by hand.
- **A policy path may not start with `/seller`, `/admin` or anything
  `robots.ts` disallows.** `/seller-terms` rendered with no header or footer
  (`ConsumerChrome` and `LocationPrompt` match `startsWith("/seller")`) and
  was unindexable (robots disallows by prefix) — hence `/entrepreneur-terms`
  and `/content-ip-policy`. Pinned by `lib/policies/policies.spec.ts`.
- **Not built, because no content was supplied:** Seller Guidelines, Seller
  Support, Offers, Events, a "Consumer Policy" page. They are absent from
  the footer and `/sitemap`, not stubbed; adding one is an entry in
  `lib/policies/index.ts` and a page.
- **The rider documents are the exception (2026-09-25).** `/rider/terms` and
  `/rider/privacy` are *our* drafts, not the client's wording: they live in
  `lib/rider-legal/` with their own renderer (`components/rider-legal/`), print
  a version and an effective date instead of `POLICY_LAST_UPDATED`, take one
  extra token (`{{legalName}}`), stay out of `lib/policies/` and the footer
  (`rider-legal.spec.ts` fails the build if the registry reaches for that
  folder) and carry "Draft — requires legal review" in source. `/sitemap`
  appends them as a group of their own, `/sitemap.xml` lists them, and
  `LocationPrompt` is suppressed under `/rider`. The verbatim rule above does
  not bind them; the rule against promising what no job enforces does (see
  "Rider fleet").

## `ImageSlot` — how every image renders, uploaded or not

`components/placeholder/ImageSlot.tsx`:

```tsx
<ImageSlot
  ratio="1/1"              // any CSS aspect-ratio value: "1/1", "1.5/1", "16/5", "4/5"...
  label="mango_pickle_hero.jpg — front"
  size="1200×1200"          // optional export-size caption
  shape="rect"              // "rect" | "square" | "circle" (avatars/category tiles)
  compact                   // optional — smaller label chip, for dense thumbnail grids
/>
```

With a `src` it renders that image through **`next/image`** (M16, `fill`
over the wrapper's aspect ratio); without one it renders the
diagonal-hatch placeholder from the prototype. The `src` may be a bundled
asset (`/images/...`) or an upload (`/uploads/...`) — `ImageSlot` doesn't
care, which is why upload wiring needed no changes here.

Three props matter and are easy to forget:

- **`alt`** — the real description. Defaults to `label`, which is a
  *filename*, so any caller that knows the product/vendor name should
  pass it. `alt=""` is correct only when the name is already the next
  thing in the DOM (storefront banner, category tile, guide cover).
- **`sizes`** — defaults to a grid card. A 88px avatar or a 64px
  thumbnail must say so, or the browser downloads a viewport-wide image
  to fill it.
- **`priority`** — one or two per page, on the actual LCP element only.
  Marking everything priority is the same as marking nothing.

`images.remotePatterns` in `next.config.ts` is **empty on purpose**:
uploads are same-origin (nginx serves `/uploads/` — see `docs/DEPLOY.md`),
so nothing needs allowlisting. Don't widen it to `**` to make a CDN work.

**An upload goes through the optimiser (2026-08-30); until then it was
served `unoptimized`, and that was not a shortcut (M25).** `next/image`
resolves a local `src` against its *own* server on `127.0.0.1:3000`.
Bundled art under `public/` is served by Next, so the optimiser works.
`/uploads/` is served **only by nginx**, from
`/var/lib/homekrafted/uploads` — the Next process had no such route, so
the optimiser fetched its own 404 page and answered `400 "The requested
resource isn't a valid image"`. Every HomeKrafter-uploaded photo rendered
broken on the live site from M16 until M25 found it by uploading a real
photo to production; M25 answered with `unoptimized`, honest because
`image-pipeline.ts` had already capped and re-encoded the file, at the
open cost that one stored size served every slot. Now the `/uploads/`
rewrite in `next.config.ts` applies in **production too**, pointed at
the public origin: the optimiser's in-process fetch is answered by nginx
from disk, and a 260px card gets a 260px WebP (AVIF until 2026-11-24). Three things to know
before touching it:

- **A `public/uploads` symlink does not fix it** — tried on the box; Next
  does not pick up `public/` changes at runtime.
- **Public requests never hit the rewrite.** nginx matches `/uploads/`
  before it proxies to Next; the rewrite exists for the optimiser's
  loopback fetch and dev alone. Don't "tidy" it back to dev-only — that
  puts the 400 back on every uploaded photo.
- **`images.minimumCacheTTL` is a week, `qualities` is `[50, 75]`.** The
  four-hour default had every returning visitor re-fetching every image
  and the 1-vCPU box re-encoding evicted ones; a week matches `/videos/`
  and is not `immutable` for the same reason. Quality 50 exists for the
  landing hero's two grainy photographs (measured: half the bytes); a
  product photo stays on 75.

## Fonts & tokens wiring (established in M0 — don't re-derive this)

`app/layout.tsx` loads the families via `next/font/google` and exposes
each as a CSS variable on `<html>`: `--font-fraunces`, `--font-hanken`,
`--font-plex-mono`, `--font-kalam`, `--font-script`. `styles/tokens.css`
is imported first (verbatim copy, ships literal `'Fraunces', Georgia,
serif` etc. font stacks) and `styles/globals.css` imports second,
re-declaring `--hk-font-display` / `--hk-font-mono` to point at the loaded
font vars with the same fallbacks — later import wins the cascade, so
tokens.css never needs editing. Components should keep using
`var(--hk-font-display)` etc.; they'll resolve to the real loaded fonts
automatically.

**The body face is Hanken Grotesk since 2026-09-16** (DESIGN.md typography
phase 1; it was IBM Plex Sans, whose corporate-UI voice the refinement
direction is moving away from). Same three weights — 400/500/600 — so the
type ramp did not move. Three things about the swap:

- **`--hk-font-body` is declared in `tokens.extend.css`, not in the
  `globals.css` bridge**, and that is the whole reason it is an override
  of `tokens.css` rather than an addition. `mobile/ npm run theme`
  generates the native type scale from `tokens.css` + `tokens.extend.css`
  and **never sees `globals.css`** — declaring the swap there would have
  left the web on Hanken Grotesk and both apps on Plex Sans.
- **Its value carries the family name twice on purpose:**
  `var(--font-hanken), 'Hanken Grotesk', system-ui, sans-serif`. The
  browser resolves the var (next/font registers a hashed family name,
  never the literal); the theme generator reads the first *quoted* name to
  build `HankenGrotesk_400Regular` and friends, which is what
  `@expo-google-fonts/hanken-grotesk` exports. Changing either half means
  changing `mobile/scripts/generate-theme.mjs`'s `FAMILIES` map and
  `mobile/src/theme/fonts.ts` with it.
- **Fraunces is loaded as the variable face** (`axes: ['SOFT', 'WONK']`,
  no `weight`), because `font-variation-settings` does nothing to a static
  instance. `.hk-wonk` in `globals.css` is the display treatment DESIGN.md
  asks for — **display sizes only**; at body size the wonk reads as a
  rendering fault. It is on `/gifts`'s `<h1>` and nothing else so far
  (G3); a heading taking it should tighten tracking to about -0.02em with
  it, because Fraunces reads loose at display size. `.hk-annotation` is the Kalam mark: **max two per
  screen**, always `aria-hidden`, never the only place a fact is stated.
  Kalam is deliberately **not** in `tokens.extend.css` — no app screen
  draws an annotation, and a token there owes a font in the binary.
