# Landing redesign (2026-09-23)

## 2026-10-23 festive client pass (current)

The owner supplied a Diwali marketplace reference and requested a warmer,
more festive landing without fabricating catalogue photography. This pass
keeps v2's interactive compositions and changes the merchandising layer:

- Public Sans Regular (400) is the landing body face; Public Sans Bold (700)
  is the only loaded bold face for headings and emphasis. This supersedes
  the September serif-led type decision for `/` only.
- The ISB artwork is removed from the hero. `#hk-hero-section` remains as the
  header's observation target on a new Diwali feature card, so the transparent
  header handoff does not regress.
- The hero and pine shelf use `festiveGiftEdit`: a deterministic live-product
  edit that leads with a hamper, candle and crochet item when present, then
  Diwali-tagged gifts and the remaining craft catalogue. It never invents a
  listing and never randomises server/client order.
- “By Homekrafted” becomes “Diwali hampers”, with a direct Diwali-filtered
  route. The homepage also carries “Homekrafted app — Coming soon on Google
  Play” in Other ways in.
- The warm paper, marigold, madder and gold details add the festive mood; pine
  remains the brand anchor and product photography remains real/licensed.

The v2 record below remains useful as architectural history; wherever it says
ISB banner, By Homekrafted, Eczar or Literata, this section now supersedes it.

## v2 — "On the table" (current — renders `/` in the working tree since 2026-09-23; not yet committed or deployed)

**The notebook direction below (v1) was rejected by the owner on 2026-09-23**
after seeing its N0 specimen: *"too symmetrical and repetitive, make it
unique and interactive."* Every v1 section shared one frame (margin note,
heading, ruled body) and nothing on the page answered the visitor. Its
primitives and specimen are deleted. What survives from v1: the owner's
answers (§0, §12 — gift buyers first, pine + gold + madder, serif-led,
every claim fix), the pre-existing defects list (§13), and the
`overflow-x: clip` fix in `globals.css`.

**v2 rule: no two sections in a row share a composition, and each one does
something when you reach for it.** Built in `client/components/landing/`;
approved by the owner ("this one looks good focus on this design") after a
preview at a dev-only route, then moved onto `/` — `app/page.tsx` renders
`<LandingPage />` and keeps only its freshness and JSON-LD. The reels were
moved from seventh to third at that point (the M52 audit rule in
CLAUDE.md), and the order around them re-dealt so neighbours still differ.

| # | Section | Composition | Interaction |
|---|---|---|---|
| 1 | Hero (`HeroTable`) | Wordmark (`#hk-hero-brand`), off-centre two-line h1, ISB banner taped down at an angle across columns 5–12 | Four real listings as prints you can drag around the hero (`DraggablePrints`; a press that barely moves is still a click; phones get a scroll row) |
| 2 | Doors | Diagonal split, gifts wider at rest, heading right-aligned | The half you lean toward opens (`--seam` clip-path, focus counts) |
| 3 | Reels | Narrow words left, clips bleeding off the right | `ReelsRailClient` unchanged (preview budget and credits) |
| 4 | Register | Heading whose last word is the list switch; staggered 4-column grid | Bestsellers/trending switch, tab set with a sliding marker, cards dealt back in on change |
| 5 | Promises | One large sentence, off-grid, note card beside it | Each underlined phrase opens the rule behind it (hover, focus or tap; one live region) |
| 6 | By Homekrafted | Pine sheet with a torn edge, shelf running off the right | Scroll rail |
| 7 | Occasions | List left, heading top-right | Picture follows the pointer down the list; phones get thumbnails |
| 8 | Other ways in | Four notes, four stocks, four tilts, stuck at different heights | Straighten and lift on hover |
| 9 | Categories | Round stickers in a cloud the heading sits inside | Pop and straighten on hover |
| 10 | How this works | Pine band; big word pinned left, steps right | The pinned word swaps as each step passes the middle of the screen |
| 11 | Inserts | Admin promo bands: one big and dark, one pale laid across its corner | Lift on hover |
| 12 | Questions | Answers left, heading pinned right | Accordion |
| 13 | Sell | Pine sheet, huge two-line title, blurb offset right, app note | "Start selling" leans toward the pointer |

Motion: CSS scroll-driven rises (`.lp-rise`, `view()` timeline, gated on
`prefers-reduced-motion: no-preference` and `@supports`), plus the small
client components above. No new dependency — `position: sticky` and
`view()` both work since the `globals.css` fix (§13 item 10), so the pinned
story needs no GSAP. Fonts: Eczar (display, `components/landing/fonts.ts`),
Literata (text), Kalam for two hand notes only. Gold never carries text
(owner D7).

---

## v1 — "The Maker's Notebook" (rejected, kept for the record)

**Status: rejected 2026-09-23 at the N0 checkpoint; code deleted.** Scope was `/`
(`client/app/page.tsx`, `page.module.css`, `components/home/*`, and the landing
variant of the header).

