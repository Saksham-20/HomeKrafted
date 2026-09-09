# docs/APP.md — the native app package

`mobile/` — React Native (Expo), one binary for buyers and HomeKrafters,
no admin. Same `server/` API as the web, same brand, same rules.

**A0 has landed, and this file was corrected against it.** It was written
ahead of the package; three things in it turned out to be wrong the first
time Metro actually ran, and those corrections are marked *(measured in
A0)* below. Where this file and a milestone brief disagree, this file wins
— a brief is for one milestone, this is for all of them.

**Versions as built:** Expo SDK 57, React Native 0.86, React 19.2, New
Architecture, Hermes, `expo-router`. The plan said "SDK 54+"; 57 is
current and the New Architecture is mandatory from SDK 55, so starting
lower would have bought an immediate migration.

Plan of record: `~/.claude/plans/i-want-you-to-elegant-cat.md`.

---

## 1. Prerequisites

| What | Needed for | Notes |
|---|---|---|
| Node 20 | both | matches the `client`/`server` CI jobs |
| Xcode + CocoaPods | iOS | ~10 GB. macOS only. |
| Android Studio + JDK 17 + SDK | Android | |
| An Expo account | both | EAS builds run in Expo's cloud |
| **Apple Developer Program** | iOS device builds | **paid.** Free provisioning expires every 7 days, and this is a dev-client project, so that becomes a recurring chore. Needed at **A0**, not A7. |
| **Google Play Console** | Android release | **paid, one-off.** A new personal account also needs identity verification and 12 testers × 14 days of closed testing before production. Weeks — start it early. |
| APNs key + FCM v1 credentials | A7 (push) | |

## 2. Bootstrap — fresh clone to a running app

```bash
git clone <repo> && cd HomeKrafted

# The app compiles files out of client/, so client's dependencies must exist.
cd client && npm ci && cd ..

cd mobile && npm ci
npm run doctor                      # npx expo-doctor — catches most setup faults

# One dev-client build per platform, per native-module change (see §6).
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
# install the artifact on the device/simulator, then:

npx expo start --dev-client
```

**`npm ci` in `client/` is not optional.** Skip it and the app's typecheck
fails inside a file the app never imported.

## 3. Which API do I point at?

`EXPO_PUBLIC_API_URL` is the **full base including `/api/v1`**.
`http://localhost:4000` is wrong on a physical device — the phone's
localhost is the phone.

| Situation | Value | Trade |
|---|---|---|
| Simulator/emulator, API running locally | `http://localhost:4000/api/v1` (Android emulator: `http://10.0.2.2:4000/api/v1`) | fastest loop |
| Physical device, API running locally | `http://<your-LAN-ip>:4000/api/v1` | same Wi-Fi; breaks when your IP changes |
| Physical device, no local API | `npx expo start --tunnel` | slower; no LAN needed |
| Anything shared or demoed | the staging VPS | **writes to shared data** — never experiment here |

Health probing is **not** `${EXPO_PUBLIC_API_URL}/health`: `main.ts`
excludes `health` from the `api/v1` prefix, so that URL is a 404. Probe
`/health/db` on an absolute origin — and it is `/health/db`, not `/health`,
because `/health` is liveness only and answers 200 while Postgres is down,
which would make the app tell the user *they* are offline.

`EXPO_PUBLIC_*` values are **inlined at bundle time**. Editing `.env` and
reloading changes nothing; restart with `--clear`.

## 4. The shared-code contract

`mobile/` compiles `client/lib` **through Metro**. It does not copy it.

| | |
|---|---|
| **May import** | `@shared/types/*`, the named `lib/api/*` domain modules, the pure helpers (`diet`, `pre-order`, `browse-facets`, `browse-params`, `channel`, `schedule`, `geo`, `cart/pricing`, `kitchens`, `kitchen-copy`, `format/*`, `occasions`, `meal-plans`, `pincode`, `commission`, `tokens`, …) |
| **May NOT import** | `react`, `react-dom`, `next`, `@/components/*`, any `@/` alias that is not `@/lib/`, any DOM global, **the `@shared/api` barrel**, `lib/data/*`, `lib/api/admin` |
| **No barrel, ever** | Metro does not tree-shake, so a barrel import is the whole library. Three measured so far: `@shared/api` (a 92 KB admin client), `@shared/data` (204 KB of fixtures), and **`lucide-react-native` — 3,616 icons, +1,802 bundled modules**. Pinned by `test/no-barrel-imports.spec.ts` at the source and by a ceiling in `check:bundle` on the artifact. |
| **Divergence goes in** | `mobile/src/platform/` — env, session, http, reachability, upload. Nowhere else. |
| **Enforced by** | `client/lib/shared-boundary.spec.ts` (the import bans) and `mobile/test/http-parity.spec.ts` (the fork stays in step) |

**Never import the barrel.** `client/lib/api/index.ts` re-exports
`./admin` (92 KB), and Metro does not tree-shake, so one
`import { getProducts } from "@shared/api"` puts the entire admin client
in the phone binary. Import `@shared/api/products`.

**Mock mode does not exist in the app, and a hardcoded `false` is only
half of that** *(measured in A0)*. `isMockMode()` is a literal `false` in
the shim, which makes the mock *branch* dead code — and does nothing about
the `import { products } from "@/lib/data/products"` sitting at the top of
all 22 shared `lib/api` modules, because **Metro does not tree-shake**. So
`metro.config.js` resolves everything under `client/lib/data/` to
`mobile/src/platform/mock-data-stub.ts`, a Proxy that throws on any read.
That is safe precisely because the survey found every one of those 22
importers reads its fixtures behind `isMockMode()`; the 23rd importer,
`lib/auth/AuthContext.tsx`, imports React and is a port rather than a
shared file.

**No `.native.ts` / `.ios.ts` / `.android.ts` under `client/`.** Metro
would resolve them and Next would not, but `client/`'s tsconfig, ESLint
and its structural specs all still see the file. The shim layer is the
escape hatch.

## 5. Aliases

```jsonc
// mobile/tsconfig.json
"paths": {
  "@shared/*": ["../client/lib/*"],
  "@/lib/*":   ["../client/lib/*"]   // what the shared files themselves say
}
```

Both entries are required. **151 import sites inside `client/lib` are
written `@/lib/…`**, so mapping only `@shared/*` resolves the entry point
and then fails on its first line.

**Do not map `@/*` → `../client/*`.** It collides with the app's own
`@/*` and opens a path into `client/components/**`, which fails deep
inside Metro as a CSS parse error rather than at the import site.

Expo's Metro config honours tsconfig paths (SDK 50+), so these two entries
cover Metro and TypeScript together. `watchFolders` makes Metro *watch*
`../client`; it does not resolve anything.

`metro.config.js` additionally needs:
- `resolver.resolveRequest` aliasing `client/lib/api/http`,
  `client/lib/auth/session` and `client/lib/api/unreachable` to
  `mobile/src/platform/*`. **Without this the app silently bundles the web
  session layer** — 30 `lib/api` modules import `./http`, which pulls
  `window.localStorage` and a same-origin favicon probe — and you find out
  at runtime as `window is not defined` in a file nobody wrote.
- `resolver.blockList` covering `client/node_modules/**`, so a stray
  `react` import fails as a build-time resolution error instead of a
  runtime "Invalid hook call" naming neither package. *(Measured in A0:
  `resolver.disableHierarchicalLookup: true` was the first attempt and is
  too blunt — it also stops Metro finding a package's own nested
  dependencies, and npm nests whenever versions conflict. `expo-router`
  keeps its `@expo/metro-runtime` under
  `node_modules/expo-router/node_modules/`, and the very first export
  failed on it. Block the one directory that is hazardous.)*
- a stub for `client/lib/data/**` — see §4.

**jest mirrors this with a `resolver`, not a `moduleNameMapper`** *(measured
in A0)*, and the difference is the shape of the problem rather than a jest
detail. A mapper matches the **request string**, and the shared files reach
the aliased modules relatively: `client/lib/auth/must-change-password.ts:1`
is `import { getSession } from "./session"`. No pattern over request
strings can tell that `./session` from `client/lib/auth/` is the web
session layer while `./session` from `mobile/src/platform/` is ours.
Metro's `resolveRequest` is handed the origin module; so is
`mobile/test/resolver.js`. It also mirrors the blockList, by resolving any
bare specifier from a `client/` file inside `mobile/node_modules` and
nowhere else.

**`tsc` sees the web `http.ts`, and that is expected.** tsconfig `paths`
cannot rewrite a relative import, so the typechecker follows
`lib/api/products.ts`'s `./http` to `client/lib/api/http.ts` — which is
why `npm ci` in `client/` really is required (§2), and why the app's
typecheck reads a file Metro never bundles. `check:bundle` proves the
bundle disagrees with the typechecker here on purpose, and
`test/http-parity.spec.ts` is what actually guards the shim's shape.

### 5d. Aliased, stubbed, refused — three dispositions, not two

A shared file the app cannot use gets one of three treatments, and
picking the wrong one is how a defect ships quietly.

| | When | Mechanism | Today |
|---|---|---|---|
| **Aliased** | the app needs what it does, differently | `resolveRequest` → `src/platform/*` | `api/http`, `auth/session`, `api/unreachable` |
| **Stubbed** | nothing should call it, but it must still resolve | a module that throws on **read** | `lib/data/**` (22 modules import a fixture statically) |
| **Refused** | nothing should import it at all | a throw at **resolve** and at **import** | `gift/gift-intent` |

**Refusal is for the worst shape a shared file can have: it resolves, it
compiles, it typechecks, and it is wrong only on the device.**
`gift/gift-intent` reads `window.sessionStorage` and catches its own
TypeError — correct handling on the web, where the catch covers a private
window or blocked site data. Hermes defines `window` and does not define
`sessionStorage`, so on a phone the same catch turns total failure into
silence: every read answers `EMPTY_GIFT_INTENT`, every write is
discarded, and the "Make it a gift" block reports success while losing
the message the buyer typed.

A stub would be wrong here — it would make the import look supported. So
`metro.config.js` carries a `REFUSED` map that **throws during
resolution**, naming the importing file. Two details worth keeping:

* **jest needs a different mechanism for the same rule.** Under jsdom the
  module *works*, so a spec would green-light the exact import that loses
  data on a device. A bare throw from `test/resolver.js` is rewritten by
  jest into "Could not locate module", which reads as a typo — so both
  alias spellings are mapped to `src/platform/gift-intent-refused.ts`,
  which throws at import with the reason. Map **both** spellings: the
  shared tree writes `@/lib/…` and app code writes `@shared/…`, and a
  mapper covering one is a hole shaped exactly like the other.