Surface brief and direction contract: `.impeccable/surfaces/client-app-page-tsx.md`
(v1's; superseded by v2 above). Product truth: `PRODUCT.md`.

---

## 0. The owner's answers (2026-09-23)

| # | Question | Answer |
|---|---|---|
| A1 | Who does the page talk to for the next few months? | **Gift buyers first.** ISB banner leads, handcrafted gifts carry the page, food is a clearly marked "opening soon" chapter. Re-balance when food opens. |
| A2 | How far can colour move? | **Keep pine + gold, used in a new way, plus one new supporting colour.** Logo untouched. |
| A3 | Is "serif, bold, no sans" still a rule? | **Yes — serif-led.** Bold display serif, readable text serif, a small label face. No sans on `/`. |
| A4 | Motion appetite? | **"Rich CSS and cinematic."** CSS-first everywhere, plus a scroll-scrubbed library layer for a few set pieces. |
| A5 | Direction (decision page, after one re-roll) | **The Maker's Notebook.** Code-led build (no mockup images — AI imagery is banned in this repo). |

Standing constraints carried over: same information as today; ISB crochet
banner kept with its information; `handoff/` and `styles/tokens.css`
untouched; CSS Modules only; **framer-motion is banned** (`CLAUDE.md` Stack),
so the cinematic library is **GSAP**.

---

## 1. Why four passes read as "the same landing page"

Measured on the working tree at 1440×900 and 375×812 (mock mode, :3100).

1. **One frame, fifteen times.** Every section is `container-wide → heading
   bar (h2 left, gold mono "View all →" right) → content`. Changing a font, a
   colour or one section's shape inside that frame never changes the rhythm,
   and the rhythm is what a visitor remembers.
2. **It sits in the named 2026 "AI aesthetic".** Warm cream ground, bold/italic
   serif headlines, tracked-out mono eyebrows, a ticker bar, numbered 01/02/03
   steps, a row of equal tiles, FAQ accordion, centred CTA band. (Kyle Chayka,
   *The New Yorker*, 29 Jun 2026 — "the Claude aesthetic"; Generative Labs;
   Developers Digest.) Each pass kept most of these, so each pass looked the same.
3. **Cards everywhere.** Product cards, quick-entry tiles, seasonal band,
   promo bands, occasion tiles, app panel — white rounded rectangles on cream.
   Nothing is *on* the page; everything floats in a box.
4. **The person is missing from the pixels.** The one proposition — a named
   person made this at home — appears as a 10px mono maker line.
5. **Defects under it** (all confirmed in the browser or source):
   - **No `<h1>` on `/` at all.** `presentation.spec.ts:125-143` ("exactly one
     h1") fails today.
   - `presentation.spec.ts:102-123` (logo hidden at top, revealed on scroll)
     fails today: `HeaderClient.tsx:241` hardcodes `showLogo = true`.
   - The ISB banner is one 2048×768 raster with no mobile art direction; at
     375px its type is ~8px tall. In our capture it rendered as an **empty green
     box** at 375px (verify: may be load timing).
   - `BestsellersTabsSection` claims `role="tablist"` with no `tabpanel`, no
     `aria-controls`, no arrow keys.
   - The CartBar overlaps the gifts panel on phones.
   - `QuickEntryRow` ignores its `detail` prop; `lib/data/site.ts`
     `quickEntryDetail` copy is never rendered.
   - Two loaded fonts are unused (Instrument Serif, Kaushan Script) — paid on
     every route.
   - Claims the product does not back are still live (list in §12).

---

## 2. Research that shaped this

Full notes live in the session record; the decisions they forced:

- **References.** Diaspora Co. (provenance as the hero: farm, family, harvest
  date on the label) — the strongest fit for "the maker is the product".
  Goldbelly (maker-first cards). Subko (multi-script wordmark — specificity
  without kitsch). Raw Mango ("we do not believe our designs need to be kitschy
  to be Indian"). Manam (show the workshop). Gourou Indian Food, Awwwards HM
  Feb 2026 (two-ink palette, bilingual setting). Etsy's SYLVAIN refresh.
- **Cultural systems considered** (ranked lists in §3): phulkari, mithai box,
  shagun/Sivakasi card press, India Post, bazaar signboards, Basant kites,
  Chandigarh modernism + Nek Chand, the ruled notebook/register, bahi-khata.
- **Typography.** Serif faces verified in next/font's own Google catalogue
  (`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`),
  and every candidate's cmap checked for **₹ (U+20B9)**. No ₹ in Besley, Young
  Serif, Bodoni Moda, Ibarra Real Nova, Alike, Rufina, Courier Prime — ruled
  out for anything that shows a price.
- **Motion support (Sep 2026).** Scroll-driven animations: Chrome 115+,
  Safari 26+ (off-main-thread since 26.4); **Firefox not shipped** (flag;
  Interop 2026 focus). `@starting-style`, `@property`, `text-wrap: balance`,
  same-document View Transitions: Baseline. React 19.3 made `<ViewTransition>`
  stable (repo is on 19.2.4 / Next 16.2.11 — a later upgrade item, not this
  plan).
- **Research dissent, recorded:** the research pass advised skipping GSAP.
  The owner asked for cinematic motion (A4). This plan keeps GSAP to **two set
  pieces, desktop-only, lazy-loaded**, and every page is complete without it.

---

## 3. The direction round

Run with impeccable's `concept-seed` (seed key `4d7ffa5d`, Persuade mode).

**Round 1** — grounded list, ranked by resonance *before* the roll: 1 mithai
box · 2 shagun/invitation press · 3 phulkari · 4 postal parcel labels · 5
bazaar signboards · 6 bahi-khata ledger · 7 magazine features. Roll assigned
#3 **Phulkari**; pick card #1 **Halwai's Box**; challenger Record Sleeve
(competitive), four declined. **Owner re-rolled.**

**Round 2** — every earlier candidate eliminated; fresh list: 1 shagun & card
press · 2 Chandigarh modernism / Jeanneret workshop · 3 India Post parcel &
seal · 4 hand-painted signboards · 5 Basant kites · 6 **the ruled notebook /
maker's register** · 7 film hoardings. Roll assigned #6. Pick card: Shagun &
Card Press. Challengers: Comic Album (Tinkle/ACK fused — competitive, needs a
commissioned illustrator), five declined. **Owner kept the roll.**

**Raises carried into the chosen direction** (a declined challenger donates a
discipline, never its look):

| From | Raise |
|---|---|
| Emission-line rail | **One axis.** Everything registers against the red margin — an off-centre rail, never a centred column. |
| Cutting-bench rail | **Dog-ear.** The shelf a visitor last opened is remembered and folded on return. |
| Scene magazine | **Hard crops.** Photos bleed off the page edge; never a polite centred thumbnail in a card. |
| Folded crane | **Rough-work stays.** A crossed-out or ticked line keeps its mark; the page shows its history. |
| Hand-processed film | Texture only where a real page is; **never a global grain overlay**. |

---

## 4. The world

### 4.1 Grammar

| Element | What it is | What it does on the page |
|---|---|---|
| **Ruled paper** | Cool white ground, faint pine rules at one pitch | The **baseline grid**. Body text sits on the rules; headings take whole multiples of the pitch. Paper sections only. |
| **Red double margin** | Two madder lines, off-centre left | The **one axis**. Headings hang from it; the gutter left of it holds metadata (dates, counts, locality). Replaces every mono eyebrow. |
| **Cloth cover** | Pine-deep cloth with a fine weave (CSS, 2px crosshatch, ≤6% alpha) | Chapter breaks: the front cover (first viewport), "How this works", the back cover (sell). |
| **Foil label** | Gold double-rule rectangle stamped on a cover | Holds a cover's title. Gold draws the **rules only**; the words inside are on-pine (see §12 D7 for the gold-bright option). |
| **Tipped-in photo** | A real photo held by four photo corners, ±0.8° tilt | Every product and reel still. Hard-cropped; may bleed off the page edge. No card box, no shadow beyond a 1px contact line. |
| **Red-pen marks** | Tick, underline, circle, strike (one SVG stroke each) | **Meaning, not decoration**: tick = a person checked this (listing review, M22); underline = the one word that matters on a page; strike = superseded (rough-work stays). |
| **Pencil note** | Kalam, graphite | The maker's hand: "opening soon", "pre-order". **Max two per screen**, `aria-hidden`, never the only place a fact is stated (DESIGN.md rule, kept). |
| **Divider tabs** | Coloured tabs sticking out of the page edge | Filters (All · Food · Combos · Gifts). Real tabs semantics. |
| **Thumb index** | A–Z cut into the page edge | Categories. |
| **Dog-ear** | A folded page corner | "Pick up where you left off" (client-only, localStorage, renders nothing when empty). |

### 4.2 Palette — pine + gold, used as cover and foil; madder as the red pen

Strategy: **committed**. Paper carries the reading; pine cloth covers own
roughly a third of the page at full bleed (front cover, How it works, back
cover); madder is the one pen colour; gold is foil only.

| Role | Value | Source |
|---|---|---|
| Paper | `#FAFBF7` (cool, faintly green — deliberately not cream) | new, landing-scoped |
| Rules | `#DCE5DA` (decorative, 1.24:1 — never carries meaning alone) | new |
| Margin / red pen | `#A61E4D` madder | **the new supporting colour** |
| Ink | `#16241C` pine-black | new (pine family) |
| Graphite (pencil, secondary text) | `#5E665F` | new |
| Cover cloth | `--hk-pine-deep #1B3327`, `--hk-pine #234233` | tokens.css |
| Foil (rules, seals, fills) | `--hk-gold #B98724`, `--hk-gold-bright #E4C874` | tokens.css |
| Text on cover | `--hk-on-pine #EADFC9`; pale rani `#F2A7BC` for pen marks on cloth | extend / new |

Contrast, measured (WCAG ratio):

| Pair | Ratio | Verdict |
|---|---|---|
| Ink `#16241C` on paper | 15.51 | body ✓ |
| Madder `#A61E4D` on paper | 6.93 | text ✓ |
| Madder on a rule line | 5.58 | ✓ |
| Graphite `#5E665F` on paper | 5.71 | secondary text ✓ |
| `--hk-gold-text-sm #886815` on paper | 5.00 | ✓ (if ever needed) |
| On-pine `#EADFC9` on pine-deep | 10.26 | ✓ |
| Pale rani `#F2A7BC` on pine-deep | 7.12 | ✓ |
| Gold-bright `#E4C874` on pine-deep | 8.27 | passes — but see §12 D7 |
| **`--hk-terracotta #B65D3C` (ProductCard price) on paper** | **4.37** | **✗ fails AA** — the tipped card variant sets price in `--hk-terracotta-text #A04D2E` (re-measure) |
| `--hk-gold #B98724` on paper | 2.85 | never text (rule kept) |

**Re-measured in the browser (N0, 2026-09-23)** from computed colours on
`/gallery/notebook`: body 15.51; graphite margin notes, captions, leader
details and the unchecked line 5.71; the cover `<h1>`, foil-label line and
quiet link on cloth 10.26; pine on the gold-bright button 8.27; the index
letter (madder on madder-wash) 5.86; divider tabs 13.6–15.51 on all four
grounds. Every text pair clears AA; the table above stands.

### 4.3 Typography — three faces, all with ₹

| Face | Role | Why |
|---|---|---|
| **Eczar** 700–800 (variable 400–800; Vaibhav Singh / Rosetta, 2015) | Cover titles, chapter titles, the h1 | Bold, sharp, calligraphic serif from an Indian designer; "display qualities intensify with weight"; Latin + Devanagari; has ₹; Google rank ~391 — not an LLM default. Track −0.015em at display sizes. |
| **Literata** 400–600 + italic (opsz 7–72) | Running text, product names, prices | The best screen text serif on the list; already loaded; has ₹. opsz does the small/large tuning for free. |
| **Castoro Titling** 400 (Tiro Typeworks) | Labels in the margin gutter, tab labels, the foil label's small line | Inscriptional capitals; replaces the tracked IBM Plex Mono eyebrow (the #1 named AI tell). Has ₹. |
| Kalam 400 (existing) | Pencil notes only | Indian Type Foundry; already a brand asset; rationed. |
| *Tiro Gurmukhi 400 — optional* | Real Punjabi words only | Only if a native speaker writes the words (§12 D9). Never decoration. |

**Dropped on `/`:** Fraunces, Hanken Grotesk, IBM Plex Mono, Instrument Serif.
**Deleted site-wide:** Instrument Serif and Kaushan Script (loaded, used
nowhere — N0).

**Scale on the rule** (pitch `--nb-rule`: 28px phone, 32px ≥780px):

| Token | Size (clamp) | Line-height | Face |
|---|---|---|---|
| `--nb-cover` | clamp(44px, 6.4vw, 96px) | 3 rules | Eczar 800 |
| `--nb-chapter` | clamp(32px, 4.2vw, 64px) | 2 rules | Eczar 800 |
| `--nb-title` | clamp(22px, 2vw, 28px) | 1 rule | Eczar 700 |
| `--nb-body` | 17px → 18px | 1 rule (28/32) | Literata 400, opsz auto |
| `--nb-label` | 12px → 13px | half rule | Castoro Titling, +0.06em |

Baseline alignment: `text-box: trim-both cap alphabetic` under `@supports`
(Chrome 133+, Safari 18.2+); elsewhere a per-size padding table. Images snap
their heights to whole rules (aspect ratio rounded) so the grid survives a
photo. `text-wrap: balance` on titles, `pretty` on paragraphs.

**Loading:** Eczar and Castoro Titling are declared in a landing-only module
(`client/app/fonts/notebook.ts`) imported by the landing tree, so their
preload tags ship on `/` only. Latin + latin-ext subsets; Devanagari not loaded.

### 4.4 State vocabulary (stroke, never hue)

| State | Mark |
|---|---|
| Available / chosen | Inked (full ink, underline on hover/focus) |
| Opening soon (food) | Pencilled — graphite text + pencil note, link still works (browse is open) |
| Pre-order | Pencil note "pre-order · N days" (only where `prepTimeMins` says so) |
| Checked by a person | Red tick (only on claims the product enforces) |
| Superseded / sold out | Red strike through the line, kept visible |
| Current tab | The tab comes forward onto the page edge (no colour change needed) |
| Where you left off | Dog-ear on that shelf |

### 4.5 Motion grammar

**The page is written, not faded.** Nothing on the page fades up from
nothing. Titles write in left→right, photos are tipped in, pen marks draw,
covers turn.

Easing and duration (Emil / Apple rules; UI under 300ms, explanatory longer):

```css
--nb-ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* entering */
--nb-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* moving on screen */
--nb-press: 120ms;   /* scale(.97) on every pressable */
--nb-tip: 420ms;     /* photo tipped in: translateY(10px) rotate(0) → final tilt */
--nb-write: 600ms;   /* title reveal: clip-path inset(0 100% 0 0) → inset(0) */
--nb-pen: 700ms;     /* stroke-dashoffset draw, one mark */
```

**Layer 1 — CSS, every browser that supports it, no JS:**
- Scroll-driven reveals (`animation-timeline: view()`, range `entry 0% cover
  30%`) for title writes, photo tip-ins and pen marks. Gated
  `@media (prefers-reduced-motion: no-preference)` + `@supports
  (animation-timeline: view())`; the hidden state lives **only inside the
  keyframes**, so Firefox and reduced-motion visitors get the finished page.
  `animation-timeline` is written **after** the `animation` shorthand.
- **The drawn margin.** The red margin draws itself down the page with a
  root `scroll()` timeline (one SVG line per paper chapter). Firefox: drawn.
- Stagger ≤ 60ms per item, ≤ 360ms total. No idle loops, no marquee.
- Tabs switch with a 150ms cross-fade (tens of times per visit — keep it
  near-instant). Rail arrows: no animation beyond native smooth scroll via
  `lib/motion.ts#scrollBehavior()`.
- Hover (gated `(hover: hover) and (pointer: fine)`): a tipped photo's
  corner lifts (rotate +0.6°, 180ms); a link gets its red underline drawn.
  No `translateY(-4px)` card lifts.

**Layer 2 — GSAP + ScrollTrigger, cinematic, two set pieces (§6):**
- Loaded with dynamic `import()` from one client island only when
  `matchMedia('(min-width: 900px) and (hover: hover) and
  (prefers-reduced-motion: no-preference)')` matches. Phones and
  reduced-motion visitors never download it.
- Only `transform`/`opacity` animated; `gsap.context()` reverted on unmount;
  no `window` scroll listeners; no smooth-scroll hijack (no Lenis).
- License: GSAP "Standard no-charge license" (all plugins free since 2025) —
  confirm the terms before N4.

**Reduced motion:** the global floor in `globals.css` stays. Covers do not
turn (pages sit stacked), pen marks render drawn, photos render tilted in
place. Nothing is lost.

### 4.6 What this world bans on `/`

Cream canvas · cards (white rounded boxes) · drop shadows · gradients as
decoration · tracked mono eyebrows · "View all →" in gold mono · marquee/ticker
· numbered 01/02/03 steps · italic serif accent words · glass/blur panels ·
emoji · a second accent colour · a fake QR code · any number the catalogue did
not count.

**Watch-out:** hairline rules are also a named AI tell ("broadsheet"). The
rules here must read as a **notebook** (one pitch, faint pine, red margin,
content sitting on them) and never as newspaper column rules.

---

## 5. The page, chapter by chapter

Same information as today; new order for gift buyers first. **Twelve layout
families across thirteen chapters** (the cover repeats only as bookends).

| # | Chapter (new) | Replaces | Layout family | Content kept |
|---|---|---|---|---|
| 1 | **Front cover** | `IsbCrochetBanner` | Cloth cover + tipped-in banner + foil label | Banner art, link `/gifts?category=crochet`, its aria-label/alt; the page's **h1** |
| 2 | **The spread** | `SplitPanels` | Open two-page spread, centre fold | Gifts (left, inked) / Food (right, pencilled "opening soon"); hrefs, blurbs, CTAs "Browse gifts", "Find a kitchen", photos |
| 3 | **Checked** | `Ticker` | Ruled checklist with red ticks | The six promise lines (true ones ticked; see §12 D1) |
| 4 | **This week's register** | `BestsellersTabsSection` | Tipped-in photo grid, divider tabs on the page edge | Bestsellers + Trending, All/Food/Combos/Gifts, per-filter "explore" links, collections + fallback logic |
| 5 | **Someone you owe a present** | `SeasonalBand` + Occasions grid | Dated page: date box + calendar list | Seasonal countdown (conditional), first 8 occasions (no corporate), featured first, `/collections` |
| 6 | **Our own shelf** | By HomeKrafted | Feature note (≤2 items) / tipped rail (3+) | In-house listings, storefront link |
| 7 | **Pasted in from real orders** | Reels rail | Tipped-in stills strip, native horizontal scroll | 4 reels, quotes, credits, `ReelViewer`, preview budget, `#hk-reels-rail` |
| 8 | **Contents** | `QuickEntryRow` | Index with dot leaders | Gift Hampers, Meal Plans, Corporate Orders, Snacks on WhatsApp + their lines |
| 9 | **Thumb index** | Categories rail | A–Z edge index | Every photographed category, `/shop?category=…` |
| 10 | **How this works** | `HowItWorks` | Cloth chapter, pages that turn | Three steps (verbs as labels, no numerals); copy per §12 D2 |
| 11 | **Loose inserts** | Promo bands | Two index cards clipped to the page | "Gifts that feel personal" → `/hamper`, "Ghar Ka Khana, Every Day" → `/meal-plans` (admin data) |
| 12 | **Questions** | `FaqSection` | Q&A on the rules, question marks in the margin | Six Q&As, `<details>`, help-desk link, FAQPage JSON-LD |
| 13 | **Back cover** | `SellCta` + `AppInstallPanel` | Cloth cover + foil label; inside-cover note | Sell pitch, "Start selling" `/sell`, "How Homekrafted works" `/about`; "Shop on mobile web" note (no QR — §12 D3) |

Section heading count: 13 titles, **no eyebrow above any of them**; metadata
lives in the margin gutter (at most one gutter label per chapter).

### 5.1 Front cover (first viewport)

- **Desktop:** `min-height: 100dvh`, pine-deep cloth. The ISB banner is
  tipped in at `min(86vw, 1240px)` wide, 8:3, rotated −0.8°, four photo
  corners (pine-black kraft triangles). Below it, centred on the cover's
  optical axis, a gold double-rule foil label holding the **h1** in Eczar 800
  (`--nb-cover`, on-pine), and one line of Literata under it. The banner link
  is the primary action. Header floats transparent over the cloth; logo hidden
  until the cover leaves (restores the tested M56 handover — §10).
- **h1 copy:** the existing tagline, "Homemade, handpicked." (site title
  already says it) — no new claim. A proposed second line is in §12 D4.
- **Phones (<780px):** banner full-bleed (no tilt), then a **live-text
  caption** tipped under it carrying the banner's information: "Pre-orders
  open · Handmade crochet for the ISB Mohali campus · Keychains, bookmarks,
  flowers and more" + a real button "Shop crochet". Fixes the unreadable
  raster (A7) without touching the owner's artwork.
- **Later option (owner):** a portrait mobile crop of the banner art via
  `<picture>` if the owner supplies one.

### 5.2 The spread

- Two pages with a centre-fold line. **Left page = Handcrafted gifts** (read
  first), inked: tipped-in `split-gifts.jpg` hard-cropped off the outer edge,
  title, blurb, "Browse gifts". **Right page = Homemade food**, pencilled:
  graphite title, a pencil note "opening soon" (from `useFoodOrdersOpen()`,
  exactly as today), "Find a kitchen" still a live link (browse is open).
- Hover/focus leans a page open (the existing `--seam` mechanic reused as
  page widths) — keeps `audit-regressions.spec.ts:521-563` semantics (level at
  rest, focused page widens) with its selectors unchanged.
- Phones: pages stack, gifts first, no lean.
- CartBar overlap on phones fixed by honouring `--hk-dock-h` in the spread's
  bottom padding.

### 5.3 Checked

A short ruled list, two columns ≥900px. Each line that the product actually
enforces gets a red tick drawn on view; lines that are not true are not
ticked and wait for §12 D1. This replaces the marquee (a named tell) with the
same words, now legible and honest.

### 5.4 This week's register

- Divider tabs on the right page edge ≥900px (All · Food · Combos · Gifts),
  a chip row on phones. **Proper tabs:** `tablist` + `tab` + `tabpanel`,
  `aria-controls`, roving tabindex, ←/→/Home/End.
- Grid: first listing tipped in large (2×2 of the rule grid, bleeding off
  the left page edge), the rest smaller in two tiers; Bestsellers and Trending
  are the two pages of one spread on desktop, stacked on phones.
- Cards: `ProductCard` gains a **`variant="tipped"`** (CSS only — no photo
  box, corners, tilt, Literata name, price in `--hk-terracotta-text`). All
  behaviour (stretched link, add-to-cart awaiting `addItem`, sold-out,
  wishlist, badges chain) stays in the one component.
- "Explore collection" becomes a red-underlined Literata link in the
  margin, per filter, same hrefs.

### 5.5 Someone you owe a present

- A dated page: top-right date box (as in a register) with the seasonal
  countdown **only when** `currentSeasonalOccasion` returns one; shows the
  fact once (fixes B9's "42 DAYS" + "in 6 weeks").
- Below, the occasions as a calendar list: dated ones with
  `celebratedOn` in the margin gutter (Castoro Titling), evergreen ones
  under "any day" — `null` stays evergreen, never "missing". The first
  occasion gets the large treatment (tipped photo only if the occasion has
  real art; otherwise its `CraftIcon`).

### 5.6 Our own shelf

≤2 listings → one tipped-in feature with a pencil note, not a rail with 1150px
of empty panel (B8). 3+ → tipped rail. Rubber-stamp mark "By Homekrafted"
drawn as a madder outline stamp (static, one per page).

### 5.7 Pasted in from real orders

Four reel posters tipped in along a strip (native `overflow-x` +
`scroll-snap`, no pin — keeps `ReelCard`'s 0.75 observer and preview budget
intact). Quotes in Literata under each still, credit in the margin. The reel
viewer and its focus trap are unchanged. Link copy "Order homemade food" → see
§12 D6 (food is not orderable).

### 5.8 Contents

The four quick entries as a contents page: title … dot leaders … arrow, with
the one-line detail under each. Decide which copy is true (`CAPSULE_META` in
the component vs `quickEntryDetail` in `site.ts`) and delete the other.

### 5.9 Thumb index

Categories as an A–Z index cut into the page edge ≥900px (letter tabs, each
opening its shelf), a wrapped grid on phones. Icons from `Category.icon`
(`<Icon>`), never emoji.

### 5.10 How this works

Cloth chapter. Three pages, labelled by verb, not number: **You order ·
They make it · It reaches you**. CSS version: three stacked pages with a red
tick drawing on each (every browser). Cinematic version: pinned page turns
(§6.2). Copy per §12 D2.

### 5.11 Loose inserts

The two promo bands as index cards clipped to the page with a paperclip
(CSS-drawn, static), slightly overlapping the margin. Titles still split on
`\n`. Both CTAs use one treatment (fixes B7).

### 5.12 Questions

Questions on the rules, a madder "Q" in the margin gutter, answers in
Literata. `<details>` kept (keyboard, no JS). The sticky side heading stays
≥900px. FAQPage JSON-LD unchanged.

### 5.13 Back cover

Pine cloth mirroring the front cover: foil label "For makers" (Castoro
Titling) holding the sell headline in Eczar, the pitch, "Start selling",
"How Homekrafted works". Inside-cover note: "Shop on mobile web" with the
honest "native apps coming soon" line. The footer then reads as the endpaper.

---

## 6. Cinematic set pieces (GSAP layer)

All desktop-only (≥900px, hover, no reduced motion), lazy, `transform`/
`opacity` only. The static page underneath is complete.

### 6.1 The cover opens

- The front cover is pinned for ~70vh of scroll. The cloth cover (with the
  banner and foil label on it) rotates open on its left spine
  (`rotateY(0 → -165deg)`, `transform-origin: left center`, `perspective:
  1800px`, scrub 0.6) to reveal the spread (§5.2) already in place beneath.
  The cover's reverse face is a plain endpaper (flat pine-tint).
- The header's logo handover fires when the cover passes −90° (the h1 is on
  the cover, so the brand moves into the bar as the cover turns away).
- Interruptible by nature (scrubbed). Reduced motion / phones: no pin, cover
  and spread simply stack.

### 6.2 Pages turn in "How this works"

- Pinned for 3 × 55vh. Each step page turns on the spine (`rotateY(0 →
  -180deg)`) as its scroll range completes; its red tick draws at the end of
  its turn (same frame as the page settles — causal motion).
- Keyboard and screen readers get the three pages in DOM order regardless of
  pin (pinning changes transforms only, never order or visibility).

### 6.3 Not GSAP, but part of the cinematic feel

- The **drawn margin** (CSS scroll timeline, §4.5).
- **Pen marks** drawing on view (CSS).
- Optional later: product-card → product-page shared-element morph with
  React `<ViewTransition>` once the repo is on React 19.3 / Next 16.3 (a
  site-wide change, out of this plan's scope).

---

## 7. Architecture

- **New components** in `client/components/notebook/` (primitives):
  `NotebookPage` (paper + rules + margin), `ClothCover`, `FoilLabel`,
  `TippedPhoto` (wraps `ImageSlot`; corners, tilt, bleed), `PenMark` (tick /
  underline / circle / strike; draw-on-view), `PencilNote`, `MarginNote`,
  `DividerTabs` (tabs pattern), `LeaderList`, `ThumbIndex`, `DogEar`
  (client). Each `Thing.tsx` + `Thing.module.css`, named exports.
- **Chapters** in `client/components/landing/` (server by default; client
  leaves only where state lives: tabs, spread lean, dog-ear, reels, cinematic
  island). `app/page.tsx` stays the data owner (all eight getters, collection
  fallbacks, JSON-LD) and passes data down exactly as today.
- **Cinematic island:** `components/landing/CinematicLayer.tsx`
  (`"use client"`), mounted once at the end of the page; it finds the two set
  pieces by `data-cinematic` attributes, checks the media query, then
  `import('gsap')` + `import('gsap/ScrollTrigger')`. Nothing else imports GSAP.
- **Tokens:** `--nb-*` declared on `.notebook` in `app/page.module.css`
  (landing-scoped, like today's `.landingPage`). Promoted to
  `tokens.extend.css` only at site-wide rollout (N6), where the native theme
  generator will pick them up.
- **Fonts:** `client/app/fonts/notebook.ts` (Eczar, Castoro Titling),
  imported by the landing tree only. Delete Instrument Serif and Kaushan
  Script from `app/layout.tsx`.
- **Shared components touched:** `ProductCard` (+`variant="tipped"`, CSS-only);
  `HeaderClient` (landing mode restyle + real logo handover). Everything else
  in `components/home/` that the landing stops using is deleted in the same
  change (`SplitPanels`, `Ticker`, `HowItWorks`, `SellCta`, `SeasonalBand`,
  `QuickEntryRow`, `FaqSection`, `BestsellersTabsSection`, `IsbCrochetBanner`
  are landing-only). `AppInstallPanel` stays for `/app-promo`. The orphan
  `CraftCard` and `MakerCard` are deleted. **Run `npm run build` before
  pushing** — deleting CSS modules is exactly the failure `tsc` misses.
- **Dependency:** add `gsap` (and `@gsap/react` only if `useGSAP` earns its
  keep). Separately, remove the stray `framer-motion` dependency (imported
  nowhere; banned by CLAUDE.md) — its own one-line change.
- **`client/lib` boundary:** any pure helper (tab filtering, dog-ear record
  shape) lives in `lib/landing/` with no React/DOM; `localStorage` access
  stays in the component.

---

## 8. Accessibility & SEO

- Exactly **one `<h1>`** (the cover title). Chapter titles are `<h2>`,
  items `<h3>`; `heading-order` must pass.
- Tabs pattern for the register; `<details>` for FAQ; the reel dialog keeps
  its focus trap (`focus-traps.spec.ts:170-236`).
- Every pen mark, paperclip, photo corner and pencil note is
  `aria-hidden`; a pencil note never carries the only copy of a fact ("opening
  soon" is also in the food page's accessible name).
- Covers set `--hk-focus-ring: var(--hk-gold-bright)`; paper keeps the pine
  ring. First 40 tab stops must show a ring (`presentation.spec.ts:240-261`).
- Tilted photos keep their hit area axis-aligned (tilt the image, not the
  link) so touch targets stay ≥44px.
- JSON-LD graph, metadata, canonical: unchanged.

## 9. Performance budget

| Metric | Budget |
|---|---|
| LCP (banner via `next/image`, `priority`) | < 2.5s on mid-range Android (4G) |
| CLS | < 0.05 (every tipped photo reserves its box; fonts use next/font fallback metrics) |
| INP | < 200ms (tabs switch with no layout thrash) |
| Landing JS added, phones | ≤ 8 KB gz (tabs, lean, dog-ear) — GSAP never loads |
| Landing JS added, desktop | ≤ 50 KB gz including GSAP + ScrollTrigger (measure; drop a set piece if over) |
| Fonts added on `/` | Eczar variable + Castoro Titling, latin subsets (measure; target ≤ 90 KB) |

## 10. Tests

| Spec | Change |
|---|---|
| `presentation.spec.ts:125-143` one h1 | passes once the cover h1 lands (fails today) |
| `presentation.spec.ts:102-123` logo handover | passes once the handover is real again (fails today) |
| `presentation.spec.ts:60-82` no overflow at 360/768/1180 | must keep passing — tilted/bleeding photos are clipped by `overflow-x: clip` on the page |
| `audit-regressions.spec.ts:521-563` split lean | keep selectors (`a[href="/gifts"]` "Browse gifts", `a[href="/shop"]` "Find a kitchen"); re-measure widths on the spread |
| `focus-traps.spec.ts:170-236` reels | keep `#hk-reels-rail > button` |
| `a11y.spec.ts` on `/` | contrast + structure on the new palette |
| **new** `landing-notebook.spec.ts` | (1) reduced motion: every chapter's content visible, no transforms mid-state; (2) 390px: no request for `gsap` in the network log; (3) 390px: ISB caption text present and the "Shop crochet" button reachable; (4) register tabs: arrow keys move selection, panel labelled; (5) cinematic off: cover and spread both visible in DOM order |
| `e2e/sweep.mjs` | run for `/` at both viewports and all roles before calling any phase done |

## 11. Phases

Each phase is one reviewed change, green on `npm run build`, `npm run lint`,
`npx tsc --noEmit`, `npm test`, and `a11y.spec.ts`.

| Phase | Contents | Done when |
|---|---|---|
| **N0 — Decisions + foundations** | Owner answers §12. Fonts module; delete two unused fonts; `--nb-*` tokens; the ten primitives; a notebook specimen section in `/gallery` (dev-only, unlinked) showing type on the rules, palette, marks, tipped photo, tabs | Specimen reviewed by owner; contrast table re-measured in the browser |
| **N1 — Cover, spread, checked** | Front cover + h1 + phone caption; header landing restyle + logo handover; the spread; the checklist | Both failing presentation tests pass; first viewport matches the contract at 1440, 1280, 390 |
| **N2 — Catalogue chapters** | Register (tabs + tipped variant), occasions/dated page, our own shelf, contents, thumb index | Tabs a11y spec green; no card boxes left in these chapters |
| **N3 — Story chapters** | Reels strip, How this works (CSS pages), inserts, questions, back cover + inside note; delete retired `components/home/*` | Every §5 row implemented; `npm run build` green after deletions |
| **N4 — Cinematic layer** | GSAP island: cover opens, page turns; drawn margin; dog-ear | Phones load no GSAP; reduced motion shows finished pages; 60fps on a mid laptop (DevTools perf trace) |
| **N5 — Finish** | `impeccable detect` on changed files; finish review against the contract; fix round(s); `DESIGN.md` rewritten from the built page (+ `.impeccable/design.json`); docs upkeep (§14) | Reviewer verdict "ship" at full scope |
| **N6 — Rollout (separate decision)** | Whether the notebook world (type + tokens) spreads to `/gifts`, `/shop`, product pages and the native theme | Owner call after living with `/` |

## 12. Owner decisions needed (before N0 closes)

Copy that makes a claim is changed only with a yes (impeccable: refinement or
redesign never replaces factual copy unasked; CLAUDE.md: the platform never
says what a column does not hold).

| # | Where | Today | Problem | Proposal |
|---|---|---|---|---|
| D1 | Ticker → "Checked" | "Every maker & listing reviewed for **hygiene**" | A person reviews listings (M22); **no hygiene inspection exists** (M51 removed the same claim from the FAQ) | "Every listing is reviewed by a person before it goes live" (ticked) |
| D1b | Ticker | "Fresh meals delivered right to your doorstep" | Food cannot be ordered | Pencil it "opening soon", no tick — or drop |
| D2 | How this works, step 2 / 3 | "…in a **clean** home kitchen" · "…backed by **our guarantee**" | Hygiene claim nothing backs; a blanket guarantee is the reverse of the M15 rule (a return moves no money; a person decides) | Drop both phrases; step 3 says a person resolves problems through the order page |
| D3 | App panel | Decorative QR that scans as nothing; "live order tracking" | Fake affordance; tracking is status-only (channel rules) | Remove the QR; "order status updates" instead of "live tracking" |
| D4 | Cover | — | New second line under the h1 | "Every listing here carries its maker's name." (true: `Product.vendorId`) — or no second line |
| D5 | Spread, food blurb | "Cooked this morning in a home kitchen near you" | "this morning" is not always true (pre-orders, days of notice) | "Cooked after you order, in a home kitchen near you" |
| D6 | Reels link | "Order homemade food →" | Food cannot be ordered | "See real orders →" (`/gifts`) or pencilled "opening soon" |
| D7 | Cover titles | on-pine text inside gold rules | Gold-bright text on pine measures 8.27:1, but the house rule says gold never carries text | Keep the rule (default), or allow `--hk-gold-bright` foil text on pine only — an explicit exception |
| D8 | Header logo on `/` | always shown | Tests expect the M56 handover | Restore the handover (hidden on the cover, revealed as it turns) |
| D9 | Punjabi | — | A Gurmukhi word (e.g. a greeting) would be the page's most specific mark | Only if a native speaker writes it; otherwise none |
| D10 | Dog-ear | — | New small feature (remembers last shelf, per device) | Include in N4, or drop |

**Answered at the N0 checkpoint (2026-09-23):**

- **D1, D1b, D2, D3, D5, D6 — accepted as proposed.** Every claim on `/`
  now matches something the product enforces.
- **D4 — yes:** the cover's second line is "Every listing here carries its
  maker's name."
- **D7 — keep the rule.** Cover titles stay on-pine text inside gold rules;
  gold carries no text anywhere, covers included.
- **D8 — restore the handover** (logo hidden on the cover, revealed as it
  turns; `presentation.spec.ts` "landing logo hands over").
- **D9 — no Gurmukhi** unless a native speaker supplies the words.
- **D10 — build the dog-ear** in N4.

## 13. Pre-existing defects found (fix inside the phase that touches them)

1. No h1 on `/`; logo-handover test failing (N1).
2. ISB raster unreadable on phones (N1). The "blank at 375px" seen in N0 was
   a full-page-screenshot artefact — the image loads and paints in the
   viewport (checked 2026-09-23).
3. Register `tablist` without panels/keys (N2).
4. `QuickEntryRow` ignores `detail` (N2).
5. CartBar overlaps the spread on phones (N1).
6. ✅ Unused fonts Instrument Serif, Kaushan Script — removed in N0.
7. Stray `framer-motion` dependency (separate change).
8. `split-food.jpg`, `split-gifts.jpg` (Pexels 8148149 / 7817374) and the
   unreferenced `hero-home-table*.png`, `hero-intro-background.png`,
   `hero-card-*` files are **not in `docs/IMAGE-LICENSES.md`** — log or delete
   before N1 ships (CLAUDE.md M56 rule).
9. CLAUDE.md is stale about `/`: the lockup `<h1>`/`#hk-hero-brand`, the
   split-screen-as-hero section, "eight routes" in `public-routes.ts` (it is
   ten). Rewrite those paragraphs in N5.
10. ✅ **`html, body { overflow-x: hidden }` made `body` a scroll container
    that never scrolls** (`styles/globals.css`, since the "UI WIP" commit).
    Every `animation-timeline: view()` bound to it and reported "finished"
    at scrollY 0, so no scroll-driven reveal could ever run — and every
    `position: sticky` under `body` had nothing to stick against. Fixed in
    N0 with `overflow-x: clip` (same containment, no scroll container);
    horizontal overflow re-measured at 0 on 1440 and 390. Sticky elements
    that never stuck now do: re-check `/checkout`, the portal `SaveBar`,
    `/gifts` and the admin/seller shells in the N5 sweep.
11. **Dialog scroll locks do not lock.** `MobileDrawer`, `ReelViewer`,
    `LocationPrompt` and `ProductGallery` set `body.style.overflow =
    "hidden"`, but because the root element's overflow is non-visible,
    `body`'s value is never propagated to the viewport: a mouse wheel
    scrolled 800px under the lock with the old rules and with the new ones
    (measured 2026-09-23). Not caused by item 10 and not fixed here — the
    fix belongs on `document.documentElement`, in one shared helper, as its
    own change.
12. The global `a:hover { color: var(--hk-gold) }` recolours every hovered
    link gold, which the notebook's links and buttons would inherit (gold
    never carries text). The notebook primitives restate their own colour on
    `:hover` at 0-2-0; any new link inside the notebook owes the same.

## 14. Docs upkeep (N5)

`DESIGN.md` (rewritten from the build by the documenter), `CLAUDE.md` (the
landing sections: split screen, lockup, header on `/`, rest of the landing
page, fonts wiring, motion), `docs/TESTING.md` (what a tester sees on `/`),
`docs/TESTS.md` (new spec), `docs/IMAGE-LICENSES.md`, `CHANGELOG.md` (one
entry), this file (mark phases done).

## 15. Risks

| Risk | Guard |
|---|---|
| Drifts into cute scrapbook (washi tape, doodles) | Marks only where they mean something (§4.4); two pencil notes per screen; no tape, no stickers, no doodles |
| Rules read as "broadsheet" AI tell | One pitch, faint pine, red margin, content sits on them; no column rules |
| Baseline grid breaks under real content | Heights snap to whole rules; `text-box` trim with fallback table; the specimen (N0) proves it before chapters are built |
| Cinematic layer janks or traps scroll | Scrubbed, transform-only, desktop-only, two pieces, perf trace in N4; drop a piece rather than ship jank |
| Firefox has no scroll timelines | Finished state is the default; only enhancement is lost |
| Shared `ProductCard` regresses elsewhere | Variant is additive CSS; `/gifts`, `/shop`, storefront screenshots in the N2 sweep |
| Mixed fonts across the site until rollout | Accepted for now (A3 scope is `/`); N6 decides |
| The owner judges fonts only when rendered | N0 specimen before any chapter is built |