* **`check-bundle.mjs` bans it too**, because an alias or a refusal that
  fails open has no symptom — the same reason the export is asserted to
  *contain* `src/platform/http.ts` and not merely to lack the web one.

**A refusal is only honest if the shareable half is reachable, and A4
made it so.** `gift/gift-intent-shape.ts` now holds the type, the empty
value, `hasGiftIntent`, the storage key and a total `parseGiftIntent`;
it touches no DOM global, is not in the `shared-boundary` registry, and
is what **both** packages import. What is left in `gift-intent.ts` is the
`sessionStorage` store, which is web-only by construction rather than a
shared module with a trap in it — and the app supplies its own
(`src/checkout/gift-intent.ts`, memory, per launch, deliberately not
AsyncStorage: a gift message is somebody's words to somebody else, and
AsyncStorage on Android is a plaintext file). The refusal stands, because
the file that earned it still exists and still does what it did.

**A5 found a fourth shape, and it is the stub's one blind spot.** Three
`lib/api` functions returned static *display copy* straight out of
`lib/data` with **no `isMockMode()` branch at all** —
`getLoyaltyTiers`, `getReferralHowItWorks`, `getReferralRewardAmount` —
and two more did the same for the support phone number
(`getSupportPhone`, `getSupportChatGreeting`). The stub's whole safety
argument is that every `lib/data` read sits behind `isMockMode()`, which
the app makes statically `false`; these five sat in front of it, so they
threw on a device while compiling, typechecking and passing every test.
The fix is neither an alias nor an exception: a tier ladder and a phone
number are **not fixtures**, so they moved to
`client/lib/referrals/loyalty-copy.ts` and `client/lib/support/contact.ts`
— pure, shared, imported by both packages — with `lib/data` re-exporting
them so no existing importer changed. The rule to carry: **if a `lib/api`
function returns a `lib/data` value unconditionally, that value is
content and belongs outside `lib/data`.**

The DOM-global scan in `client/lib/shared-boundary.spec.ts` is what finds
the next one. It matches property reads (`window.`, `localStorage[`)
rather than bare words — a word-boundary scan reported 28 files and
almost none were real, because `location` and `history` are ordinary
field names all over this tree — and it refuses to special-case a local
that shadows one of the names, which is why `schedule.ts`'s `const
window = DELIVERY_WINDOWS.find(...)` was renamed to `slot`. A shadowing
heuristic fails open, and this rule already spent a year failing open.

## 5a. The theme is generated, and from BOTH stylesheets

`npm run theme` reads `client/styles/tokens.css` **then**
`client/styles/tokens.extend.css`, in that cascade order, and writes
`mobile/src/theme/tokens.generated.ts`. 66 tokens, 38 colours, 6 type
roles. Never edit the generated file.

**Why not port `client/lib/tokens.ts`.** It is the obvious source and it
would have shipped three bugs on day one, because it mirrors `tokens.css`
alone and is kept in step by hand:

| It says | The truth |
|---|---|
| `muted: "#8A8070"` | `#766c5d`. The extend layer corrects it — 3.50:1 on the canvas is the failing value, on the token 306 call sites use for a maker line |
| `duration: "0.28s"` | 360ms, the 2026-08 brand review's slower tempo |
| `h1.size: "34-58px"` | a range **string**, which no layout can consume |

It also has none of `--hk-on-pine`, `--hk-gold-text-sm`,
`--hk-whatsapp-text`, `--hk-terracotta-text`, the `--hk-footer-*` ramp or
`--hk-page-title`. A hand-kept mirror does not stay a mirror, which is
the whole argument for generating.

`test/theme-parity.spec.ts` fails the build when the committed file is
stale (it regenerates to a temp path and diffs) **and** when any `--hk-*`
has no theme key. A later swap to `DESIGN.md`'s Maker's Table direction
is then a regeneration, not a re-port of every component.

**Four things CSS does declaratively that React Native cannot**, resolved
once in `src/theme/index.ts` rather than at fifty call sites:

- **`clamp()` needs a window.** `--hk-h1` is `clamp(34px, 4.4vw, 58px)`;
  RN has no `vw`. `useTypeScale()` resolves against
  `useWindowDimensions()` so it survives a rotation; `resolvePx()` is the
  pure, testable half.
- **`line-height` is a ratio in CSS and pixels in RN**, so it is stored as
  a ratio and multiplied by the *resolved* size — the only correct order
  once a size can clamp.
- **`letter-spacing` is `em` in CSS and pixels in RN.** Same shape.
- **A CSS font stack is one family name in RN**, and there are no
  synthetic weights: on Android a custom family plus `fontWeight: "600"`
  silently renders the regular face. So every weight is its own
  registered family (`Fraunces_700Bold`), named as
  `@expo-google-fonts/*` exports it, and the generator builds the same
  names from the CSS `font` shorthand.

**Gold never carries text, and the props enforce it.** `<Text color=…>`
takes a `TextColor`, and `gold`/`goldBright`/`whatsapp`/`whatsappDeep`
are absent from that union — asking for `gold` gets
`--hk-gold-text-sm`. `test/gold-never-text.spec.ts` catches the way past
it (an explicit `style={{ color: … }}`, or a raw hex) and additionally
fails on **any** colour that is not a token — it caught the A0 smoke
screen typing `#1F3D2B`, a near-miss on `--hk-pine-deep` that looked
deliberate. Values with genuinely no token (the terracotta tint) are
listed in that spec with their reason, the same rule the web follows.

## 5b. Images go through the web app's optimizer

React Native has no `next/image`, and `image-pipeline.ts` stores one WebP
capped at 2000px — so every photo would arrive full-size for a 160pt
slot. Measured: the raw asset is **295,956 bytes**; `/_next/image` at
`w=256&q=75` returns the same picture as **5,874 bytes**. No server
change: the optimizer is public, caches for a week, and already serves
`/uploads/` through the production rewrite.

**`w` is snapped to Next's allowed set, or it 400s.** `next.config.ts`
sets `qualities` and `minimumCacheTTL` and overrides **neither**
`deviceSizes` nor `imageSizes`, so Next validates against its own
defaults. Measured against homekrafted.in on 2026-09-06:

```
  w=173 -> 400      w=256 -> 200      q=50 -> 200
  w=400 -> 400      w=384 -> 200      q=75 -> 200
                    w=640 -> 200      q=80 -> 400
```

`w=400` is the one that catches people out: round, plausible, and exactly
what "match `w` to the rendered slot" produces. `src/images.ts` snaps
**up** — down is a blurry photo of somebody's food — and
`test/image-widths.spec.ts` fails the build if `next.config.ts` ever
starts setting `deviceSizes`/`imageSizes`, which would make the mirror
stale and every thumbnail a 400.

Snapping also caps what this costs the box: one vCPU running Next, the
API and Postgres at a measured p95 of 2.06s, with each new width an
inline AVIF encode. Restricting the app to widths the web already
requests means the first release warms a cache that mostly exists.

**Capacity, measured (E3, moved from A7 to A3).** The box runs Next, the
API and Postgres on one vCPU at a measured p95 of 2.06s, and every width
the app asks for that the web has never requested is an inline AVIF
encode. Measured against production on 2026-09-06, one product photo,
first request versus second:

| `w` | cold | warm | bytes |
|---|---|---|---|
| 256 | 0.22s | 0.16s | 23.6 KB |
| 384 | 0.33s | 0.22s | 46.5 KB |
| 640 | 0.41s | 0.27s | 104.7 KB |
| 750 | 0.41s | 0.29s | 137.1 KB |
| 828 | 0.52s | 0.29s | 163.3 KB |

Two things follow. **A cold encode costs 60–230ms**, not seconds — the
first release warms a cache rather than stalling the box, which is what
snapping to widths the web already generates was for. And **the byte
curve is steep**: 640 is 4.4× the bytes of 256. `pixelsFor` caps density
at 3, which reproduces what a browser picks from `sizes` at the same
visual size, so the app is not asking for more than the web already does.

Capping photographic density at **2 instead of 3** would take a 180pt
card from 640 (105 KB) to 384 (46 KB) — 2.2× fewer bytes on a metered
connection, at the cost of a 1.5× upscale on a 3× display. That is a
visual-quality call with a real number attached, not an engineering one:
it is recorded here for the design review rather than taken.

**New coupling: Next down + API up = no images.** So `ImageSlot` falls
back to the raw `/uploads/` URL, which nginx serves without Next in the
path. A heavier photo beats the hatch — the hatch means "there is no
photo", and there is one.

## 5c. Interaction states — the map every list and form owes

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Food / Gifts grid | skeleton cards | "No kitchens deliver here yet" **+ the area picker** | `Notice` + Try again | n/a | filtered subset + count |
| Search | inline spinner | "Nothing matched" + 3 popular shelves | `Notice` + Try again | results + count | n/a |
| Product detail | skeleton | n/a (404s) | `Notice` + back to browse | n/a | sold out = panel, not hidden |
| Cart | skeleton lines | "Nothing here yet" + Browse food/gifts | line-level reason | n/a | some lines unavailable |
| Checkout | disabled CTA | no address → add-address first | named reason, cart kept | order confirmation | payment pending → polling copy |
| Order tracking | skeleton stepper | n/a | `Notice` + Try again | stage advanced | one parcel of two delivered |
| Wallet | skeleton | zero balance is a **real state**, not empty | `Notice` | credited toast | top-up pending |
| Kitchen: Today | `LoadingRows` | "Nothing needs you right now" | `Notice` + Try again | n/a | counts from server summary |
| Kitchen: Orders | `LoadingRows` | per-filter empty; default = has work | `Notice` + Try again | status advanced | n/a |
| Kitchen: Products | `LoadingRows` | "Nothing listed yet" + Add your first | `Notice` + Try again | saved, bar resets | pending-review badge |
| Kitchen: Payouts | `LoadingRows` | "No payouts yet" + what unlocks one | `Notice` | requested | estimate while flag off |
| Push permission | n/a | n/a | denied → in-app inbox still works | n/a | n/a |

Three rules the table encodes:

- **A failed read is a `Notice` with Try again, never the empty state.**
  An effect's rejection reaches no error boundary, so a screen with only
  an empty branch renders "nothing here yet" over real data. The app
  ports the *rule*, not the web code — the admin clients still compute
  `initialLoad` in a way that shows "we couldn't load this" and "no
  accounts match these filters" at once. Flaky connections make this far
  more frequent on a phone.
- **Empty copy names the next action.** "Nothing here yet" alone is a
  dead end. `EmptyState`'s `body` is required for that reason.
- **Loading copy has two tiers.** Atmosphere (`kitchen-copy.ts`) where
  the wait is the product's character — browsing, checkout, a kitchen
  saving its own work; **"Loading your ___"** for anything rendering the
  signed-in person's own records. Apply one rule to both and somebody
  waiting on their own order history gets "Warming up the tawa".

One treatment for waiting: **an opacity pulse, never a shimmer sweep.**
The web kit shipped both — `LoadingRows` animates a gradient sweep and
`RouteSkeleton` explicitly refuses one, naming the shimmer "the single
most common AI-generated loading state tell". The pulse is the reasoned
one, and on Android a 200%-width gradient sweep is a per-frame gradient
recomposite on the most-rendered component in the product.

**The 4-second "still going" line is a `setTimeout` here, and must not be
on the web.** There it is a delayed CSS animation because the timer
version never fired — throttled to the 8 kb/s connection it existed for,
its own JS chunk queued behind everything else. In an app the bundle is
already on the device. Same four decided numbers: 4s, muted, hidden from
the screen reader (the region already announced the wait once), space
reserved either way. And it never blames the connection.

## 5e. The control vocabulary — which widget answers which question

Four controls, and picking the wrong one is a correctness bug rather than
a taste one. A switch tells an iOS user "this is on **now**".

| The question | Control | Where |
|---|---|---|
| A setting that saves the moment you touch it | `Toggle` (a real `Switch`) | one setting with a sentence beside it — **not a grid of them** |
| Several independent on/off answers to one question | `ChipGroup` + `Chip` (pressed-state) | notification channels, per category |
| A value a later **Save** commits | `Checkbox` | the four gift options — Place order commits them |
| One of several | `ChoiceGroup` + `ChoiceRow` (radio) | payment method |
| Two views of the same data | `SegmentedControl` (tablist) | the food tab's kitchens/dishes |

Three rules that fall out of it:

- **Two switches are not a choice.** They can express both-on and
  both-off, so the screen has to keep them in step behind the scenes —
  and a screen reader announces two unrelated settings. That was the
  payment step until 2026-09-06.
- **A button labelled with the state you are *not* in never says which
  one you are.** "See dishes" was the whole view switch, so the word on
  screen was always the other one.
- **A radio group selects a value; a tablist selects a view.** Screen
  readers announce them differently and the difference is real.
- **A switch is right for one setting and wrong for a grid of them.**
  Notification preferences are seven categories times four channels, and
  as `Toggle`s that was twenty-eight identical switches in one column —
  unreadable however correct each one is, because nothing tells you at a
  glance which categories you are actually reachable on. As a `ChipGroup`
  per category the answer is the shape of the row, filled is on, and the
  screen is four cards shorter. Never a `SegmentedControl` there: that
  would say the four channels are alternatives when every combination is
  legal.
- **A stepper is not an add control.** A snack row opened at `− 0 +`, and
  nobody presses "−" first: the row's first press is always "I want one".
  `Add` says that, and the stepper appears once there is a quantity to
  step.
- **A filled disc above four hollow ones is a radio group**, whatever the
  screen means by it. The order timeline was exactly that, drawn as `●`
  and `○` characters inside a `Text`. `components/StatusTrail` draws a
  connected rail instead: three states (reached · current · still to
  come), a segment lit only between two **reached** dots so the track
  stops where the order does, and no bar, percentage or ETA — the stages
  are discrete facts a kitchen recorded and there is no rider GPS to
  interpolate between them.

**Structure.** `PageHeader` is the top of every screen (eyebrow · title ·
lead · meta, with `accessibilityRole="header"`); `LinkList`/`LinkRow` is
any list of places to go — never a stack of `secondary` buttons, which on
a white card is a white box and reads as centred text that lost its fill;
`EmptyState` is mandatory on both halves and takes a mark, a body that
names the next action, and at most two doors; `Notice` is where a *failed
read* goes, never `EmptyState`.

**Motion.** `usePressScale` on anything pressable — spring, 0.97,
transform and opacity only, native driver; reduced motion keeps the
opacity and drops the scale. Never hand a **function** style to
`Animated.createAnimatedComponent(Pressable)`: it is dropped silently,
and every button in the app loses its background while still typechecking
and still passing every test.

**The tab bar floats** (`components/FloatingTabBar`) and
`components/dock.ts` owns the arithmetic — `aboveTabBar()` for anything
docked over it, `useDockPadding()` for **any** scrolling screen's
content. There is no cascade here to publish a height into, so a literal
`bottom: 16` is how a bar ends up drawn over the tab strip.

Two halves of the same lesson, both found in a screenshot rather than in
the tree, because in each case both things were laid out correctly and
only their relationship was wrong:

- **`isTabRoute()` decides where a docked bar sits.** `CartBar` used
  `aboveTabBar` on every route, and a pushed screen has no tab bar — so
  on `/account/notifications` it hovered 112pt off the bottom edge with
  the page's own content visible underneath *and* below it.
- **`useDockPadding()` is what a scroll container owes at its end**, and
  it is a hook because both terms vary at runtime: whether a tab bar is
  under the content, and whether the cart bar is up (only while the
  basket holds something). Twenty-seven screens padded a flat
  `space.s8` and every one of them hid its last row the moment somebody
  had a cart. `CART_BAR_HIDDEN_ON` is one list, read by the bar and by
  the padding that makes room for it — two copies is how a screen pads
  for furniture that is not there.

**A screen that lists products shows them.** Cart rows, the snacks menu,
the checkout basket and the occasion hub all named a product and drew
nothing; `ImageSlot` with a real `width` is the fix, and the width is
what decides the optimizer's `w` (6 KB where 296 KB would otherwise go).
Where the payload carries no image — `OrderItem` has neither a photo nor
a vendor — the screen says more about what it *does* know (the quantity
as its own mark, the delivery date off `shipments`) rather than
inventing one.

## 6. Native-module ledger

Every entry invalidates **every installed dev client**. A milestone that
adds one says so in its first DoD line and bumps `runtimeVersion`.

| Module | Milestone | Dev client |
|---|---|---|
| `expo-font` + `@expo-google-fonts/{fraunces,ibm-plex-sans,ibm-plex-mono}` | A1a — **landed** | rebuild |
| `expo-location` | A3 — **landed** | rebuild — and re-run `expo prebuild`: the config plugin writes `NSLocationWhenInUseUsageDescription` and the two Android permissions, and a dev client built before them refuses the request with no prompt |
| `@react-native-community/netinfo` | A0 — **landed** | rebuild — the two-code offline taxonomy depends on it |
| `@react-native-async-storage/async-storage` | A3 — **installed** | rebuild — backs the offline query cache (public catalogue roots only) |
| `react-native-svg` (via `lucide-react-native`) | A3 — **installed** | rebuild — same icon drawings as the web's `lucide-react` |
| `react-native-reanimated` / `react-native-gesture-handler` | A0 — installed, unused | rebuild — pulled in by the Expo template; the skeleton pulse is plain `Animated` with `useNativeDriver` and needs no worklet |
| `react-native-razorpay` 3.0.0 *(TurboModule — see the spike below)* | A4 — **landed** | rebuild — and re-run `expo prebuild`: `app.json` gained `LSApplicationQueriesSchemes`, without which iOS refuses `canOpenURL` for every UPI app and Razorpay's intent flow silently offers none |
| `expo-crypto` | A4 — **landed** | rebuild — `randomUUID()` for the checkout `Idempotency-Key`; Hermes has no `crypto` global, and the web's `crypto.randomUUID()` does not exist here |
| `expo-image-picker` | **A5 — landed** (was filed under A6) | rebuild — and re-run `expo prebuild`: the config plugin writes `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription`, and iOS kills the app outright when a picker opens without them. It moved forward because A5's profile screen is the first surface that takes a photo, and the web's rule is that **a photo wins and the picker is the second-best answer** — shipping the characters alone would have inverted it on the app |
| `expo-clipboard` | A5 — **landed** | rebuild — "Copy code" on the referrals screen; React Native core dropped its own `Clipboard`. Free here, because it rode the same rebuild as the picker |
| `expo-notifications` | A7 | rebuild |
| a crash reporter (`@sentry/react-native`) | when `SENTRY_DSN` exists | rebuild — the seam is already in `src/platform/reporter.ts`; only the provider is missing |

**Razorpay — the A0 spike, and what it found.** The plan carried
`react-native-razorpay` as "an unmaintained old-architecture module
reached through the interop layer the New Architecture is removing", and
that is **out of date**. Measured 2026-09-06: `react-native-razorpay@3.0.0`
was published **2026-07-21**, declares a `codegenConfig`
(`RNRazorpayCheckoutSpec`), ships an `android/src/newarch` source set
gated on `isNewArchitectureEnabled()`, and carries a `NewArchSample` app
beside the old one. It is a TurboModule. A4 is not standing on a
disappearing interop layer.

The fallback is still named, because a payments milestone with no plan B
is the wrong shape whatever the module's health: **Razorpay Standard
Checkout in `expo-web-browser`** — `https://checkout.razorpay.com/v1/checkout.js`
answers 200, no native module is involved, and it keeps the property that
matters, that `keyId` comes from the API response so switching to live
keys needs no app release.

The module itself was **not installed in A0**. It is a native module, so
installing it invalidates every dev client for a milestone that was four
away, and the spike's job was the information, not the dependency. **A4
installed it**, along with `expo-crypto` in the same rebuild — the second
is a native module too, and paying for two in one dev-client rebuild is
free where paying for them separately is not.

**What the app does with it** (`src/payments/razorpay.ts`): `keyId` comes
from `POST /payments/razorpay/order`, never from a build-time constant,
so a `rzp_test_` → `rzp_live_` switch is a server env change and a restart
with **no app release**. There is deliberately no
`EXPO_PUBLIC_RAZORPAY_KEY_ID` fallback. A `mock: true` order — the
server's answer when its keys are still the `.env.example` placeholders —
is refused rather than opened against. No `theme` is passed: the sheet is
Razorpay's screen and keeps Razorpay's look, which also keeps a hardcoded
hex off a money file.

**The SDK resolving is not proof of payment.** There is no client verify
endpoint; the webhook flips the order and `GET /orders/:id` is the
authority. `src/payments/confirm-payment.ts` reads the order back
immediately and then repeats no faster than `POLL_FLOOR_MS` (30s, the
carrier-NAT floor), and **running out of attempts reports "we could not
confirm", never "payment failed"** — which would invite a second payment
for the same basket.

**Continuous Native Generation.** `ios/` and `android/` are **gitignored**;
all native config lives in `app.json` and config plugins. This is the only
mode in which an agent editing `app.json` is authoritative.

## 7. Failure catalogue

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to resolve "@/lib/types" from client/lib/api/products.ts` | the `@/lib/*` alias is missing | §5 |
| `window is not defined` inside `client/lib/...` | the `http`/`session`/`unreachable` aliases are missing, so the web layer got bundled | §5 |
| `Invalid hook call`, two Reacts | node resolution walked up into `client/node_modules/react` | §5, `resolver.blockList` |
| `Unable to resolve module @expo/metro-runtime` | `disableHierarchicalLookup` also hid a package's own nested deps | §5 — use the blockList instead |
| `client/lib/data is not bundled into the native app` at runtime | a mock fixture was read, so `isMockMode()` is no longer statically false | §4 — the bug is upstream of the stub |
| The same error, but from a `lib/api` function with **no** `isMockMode()` in it (`getLoyaltyTiers`, `getSupportPhone`) | it returns static display copy out of `lib/data` unconditionally — the one shape the stub's safety argument does not cover | §5d — move the value out of `lib/data` (it is content, not a fixture) and re-export |
| A photo picker opens and the app dies instantly on iOS | `NSPhotoLibraryUsageDescription` / `NSCameraUsageDescription` missing — the dev client predates the `expo-image-picker` plugin | re-run `expo prebuild` and rebuild the dev client (§6) |
| `Cannot find module 'next/headers'` from `npx tsc` | `client/node_modules` is missing | §2 — `npm ci` in `client/` |
| A CSS-module error from a file the app never imported | `tsc` followed an `import type` into `client/components`; `next-env.d.ts` is gitignored | `shared-boundary.spec.ts` should have caught it — run it |
| `null is not an object (evaluating 'RNRazorpay.open')` | dev client is stale after a native module landed | rebuild the dev client (§6) |
| `Network request failed` on device, fine on simulator | `EXPO_PUBLIC_API_URL` is `localhost` | §3 |
| Editing `.env` changes nothing | `EXPO_PUBLIC_*` are inlined at bundle time | restart with `--clear` |
| Bundle grew ~300 KB | a barrel import pulled `admin.ts` + `lib/data` | §4 |
| `Cannot use import statement outside a module` from a `lucide-react-native/icons/*.mjs`, in jest only | jest-expo's transform key is `\.[jt]sx?$` and the per-icon subpaths are `.mjs`. Metro transforms them (the `react-native` export condition resolves to `dist/esm`), jest did not — so jest and Metro disagreed about a file the app ships, and only a spec that RENDERED an icon found it | `jest.config.js` transforms `\.mjs$` with the project babel config, and `transformIgnorePatterns` allows `lucide-react-native` |
| Module count more than doubled after adding icons | `import { X } from "lucide-react-native"` — the barrel is 3,616 icons | import from `@/components/icons` (per-icon subpaths, kebab-case, **default** exports) |
| A structural scan reports offenders that look wrong | a regex over JSX props stopped at the `>` in `style={({pressed}) => …}` | scan tags brace-aware; `test/a11y-floor.spec.tsx#openingTags` |
| Every list re-fetches on returning to a screen | TanStack's `refetchOnWindowFocus` has no meaning on a phone and fires on alert dismissal | off by default in `src/query/client.ts` |
| A 429 turns into four 429s | the throttler returns the whole 60s window, so a retry cannot succeed | never retried; `isRetryable` |
| Prices render `INR 100,000` not `₹1,00,000` | ICU-less Hermes; `Intl` is constructed at module scope in `lib/format/currency.ts` | the polyfill named in A0 |
| `crypto.randomUUID is not a function` | Hermes has no `crypto` global; the web's checkout key uses it | `randomUUID` from `expo-crypto` (§6) |
| The UPI list in Razorpay's sheet is empty on iOS, fine on Android | iOS refuses `canOpenURL` for any scheme not in `LSApplicationQueriesSchemes`, so an unlisted UPI app is simply not offered — silently | the list is in `app.json`; a dev client built before it needs a rebuild |
| A gift wrap or message the buyer asked for never reaches checkout | `client/lib/gift/gift-intent.ts` was imported — it reads `sessionStorage` and swallows its own TypeError | import `@shared/gift/gift-intent-shape` and the app's own `src/checkout/gift-intent.ts` store; the web module is REFUSED in Metro (§5d) |
| The delivery-date picker offers a day in the past | the option list was captured once instead of computed from `now` | `deliveryDateOptions(now)` in `@shared/schedule`, called after mount |
| A screen says money arrived and the balance has not moved | the Razorpay SDK resolving was read as proof; the credit is the `payment.captured` webhook's | `confirmTopup` / `confirmPayment` — read it back, and say "still confirming" when you cannot see it |
| Every test in a list spec passes while printing an act() warning | `VirtualizedList` schedules its cell pass on a ~50ms timer, after the mount's `act` closed | flush that macrotask inside `act` — see `test/wallet-screen.spec.tsx` |

## 8. What CI proves, and what only a device can

**The app CI job runs four steps**, mirroring the `client` job — and the
fourth is not optional. `CLAUDE.md` records why: `tsc --noEmit` does not
resolve a CSS module path, so a broken import passed typecheck, lint and
jest and broke the deploy on 2026-09-04. Every failure in §7 is invisible
to the first three and visible only to Metro.

```
npm run typecheck
npm run lint
npm test
npm run build          # expo export --source-maps — Metro, on a plain runner
npm run check:bundle   # what is IN the bundle
```

`npm run verify` runs all five in order.

`check:bundle` also enforces **ceilings** on things a barrel silently
multiplies — today, at most 40 `lucide-react-native` icon modules. A
count rather than a name ban, because it catches a transitive dependency
doing it too. Verified to fail: with the barrel it reports 1,807.

`check:bundle` (`mobile/scripts/check-bundle.mjs`) reads the **source
maps**, not the bytecode — `.hbc` is compiled Hermes and cannot be grepped
for module paths. It fails the build when `client/lib/data/**` or
`client/lib/api/admin.ts` appears, when any of the three web-coupled
modules appears, or — the positive half, because the alias failing *open*
is the worst outcome — when `src/platform/http.ts` is **absent**. The job
must also `npm ci` in `client/` (§5), and its cache key lists **both**
lockfiles.

**Agent-checkable** (no hardware): all four steps above, plus Maestro
against a headless simulator/emulator. This is the milestone loop — a
dispatched agent verifies here and does not ask for a device.

**Owner-checkable** (hardware only, one recurring checklist rather than
eleven ad-hoc requests):
1. push delivery — the iOS simulator has no APNs
2. Razorpay, or its WebView fallback
3. camera / gallery upload, including Android `content://` URIs
4. the A0 install itself

**An Expo SDK bump is a native change.** It invalidates every dev client
and requires a store release, so it cannot ship as an EAS Update. Upgrade
one SDK at a time via `npx expo install --fix`, on its own branch, with
`expo export` green and one Maestro pass before any feature work rides on
it.

## 8a. Driving a simulator — the harness, and what it has to know

`mobile/scripts/` holds three files. They exist because the checks in §8
prove the app *builds* and prove nothing about whether pressing something
does anything.

| Script | Question it answers |
|---|---|
| `sim-drive.mjs` | the driver — `describe`, `find`, `tap`, `press`, `typeInto`, `scrollTo`, `swipe`, `shot` |
| `sim-sweep.mjs` | opens every route: does it render, is every control labelled, is every one ≥44pt |
| `sim-press-all.mjs` | presses each control on a screen one at a time: **does anything change** |

```
npx expo run:ios                                  # build + boot once
node scripts/sim-signin.mjs you@example.com pw    # cold start, sign in
node scripts/sim-sweep.mjs /tmp/sweep
node scripts/sim-press-all.mjs /tmp/press "" "(tabs)/food"
```

**It drives the accessibility tree, not pixels** (`idb ui describe-all`),
which is the point: everything the harness can reach is something a
VoiceOver user can reach, and a control it cannot find by label is one
they cannot find either. It navigates by the dev deep-link scheme
`in.homekrafted.app://`, which exists **only** for this — production
registers Universal Links and no custom scheme.

Six things the tree does not tell you, each of which made a working app
look broken before it was handled:

- **A tap outside the window is a silent no-op.** An accessibility frame
  is reported in unclamped window coordinates, so a control at the end of
  a long scroll reads `y=1202` on an 874pt screen. `tap()` refuses one
  and names the fix; without that, checkout's Place order was reported as
  a dead button while working perfectly.
- **A swipe must keep both ends inside the window**, or scrolling *up* is
  clamped and a target that was scrolled past can never be recovered.
- **A rail scrolls sideways.** Try the horizontal axis first — the home
  rail lays cards out at x=961 on a 402pt window.
- **A virtualised list does not contain a row until it is mounted.** A
  miss is "not yet", not "not there": scroll on and look again.
- **A dismissing keyboard re-lays a form out over about a third of a
  second.** `scrollTo` waits for the frame to stop moving; without it a
  run put one field's text into another, stored it, and looked exactly
  like an app defect until the row was read back from the API.
- **`hitSlop` is invisible.** A control that pays for its 44pt that way
  declares it with `testID={HIT_SLOP_TAP_TARGET}`
  (`src/components/tap-target.ts`) and the sweep lists those under their
  own heading — a claim somebody made, never dropped.

Two iOS reporting quirks worth knowing: a `TextInput`'s frame is 2pt
smaller in each dimension than its layout box (so the sweep allows a
text field that inset and nothing else), and `accessibilityRole="switch"`
is reported as **CheckBox** — the notification screen read as zero
controls until that was in the tappable set.

**What still cannot be tested here:** push (no APNs on the simulator), a
completed Razorpay payment (the sheet is a WebView with no accessibility
tree, and it needs a real card), and camera capture. Those stay on the
owner-checkable list in §8.

## 9. Release

See `docs/APP-RELEASE.md` (written in A8) for EAS profiles, signing
credentials, version vs `runtimeVersion` policy, staged rollout, the
App Store reviewer account, and the pre-submission checklist.
