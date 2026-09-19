# Gifting rework: browse, taxonomy, listing flow, AI-ready (plan, 2026-09-15)

A redesign of the gifting side for both halves of the marketplace:
the **buyer's `/gifts` page** (categories, filters, clutter) and the
**HomeKrafter's listing flow** (one question at a time, each answer deciding
the next). It also lays the groundwork so **AI-assisted listing** (detect the
item from a photo and name, choose the category, prefill the form) can be
added later without a rewrite. **No AI is built in this plan.**

Status: **G0, G1 and G3's page + icons built 2026-09-16 (not yet deployed); G2, G4, G5 planned.** Milestones are at §9.
Clickable prototype of §5 and §7 (private artifact, live catalogue photos,
illustrative attributes): https://claude.ai/artifact/NwGCbL9JCBFnsDM5YTyCAF
Every item in §0 is a decision the owner confirms or overturns before G1
starts. Several of them reverse a rule written in `CLAUDE.md`, and each of
those is called out.

---

## 0. Decisions (owner answers 2026-09-16)

| # | Answer |
|---|---|
| D1 | **Confirmed.** Recipient and occasion are filters, not categories |
| D2 | **Confirmed.** Empty categories hidden on the buyer's gifts page; pickers still list them |
| D5 | **Confirmed, sequenced after G1.** The auto-reveal form is built on the new attribute data, not on today's fields |
| D7 | **Confirmed.** Iconify at build time (Lucide + Lab + two Hugeicons) for chips and filters; hand-drawn `CraftIcon` marks for department tiles |
| D10 | **Overturned: chocolates stay on the gifts side**, as a *Chocolates & edible gifts* department. That department **asks the food questions** (veg mark, allergens, shelf life, FSSAI). A courier may carry it **only when the maker marks it packed heat-safe**; otherwise it is local delivery only. This edits `courier-eligibility.ts`'s `kind === 'craft'` predicate and needs its own spec |
| D11 | **Confirmed, full scope in G4:** listing + product page entry + order line, with an **optional maker-set fee** added server-side (commission applies to it like any price) |
| D12 | **Confirmed.** The Hanken Grotesk font change ships before G3 |
| Top filters | **Gift finder sentence** |
| Grid | **4 across** on desktop |
| Re-filing live listings | **Applied directly by Claude** from a written mapping after a production backup, not through a bulk-approve screen. Each production run still needs a go-ahead in the turn it happens (deploy rule) |
| Sold-out Rakhi hampers | **Left listed, always sorted last** |
| Seller address (D13) | **City + state only** until counsel answers; no home address anywhere |
| First milestone | **G0 now** |

D3, D4, D6, D8, D9 were not contested and stand as written below.

**D3 note (2026-09-19):** a parent selection still matches its children and
itself — `expandShelfSelection` (`client/lib/category-sections.ts`) — and that
now holds on `/shop` as well as `/gifts`: a parent slug from the header
dropdown or a shared link used to filter on the parent alone and read as an
empty shelf on the food side. What changed is that the selection is a single
shelf, not a set (§5.1 item 9).

### Original proposals

| # | Proposed decision | Why | Reverses |
|---|---|---|---|
| D1 | **Two axes, not one list.** *What it is* (a department tree, 2 levels) is the category. *Who it's for* and *what it's for* (recipient, occasion) are **facets**, not shelves. | Today one rail mixes product type (Earrings), purpose (Festive Gifts, For Her) and technique (Crochet). Filters are OR inside a facet, so ticking "Earrings" and "For Her" returns every earring **plus** every for-her item. That is a union where the buyer wants an intersection. | M58's "Shop by recipient" subcategories |
| D2 | **Show only shelves that have something on them.** An empty department or subcategory is hidden on the buyer page; admin and seller pickers still list it. | Live: **18 of 26 category tiles are disabled** (69%). Dimmed tiles made sense with a full catalogue. With 86 gifts they are most of the control. | M56/M59b "zero-count dimmed, never hidden" (buyer side only) |
| D3 | **A parent shelf is selectable and matches its children and itself.** | Live: **30 jewellery + 11 candle listings (48% of the catalogue) sit directly on a parent shelf**, and a parent renders as a heading with no chip and no checkbox. No category filter can reach them. CLAUDE.md M58 already says "a parent is browsable". The browse page does not do it. | None (this fixes a bug) |
| D4 | **Attributes are data, defined per category, stored in rows.** New `AttributeDefinition` / `AttributeOption` / `CategoryAttribute` / `ProductAttributeValue`. The listing form, the filters, the product page specs and the future AI all read the same definitions. | Today "what the form asks" is a hardcoded slug map in `client/lib/sell/listing-families.ts`. It already disagrees with the database: `handmade-jewellery`, `candles-home`, `self-care`, `personalised-gifts`, `home-decor-2` are unmapped, so 30 bangles were listed on the generic question set. The server knows nothing of families, so it cannot validate them, and a model cannot be grounded on them. | None (replaces `listing-families.ts`) |
| D5 | **One listing engine replaces both forms, and it reveals itself as you answer** (owner, 2026-09-15). One page, one question showing; a valid answer makes the next question appear beneath it and scroll into view. Earlier answers stay on the page, editable where they are. Change an answer that decides the branch and the questions that no longer apply fold away while the new ones appear. **Editing an existing listing is the same page with every applicable question already revealed.** | Two forms (1,058 + 911 lines) must be kept in step by hand today. The guided flow's step 4 alone holds ~10 questions, so it is not one-at-a-time either. Auto-reveal keeps the focus of one-question-at-a-time without its known costs (NN/g: wizards frustrate repeat use and comparing answers), because nothing answered ever leaves the screen. Admin create/edit reuse the long form, so they move with it. | M45's "two forms, one set of values" (becomes one form) |
| D6 | **Drafts are saved on the server** (`ListingDraft`). | Autosave and resume across phone and laptop. It is also the object an AI suggestion attaches to later (§8), so it has to exist before the AI does. | None |
| D7 | **Icons: Iconify at build time only** (Lucide + Lucide Lab + two Hugeicons, SVG bodies committed, one server-rendered `<Icon>`), for subcategory chips and filters. Department tiles keep the hand-drawn two-tone `CraftIcon` marks, extended. Icon id stored on `Category.icon`, picked by an admin. Emoji leave the browse pages. `lucide-react` stays for chrome. | `lib/category-emoji.ts` has no entry for most subcategories, so **17 of 26 tiles show the same 🧺 basket**. The Iconify React component fetches from a third-party API at runtime, which the project forbids. Detail at §6. | CLAUDE.md "Stack: lucide-react" (adds a committed icon registry beside it) |
| D8 | **No location prompt on `/gifts` or a gift product page.** | The first visit to `/gifts` opens a modal saying "Discover home kitchens cooking near you… only show food". 79 of 86 gifts ship nationwide. Ask for location only when the buyer turns on a local delivery filter, or at checkout. | None |
| D9 | **"Recommended" becomes the default sort**: in stock first, then matches an occasion coming up, then reviewed, then newest. "Most loved" returns once enough listings have reviews. | 0 of 86 gifts have a review, so "Most loved" sorts arbitrarily. The first row at 1440px is six **Sold out** Rakhi hampers for a festival 18 days in the past. | None |
| D10 | **Edible gifts (chocolates): owner call.** | 14 chocolate listings are filed as `craft` under "Handmade Gifts". Moving them to `food` would take them off sale while `foodOrdersOpen` is off, and a courier never carries food (`courier-eligibility.ts`). Options in §3.4. | Possibly the courier gifts-only rule |
| D11 | **Personalisation becomes a first-class listing fact** (`isPersonalisable`, what can be personalised, character limit, optional fee). Buyer entry at checkout is **G4, a separate go/no-go**. | Etsy, NOTHS and FNP all lead gifting with "personalised". Here it exists only as a shelf name, so a listing cannot say "add a name" and an order cannot carry the name. | None |
| D12 | **Ship DESIGN.md typography phase 1 before G3**, or explicitly defer it. | DESIGN.md says Hanken Grotesk replaces IBM Plex Sans. The live page still renders Plex Sans on 799 of 988 sampled nodes. Redesigning a page on a font that is about to change means doing the spacing twice. | None |
| D13 | **Compliance fields go on every gift listing; the seller's address question goes to counsel.** G1 adds net quantity, generic name, country of origin. | The E-Commerce Rules ask a marketplace to show a seller's geographic address; M36b keeps the pickup (home) address private. Both cannot be read naively at once. §3.6 | None yet |

---

## 1. Audit: what is wrong today (measured 2026-09-15)

Live data from `GET /api/v1/products?kind=craft` and `/categories`
(86 gifts, 9 makers, 31 craft categories). Screenshots from production at
1440×900 and 390×844.

### 1.1 Buyer page, `/gifts`

**Scores (design-review rubric):** Design **C−**, AI-slop **B** (the emoji
tile faces are the only tell). Mode: *Operate* (browse) under a small
*Persuade* hero.

| # | Finding | Impact | Evidence |
|---|---|---|---|
| B1 | 48% of the catalogue is unreachable by category filter (listings on a parent shelf, parent has no chip or checkbox) | High | Handmade Jewellery 30, Candles & Home 11. Sheet screenshot: parents are grey headings |
| B2 | 18 of 26 category tiles disabled | High | All five jewellery children, all six recipient children, Flowers, Festive Gifts, Scented Candles, Ceramics, Textiles, Wall Art |
| B3 | Duplicate shelf: "Home Décor" (`home-decor`, top level, 3) and "Home Decor" (`home-decor-2`, under Candles & Home, 1) | High | Both render side by side in the rail |
| B4 | Three dimensions and a catch-all in one rail: type, recipient, technique, plus "Handmade Gifts" (15, on a page where everything is a handmade gift) | High | Rail order: Crochet · Handmade Gifts · Home Décor · Self-Care · Home Decor · Paintings… |
| B5 | Miscategorised listings | High | Rakhi hampers under *Personalised Gifts*; crochet kitty and teddy under *Custom Prints*; scrunchies and hair pins under *Jewellery*; pooja asans and tilak thalis under *Home Décor*; 0 of 86 marked `isHamper`, ≥7 are hampers |
| B6 | Sort is arbitrary and puts sold-out stock first | High | 0 reviews; first 6 cards at 1440 are Sold out |
| B7 | Card meta line "Authentic · 2kg" | Medium | "Authentic" is fallback copy nothing records (`ProductCard.tsx` ~l.248), the claim shape the 2026-09-14 trust sweep removed elsewhere. 65 of 86 size labels are "One"/"one", which says nothing. Colour is glued into the size label ("one · Mint, Silver"), so it cannot be filtered |
| B8 | Location modal blocks first visit, with food copy | High | Screenshot `gifts-desk-fold.png` |
| B9 | Past festival treated like an upcoming one | Medium | Occasion filter lists Raksha Bandhan (28 Aug, 13 listings) beside Karwa Chauth (29 Oct) and Diwali (8 Nov) with no dates |
| B10 | Missing the filters gift buyers use | Medium | No recipient, personalisable, ready-to-ship vs made-to-order, dispatch time, colour or material. Price is a linear slider from ₹10 to ₹9,600 where the median is ₹250 and p75 ₹600, so the useful range is the first 6% of the track |
| B11 | Desktop "All filters" is a 1,400px-wide bottom sheet | Medium | A count sits ~1,380px from its label |
| B12 | "Picks" facet is nearly empty | Polish | "New" (4) and "On sale" (0) |
| B13 | Hero spends height on nothing | Medium | ~150px empty band between the counts and the control card; first product at y=746 on a 900px screen. Phone: counts wrap to two mono lines |
| B14 | Touch targets | Medium | Wishlist heart 28–30px; sort select 38px tall |
| B15 | Silent truncation at 100 gifts | High (soon) | `getCraftProducts` asks for `pageSize: 100`. At 101 live gifts the newest disappear with no error, the exact failure `/shop` hit at 113 food listings |

### 1.2 Listing side (HomeKrafter + admin)

| # | Finding |
|---|---|
| S1 | Two forms (`GuidedListingForm.tsx` 1,058 lines, `ListingForm.tsx` 911) plus admin create/edit on the long form. Every new question is written twice |
| S2 | "What to ask" lives in a client-only slug map that has drifted from the database (D4). The server cannot enforce it |
| S3 | The guided flow is 4 steps; step 4 carries ~10 questions. Not one-at-a-time, and the hardest questions are last |
| S4 | No structured attributes. `material`, `dimensions`, `careInstructions` are free text, so nothing is filterable |
| S5 | No made-to-order vs ready-to-ship and no dispatch days for gifts (`prepTimeMins` is minutes and food-shaped) |
| S6 | No personalisation fields anywhere: listing, cart, order |
| S7 | No parcel weight. Shadowfax's `actual_weight` is never sent, so courier pricing is guessed |
| S8 | Colour is merged into the variant label. Multi-axis variants are already ranked backlog (`docs/SHOPIFY-PARITY.md` P2.3); this plan does **not** do variants. It makes colour a descriptive, filterable attribute and leaves the buyable-option question to P2.3 |

---

## 2. Research summary

### 2.1 Categories and filters

| Source | What it teaches |
|---|---|
| **Etsy** | Departments by product type; attributes on the listing, extra ones per category (a necklace gets chain style). **A listing whose seller left an attribute blank drops out of that filter**. Filters include ready to ship / arrival, Personalisable, colour, holiday, shop location. Gift Mode (2024) asks recipient, occasion, interests |
| **Not On The High Street** | Departments by type; separate browse by occasion (25+), recipient (16), personality. First pills: Estimated delivery, Delivery cost, Price, **Personalisable**. Category-only facets from its page source: Burn time, Scent, Birthstone, Earring backing, Necklace clasp, Chain length, Art style, Frame style, Skin type |
| **Amazon Handmade** | "Customizable" is a filter, not a category; personalisation is configured on the listing |
| **FNP** | Occasions **shown with dates** ("Diwali – 8th Nov", "Karwa Chauth – 29th Oct"); price bands; recipient and persona routes; crochet flowers under Flowers |
| **IGP / Archies** | Recipient, relationship, festival, occasion routes; price *shelves* ("Under ₹999") |
| **Okhai / Zwende / iTokri / Jaypore** | Product type × **craft or artform** (Ajrakh, Mirror work, Madhubani, Lippan, Crochet). Zwende and FNP disagree on Navratri's date, which is why festival dates are set by a person |
| **Shopify Standard Product Taxonomy** | Categories are strictly product types; **no occasion or recipient attribute on product categories**. Per-category attributes, e.g. Candles: type, material, container, fragrance level, scent; Earrings: closure, material, metal purity; Paintings: medium, original vs reproduction, frame; Bar soap: skin type, method, ingredients |
| **Google Product Taxonomy** | A tree with global attributes only. A mapping target, not a model |
| **Baymard** | 5 essential filters (price, rating, colour, size, brand), then category-specific ones. **Thematic filters** (occasion, style) missing on 20% of sites that need them. **Over-categorisation**: a category of ~10–30 items should be a filter, and a link to it should open a prefiltered list. "Sale" and price shelves should be filters, never categories. Promote a few filters above the list; toolbars hold ~6–8; "All filters" buttons get overlooked |
| **NN/g** | Filters appropriate, predictable, jargon-free, general first then specific; customising per product type pays off |

**What this changes in the plan:** the department tree is product type only;
occasion, recipient, personalisable and craft are facets; price is bands,
never shelves; a department's own facets appear only inside it; and an
attribute the form does not ask cannot be a filter.

### 2.2 Listing flows

| Platform | Order | What AI prefills | How the seller confirms | Published result |
|---|---|---|---|---|
| eBay "magical listing" | photo → match + category → item specifics → price, shipping | title, category, specifics, description, price | reviews on task-focused pages | >95% of sellers who tried AI descriptions kept the text; UK test halved listing steps |
| Amazon | a few words, an image or a URL | title, bullets, description, attributes | accept / edit / decline each | ~90% accepted with little or no editing (2025) |
| Etsy | photos → title → category (search) → category attributes → description → price, qty, personalisation → shipping | attribute suggestions from category + photo | seller applies | none |
| Shopify Magic | name, description, images → category → attributes | category + attributes | purple until accepted, **but unedited suggestions confirm on save** | 85% accept predicted category |
| Mercari | photo → **seller picks category (with a suggestion)** → AI fills the rest | name, description, condition, price | category is deliberately the person's call | toy car read as real car |
| Poshmark Smart List | photos → generate → review → seller sets price | type, brand, size, colour, title, description | fix a field, then **Regenerate** prose from fields | 48% less listing time (own figure) |
| Facebook Marketplace | photos → "Create listing details" | title, category, attributes, price, description | all editable | independent test: picked up a background coaster |
| Meesho | category first → template per category | none first-party; ran a visual-taxonomy challenge because supplier attributes are "incorrect or incomplete" | | |
| Swiggy / Zomato | photo checks; menu photo → OCR → dishes | photo quality; whole menu | | Zomato section detection mAP 0.93 |

### 2.3 One question at a time

- **GOV.UK "one thing per page"**: easier for low-confidence users and
  phones; better for errors, branching and saving progress. "One thing" can
  be a tight group. It must not hide that there are too many questions.
  (GDS has published no numbers behind it.)
- **GOV.UK "check answers"**: a Change link returns to the summary *after*
  asking any questions the new answer triggered. §7.3's fold-away/reveal on a
  branch change is the same rule on one page.
- **NN/g on wizards**: good for occasional, unfamiliar tasks; "annoying and
  overly controlling" when repeated and weak when comparing answers. Show
  steps, allow going back, save state, end on a summary.
- **NN/g on progressive disclosure**: no more than two levels.
- **Baymard**: the number of fields, not steps, drives completion.
- **Kim et al., CHI 2019**: conversational surveys reduced lazy answers
  (quality, not speed). Typeform's 47% completion figure is the vendor's own
  and unverified.
- **Branching as data**: JSON Forms rules, SurveyJS `visibleIf` with a server
  validator on the same definition, JSON Schema `if/then`, JsonLogic,
  Shopify's versioned taxonomy. Our version: a pure graph in `client/lib`
  (the app gets it free) and the server re-deriving visibility from the
  submitted answers.

**What this changes in the plan:** repeat makers are this platform's normal
case (a maker lists 12–34 items), which is exactly where a strict wizard
hurts. Hence auto-reveal on one page (D5), a Duplicate action, and edit as
the same page fully revealed.

---

## 3. Target taxonomy (gifts)

### 3.1 Departments and subcategories

Sized for ~90 gifts growing to a few thousand. Top level is **what the
thing is**. Nothing on this list is a recipient, occasion, price band or
"handmade" (everything here is handmade).

| Department | Subcategories | Live listings that land here today |
|---|---|---|
| **Jewellery & Accessories** | Bangles & kadas · Earrings · Necklaces & sets · Bracelets & anklets · Rings · Hair accessories · Potlis & pouches | 34: every bangle and kada, Kundan earrings, necklace set, name bracelets, adjustable rings, scrunchies, headbands, hair pins, potlis |
| **Candles & Lighting** | Scented jar candles · Shaped & festive candles · Diyas & tealights · Holders & lanterns | 10: chai latte, soywax decorative, urli, modak, ladoo, Lakshmi charan, floating, terracotta candles |
| **Wall Art** | Original paintings · Miniatures · Prints & posters · Custom portraits | 12 Rangkathaa paintings and miniatures |
| **Home Décor** | Resin art · Showpieces & figurines · Vases & planters · Torans & wall hangings · **Pooja & festive décor** (thalis, asans, shagun envelopes, chunri) | 7: resin art, tilak thali/plate, pooja asans, shagun envelope and pouch, Radha chunri |
| **Bath & Self-care** | Face care · Hair care · Soaps & bath · Balms & oils | 6 AYUNIC listings |
| **Kids & Soft Toys** | Amigurumi & soft toys · Baby keepsakes · Kids' room décor | 2: crochet kitty collection, Mr. Bean teddy |
| **Flowers & Plants** | Crochet & forever flowers · Dried & preserved · Plants | 2: lily bouquet crochet, flower wax bouquets |
| **Hampers & Gift Sets** | Festive hampers · Self-care sets · Mixed | 7 Homekrafted hampers (currently sold out), and `isHamper` set on each |
| Food Gifts | Chocolates · Cookies & tins · Mithai · Pickles | 14 chocolate listings, **pending D10** |
| Kitchen & Dining | Mugs · Serveware · Trays & coasters | 0; seeded, hidden until it has supply |

Rules for growing it (Baymard):

- A subcategory with **fewer than ~15 listings** still exists for the maker
  and the admin, but the buyer meets it as a **prefiltered chip**, not a page.
- A subcategory past **~30 listings** is a candidate to become a department.
- A department with nothing live is not rendered (D2). Kitchen & Dining and a
  future Stationery & Cards are seeded ahead of supply and appear on their own.
- **Names are compared with case and accents folded** before a shelf is
  created (`Home Décor` = `Home Decor`), and a seed treats a same-named shelf
  anywhere on its side of the catalogue as already there. The row ids show
  the order: `seed-client-categories.ts` created top-level "Home Décor"
  first; `seed-craft-subcategories.ts` later created "Home Decor" under
  Candles & Home, because its check looked only under the same parent (and
  `mode: 'insensitive'` does not fold accents anyway); slugify stripped the
  accent and `freeSlug` suffixed `-2`. **Done in G0:**
  `server/src/common/fold-name.ts`, used by the admin create/rename route,
  occasion create, both suggestion paths and all three category seeds. The
  existing duplicate rows are merged in the data pass.

Where today's shelves go: **Handmade Gifts** is deleted (everything here is
handmade). **Festive Gifts** becomes the occasion facet. **Shop by
recipient** becomes the recipient facet. **Crochet, Ceramics, Textiles**
become craft/material facet values surfaced as prefiltered chips.
**Personalised Gifts** (Engraved, Name & Initial) becomes the Personalisable
facet; **Custom Prints** becomes Wall Art › Custom portraits. **Home Décor /
Home Decor** merge.

### 3.2 Facets (orthogonal to departments)

| Facet | Values | Where it lives | Source column |
|---|---|---|---|
| **Occasion** | Dated (admin-set each year): Karwa Chauth, Diwali, Bhai Dooj, Navratri, Lohri, Holi, Raksha Bandhan, Eid, Christmas, Mother's/Father's/Teacher's/Valentine's Day. Evergreen: Birthday, Anniversary, Wedding, Housewarming, New baby, Thank you, Get well, Corporate | **Top bar.** A dated occasion shows its date, sorts nearest first, and appears only from ~6 weeks before to the day itself | `Occasion` (exists) |
| **Recipient** | Her, Him, Couple, Parents, Kids, Baby, Friend, Colleague, Teacher, Sibling, Grandparents, Host | **Top bar** | global `recipient` attribute (multi) |
| **Price** | Under ₹250 · ₹250–499 · ₹500–999 · ₹1,000–2,499 · ₹2,500+ · custom | **Top bar** | price. Bands fit this catalogue (median ₹250, p75 ₹600); FNP's "Below ₹500" band would hold ~70% of it. Revisit at ~500 gifts |
| **Dispatch** | Ready to ship · Made to order (≤7 days / longer) | **Top bar** | `fulfilment` + `prepTimeMins`. "Arrives by ‹date›" waits until courier transit times are known; promising a date we cannot compute is a claim |
| **Personalisable** | yes; type (name/initials, date, photo, message, engraving) in All filters | **Top bar toggle** | `isPersonalisable` |
| Department's own facet | Jewellery → Metal/base · Candles → Scent family · Wall Art → Original or print · Self-care → Skin type | **Top bar, only inside that department** | category attributes |
| Material | closed list per department | All filters | attribute |
| Colour | swatches | All filters; promoted in Jewellery and Home Décor | attribute (moved out of the size label) |
| Craft / artform | Crochet, Macramé, Mirror work, Kundan, Block print, Madhubani, Lippan, Resin, Pottery, Embroidery… | All filters + prefiltered chips for the common ones | global `craft` attribute |
| Rating | 4★ & up | All filters, **hidden until most listings have reviews** | reviews |
| Maker location | city | All filters, hidden until ≥2 cities have real counts | `Vendor.location` |

**Removed:** the Local/National delivery facet on `/gifts`. Every gift is
`national` since 2026-09-15, so it filters nothing. Also no "eco-friendly",
"hypoallergenic", "pure veg" or "Jain" filter unless it reads a
maker-declared, labelled value (the 2026-09-14 trust rule).

**Top bar on desktop:** the gift finder sentence *is* the first three pills
("A gift for [anyone] for [any occasion] under [any budget]"), followed by
Dispatch · Personalisable · the department's facet · All filters · Sort. One
control per facet, never a finder plus a duplicate pill. On a phone: the
sentence wraps above a scrolling pill row.

### 3.3 Attribute sets per department

**Asked of every gift:** department + subcategory · recipients · occasions ·
craft · colours · material · dimensions · care · personalisable (what, limit,
fee) · ready to ship or made to order (+ days) · packed weight · plus the
compliance fields in 3.6.

| Department | Asked (★ = required, ⚑ = `trustSensitive`, never suggested) | Filters shown inside it |
|---|---|---|
| Jewellery & Accessories | ★ type · ★ metal or base (brass, copper, oxidised, gold-plated, alloy, thread/fabric, beads, terracotta, resin; **925 silver ⚑**) · stone or embellishment (none, kundan, pearl, mirror, CZ, semi-precious) · earring closure (hook, stud, clip-on, leverback, hoop) · necklace length · ring/bangle size or adjustable · nickel-free ⚑ (maker's own claim, labelled) | Type, Metal, Stone, Closure, Adjustable, Colour |
| Candles & Lighting | ★ candle type (jar, pillar, shaped, tealight, floating) · ★ wax (soy, beeswax, coconut blend, paraffin, gel) · scent family (floral, woody, citrus, fresh, gourmand, spicy, unscented) + notes · burn time (hours) · vessel (glass, ceramic, tin, terracotta, concrete) · net weight | Scent family, Wax, Burn time (<20 / 20–40 / 40+ h), Vessel |
| Wall Art | ★ medium (acrylic, oil, watercolour, gouache, mixed, digital) · ★ original / limited print / open print · ★ size (cm) · framed / unframed / ready to hang · artform (Madhubani, Pichwai, Gond, Warli, Lippan, contemporary) · subject | Medium, Original vs print, Size band, Framed, Artform |
| Home Décor | ★ dimensions · ★ material · technique · room · indoor/outdoor | Material, Technique, Colour |
| Bath & Self-care | ★ form · ★ key ingredients · ★ allergens with "None of these" ⚑ · skin type · scent or unscented · method (cold process, melt & pour) · vegan ⚑ · net weight/volume · shelf life ⚑ | Form, Skin type, Scent |
| Kids & Soft Toys | ★ age suitability ⚑ · ★ material and fill · size · washable · small-parts warning ⚑ | Age, Material |
| Flowers & Plants | ★ type (crochet, wax, dried, preserved, plant) · stem count · vase included · care | Type, Colour |
| Hampers & Gift Sets | ★ contents with quantities (any food item triggers the food questions) · packaging · customisable contents | Contents type |
| Food Gifts (if D10 = 2) | the existing food rules: veg mark via `dietOf` ⚑, allergens ⚑, shelf life ⚑, storage, ingredients, FSSAI ⚑ | Diet, Shelf life, Pack size |

These are **seed data for `CategoryAttribute`, not code**: an admin adds
"Burn time" to a new subcategory without a deploy.

### 3.6 Compliance fields (flag for counsel before G1 ships)

Not legal advice; the research summary is in §2.1's sources.

- **Consumer Protection (E-Commerce) Rules 2020, r.5(3)(a) and r.6:** the
  marketplace shows each seller's name, **geographic address**, customer care
  number and rating; sellers provide total price with breakup, return and
  refund terms, and "all relevant details… including country of origin".
- **Legal Metrology (Packaged Commodities) Rules 2011, r.6(10):** an
  e-commerce entity displays the label declarations online (maker/packer
  name and address, generic name, net quantity, MRP inclusive of taxes, unit
  sale price, best-before where applicable, consumer care), month/year of
  manufacture excepted per the 2017 amendment (one firm lists it; verify
  against the Gazette). **No handicraft exemption found.** Loose goods
  ordered online (clause (g), from 1 Jan 2024) still need name and address,
  consumer care, price and net quantity.
- **So G1 adds** `netQuantity` + unit, a "generic name" (derivable from the
  subcategory), `countryOfOrigin` (default India), and uses the existing
  `madeIn`.
- **Open conflict (D13):** "geographic address" collides with the private
  pickup address (M36b). Whether a city and state, or a separate
  communication address the maker chooses to publish, satisfies the rule is
  a question for counsel. **Nothing in this plan publishes a pickup address.**
- **Also for counsel:** cosmetics rules for handmade soap and skin care, BIS
  toy-safety for handmade soft toys, FSSAI's remaining-shelf-life directive
  for food gifts posted nationally.

### 3.4 Edible gifts (D10), three options

1. **Keep as craft, own department "Chocolates & edible gifts"** on `/gifts`.
   Cheapest. Contradicts the food/craft split, and a courier would carry
   chocolate, which the gifts-only rule was written to stop.
2. **Move to `food` + `shippingScope: national`**, and surface on `/gifts`
   through an "Edible gifts" cross-link band. Honest to the model. Takes
   14 listings off sale until `foodOrdersOpen` is switched back on.
3. **New `ProductKind` value `edible_gift`.** Browses with gifts, carries
   food fields (ingredients, allergens, shelf life, veg mark), has its own
   courier rule. The most correct and the most work: every `kind === 'craft'`
   and `kind === 'food'` branch in the tree needs reading.

Recommendation: **2 now, 3 if edible gifts become a real share of GMV.**

### 3.5 Migrating the live catalogue

- **Nothing is re-filed automatically.** A script produces a proposal
  (`server/prisma/propose-recategorisation.ts` → CSV: listing, current
  shelf, proposed department/subcategory, reason). An admin approves rows in
  a bulk "Recategorise" screen. Same principle as M36: a guess written onto a
  real storefront looks authoritative.
- **Merges keep old URLs working.** `Category.mergedIntoId`; browse reads a
  merged slug as its target and the page 301s. A rename still never
  re-derives a slug (M58).
- **Recipient subcategories become recipient facet values.** Listings on
  `for-her` etc. get the matching `recipient` attribute; the shelves are
  archived, not deleted.
- **Moving a listing between departments by an admin does not re-queue it**
  (M44: an admin edit never re-queues). A HomeKrafter changing department
  does (M22: category is material).

---

## 4. Data model

All additive. Names are proposals; `docs/DATA-MODEL.md` gets the final
shapes in G1.

```prisma
model Category {
  // existing: id slug name imageSrc group parentId sortOrder …
  icon          String?   // committed icon id, e.g. "ph:earring-duotone" (§6)
  description   String?   // one buyer-facing sentence; also grounds the AI (§8)
  synonyms      String[]  // "achaar", "kada", "diya": search + keyword suggester
  archivedAt    DateTime? // hidden from pickers and browse; links still resolve
  mergedIntoId  String?   // a merged shelf redirects here
  attributes    CategoryAttribute[]
}

enum AttributeKind { single multi text number boolean dimensions }

model AttributeDefinition {
  id            String  @id @default(cuid())
  key           String  @unique   // "metal", "scent_family", "recipient"
  label         String            // "Metal or base"
  helpText      String?
  kind          AttributeKind
  unit          String?           // "cm", "g", "hours"
  filterable    Boolean @default(false)
  /// Never prefilled by a suggestion, only ever answered by a person:
  /// allergens, "hypoallergenic", "organic", "vegan", licences. See §8.
  trustSensitive Boolean @default(false)
  /// Changing this answer re-queues a live listing (M22 "material change").
  material      Boolean @default(false)
  options       AttributeOption[]
  categories    CategoryAttribute[]
}

model AttributeOption {
  id           String @id @default(cuid())
  attributeId  String
  value        String            // stable machine value, never renamed
  label        String            // renameable
  synonyms     String[]
  hex          String?           // colour swatches
  sortOrder    Int    @default(0)
  @@unique([attributeId, value])
}

enum AttributeRequirement { required encouraged optional }

model CategoryAttribute {
  categoryId   String
  attributeId  String
  requirement  AttributeRequirement
  sortOrder    Int @default(0)
  /// Children inherit a parent's attributes unless they override.
  @@id([categoryId, attributeId])
}

model ProductAttributeValue {
  id           String  @id @default(cuid())
  productId    String
  attributeId  String
  optionId     String? // single/multi (one row per chosen option)
  text         String?
  number       Decimal?
  @@index([attributeId, optionId])  // facet counts
  @@index([productId])
}

model Product {
  // new, gifts first but not gift-only
  fulfilment              Fulfilment?  // ready_to_ship | made_to_order; NULL = not stated
  // "How many days to make it" is NOT a new column: it is the existing
  // per-listing `prepTimeMins` (2026-09-05), asked in days for a gift and
  // stored in minutes. A second lead-time column would be a second source
  // of truth for the Pre-order badge. The DTO's @Max(43200) (30 days)
  // rises to cover a commissioned painting.
  isPersonalisable        Boolean @default(false)
  personalisationPrompt   String?      // "Name to engrave"
  personalisationMaxChars Int?
  personalisationFee      Decimal? @db.Decimal(10, 2)
  packedWeightGrams       Int?         // courier (S7)
}

model ListingDraft {
  id             String   @id @default(cuid())
  sellerId       String
  productId      String?  // set when editing an existing listing
  schemaVersion  Int
  answers        Json     // the flow's values, keyed by question id
  fieldMeta      Json     // per-field provenance, see §8
  updatedAt      DateTime @updatedAt
}
```

Why rows and not a JSONB `attributes` column: facet counts are a
`GROUP BY optionId`, an option label can be renamed without rewriting every
listing, and "did this edit change a material attribute" is a set comparison,
the same shape M58 uses for shelves. Rule carried from M15: **counts are
computed from rows, never incremented.**

Rules that ride on this model:

- **Absence is not an answer** (the diet-mark and pre-order rules). A listing
  that never answered "metal" matches no metal filter. A facet is offered
  only when **at least half** of the listings in view have answered it, and
  the sheet says how many have not ("12 listings haven't said").
- **The server is the authority**; the client mirrors it looser (the
  identifier-parser direction). `SellerListingsService` stays the one owner
  of product writes (M44) and validates attribute values against the
  category's definitions.
- **`CategoryAttribute` is admin-only**, pinned by a structural spec the way
  `category-admin-only.spec.ts` pins category creation.

---

## 5. Buyer page redesign, `/gifts`

### 5.1 Structure, top to bottom

1. **Compact title band.** Breadcrumb, "Handcrafted *gifts*", one line of
   real counts. No empty photo wash; the band is ≤180px on desktop. The
   photograph moves into the department tiles, where it carries information.
2. **Gift finder sentence.** "A gift for **[anyone ▾]** for **[any occasion ▾]**
   under **[any budget ▾]**". These three selects **are** the recipient,
   occasion and price controls (§3.2): there is no second pill for any of
   them. Occasions list upcoming dated ones first with their date. On a
   phone it wraps to three lines and stays native selects (no custom
   listbox).
3. **Departments.** 8–9 tiles, only departments with a live listing (D2).
   Face = a real listing photograph chosen server-side (the highest-ranked
   in-stock listing in that department, never a stock or generated image),
   with the department icon in a small corner badge. Choosing a department
   opens a row of its non-empty subcategory chips and adds that department's
   filterable attributes to the toolbar. The buyer side discloses
   progressively too: nobody sees "Metal" until they are looking at jewellery.
4. **Coming up.** A strip of dated occasions within the next ~45 days, with
   "in 14 days" computed server-side from `lib/occasions.ts` (clock passed in,
   the M12 rule; the page is already `force-dynamic`). Past festivals drop off
   until an admin rolls the date forward.
5. **Sticky toolbar.** Result count · Dispatch · Personalisable (toggle) ·
   the department's own facet · All filters · Sort. When it sticks, the
   finder sentence collapses into three compact pills at its start. Becomes a
   translucent bar with a scroll-edge fade once it sticks, with a solid
   fallback under `prefers-reduced-transparency`.
6. **Applied filters** as removable chips, "Clear all" at two or more.
7. **Grid.** **4 across at 1440** (was 6: at 1352px of container that is
   ~210px cards, too small to judge a handmade object), 3 at tablet, 2 on a
   phone. Page size stays 24, which divides by 4, 3 and 2.
8. **Card.** Photo 4:5 · maker portrait chip + name + city (DESIGN.md
   provenance rule) · name · price · **one fact line from real columns**:
   "Ready to ship · dispatched in 2 days", "Made to order · 7 days",
   "Personalisable". No "Authentic", no "One". Sold out sorts last and says
   so.
9. **All filters.** Right-side drawer, 420px, from 900px up; bottom sheet
   under 900. Sections: ~~Department (tree, parent selectable)~~
   **(superseded 2026-09-19 — see below)**, Occasion,
   Recipient, Price (band chips + custom range), Delivery & dispatch,
   Personalisable, department attributes, Rating (only once reviews exist).
   Live "Show N gifts" button.

   **Superseded 2026-09-19 (owner: "pressing on a category should change
   the category, not add them").** The department is a **single-select
   scope in the department row**, not a checkbox group in this sheet: the
   sheet no longer has a Category group at all, and there is exactly one
   place a shelf is chosen. Pressing a department selects it and reveals its
   subcategory row (derived from the selection, so a shared
   `/gifts?category=earrings` link reopens the right row); pressing a
   subcategory replaces the department selection; the first chip in that row,
   "All {department}", is the parent selection and **All gifts** leaves the
   shelf. The category is not a removable chip either, and "Clear all" counts
   and clears refinements only.

### 5.2 What is removed

Emoji tile faces · the dead photo band in the hero · zero-count tiles ·
"Handmade Gifts" and "Festive Gifts" shelves (a catch-all and an occasion) ·
recipient shelves as categories · the "Picks" facet (its one real value,
"New", becomes a sort) · "Authentic" · "One" size labels · the location modal
on this page · "Most loved" while no reviews exist.

### 5.3 Motion (Emil / Apple rules, CSS only, no framer-motion)

| Element | Treatment | Why |
|---|---|---|
| Tile, chip, pill press | `scale(.97)`, 100ms ease-out on `:active` | Feedback on press, not release |
| Filter drawer (≥900) | slide from right, 240ms `cubic-bezier(.32,.72,0,1)`, exits the way it came | Spatial consistency |
| Bottom sheet (<900) | `translateY(100%)` → 0, same curve | Same |
| Pill popovers | `scale(.96)`+fade → 1, 150ms, `transform-origin` at the pill | Popovers grow from their trigger |
| Subcategory row appearing | `@starting-style` fade + 4px rise, 180ms | No mount-effect state |
| Grid after a filter change | **no stagger**, 120ms crossfade | Filtering happens dozens of times a session; a cascade makes it feel slow |
| Sticky toolbar | shadow and fade appear via scroll state, no layout change | No CLS |
| Everything | inside the global reduced-motion floor; drawer becomes a fade | M34 |

### 5.4 Server work the page needs

- **Filtering and facet counts move server-side** before the catalogue
  reaches the fetch ceiling (B15): `GET /products?kind=craft&department=…&attr[metal]=brass&recipient=…&fulfilment=…`
  plus `GET /catalog/facets?kind=craft&…` returning counts for the current
  selection. Until then G0 raises `pageSize` to the server's 500, the same
  stopgap `/shop` took.
- `GET /catalog/departments?kind=craft` returns each non-empty department
  with its tile photo, icon, count and non-empty children.

---

## 6. Icons

**Recommendation: Iconify as a build-time catalogue, never as a runtime
component.** Two icon vocabularies, one per level, never in the same row.

| Level | Set | Why |
|---|---|---|
| **Department tiles** (8–9) | the existing hand-drawn two-tone pine + gold marks in `components/ui/icons/CraftIcon.tsx` (M33), extended with the departments it lacks (self-care, crochet & soft toys, pooja & festive, home décor, textiles, bracelet) | M33's reasoning still holds: a tile is the shopfront, and a UI-chrome line icon at 40px reads as a button, not an offer. It already has Diwali and Rakhi marks, which **no icon set has** |
| **Subcategory chips, filter rows, attribute options** | monoline icons from `lucide` + `lucide-lab` (ISC), plus `hugeicons:ear-rings-01` and `hugeicons:necklace` (MIT), normalised to one 1.5px stroke | Lucide + Lab covers 16 of 21 craft concepts (yarn ball, candle holder, gem ring, amphora, soap bar, flower, jar, cookie…). Phosphor misses exactly the craft shelves (candle, jewellery, ceramics). Every set here is ISC or MIT, so no attribution is owed |
| **UI chrome** (search, cart, chevrons) | `lucide-react`, unchanged | 97 files already use it; migrating buys nothing, and the chip set shares its grid |

**Why not the Iconify React component.** `@iconify/react` fetches icon data
from `api.iconify.design` at runtime by default, is `"use client"`, and
renders an empty span until mount unless the data is preloaded. The first two
break the project rule that nothing reaches a third-party host at request
time (`images.remotePatterns` is empty on purpose); the third is a visible pop.
`unplugin-icons` needs webpack, and Next 16 builds with Turbopack.

**Pipeline** (the `build-chef-avatars.mjs` stance: output committed, nothing
fetched at build or request time):

1. devDependencies: `@iconify/utils`, `@iconify-json/lucide`,
   `@iconify-json/lucide-lab`, `@iconify-json/hugeicons`.
2. `client/scripts/build-icons.mjs` reads the registry of wanted ids, runs
   `getIconData` → `iconToSVG`, normalises `stroke-width`, keeps only
   `currentColor`, and writes **`client/lib/icons/icon-bodies.generated.ts`**
   (`{ id: { body, width, height } }`). A `.ts`, never a `.json` beside a
   `.ts` of the same name (the e2e jest resolution trap).
3. `client/lib/icons/registry.ts`: the id list an admin can pick from. Strings
   only, so it passes `shared-boundary.spec.ts` and the native app reads it.
4. `Category.icon` stores the chosen id (`"lucide-lab:yarn-ball"`,
   `"craft:diya"`). **No slug→icon map in code**, which is what left 17 tiles
   on the same basket. Unknown or empty id renders the wrapped-gift fallback.
5. `components/ui/Icon.tsx`, a Server Component (no `"use client"`):
   `<svg viewBox aria-hidden focusable="false">` with the committed body,
   coloured by CSS `color`. Works inside client chip rows too.
6. Native: `react-native-svg`'s `SvgXml` with the same body and a `color`
   prop (already installed in `mobile/`).
7. A spec: every registry id exists in the generated file, nothing extra is
   in it, and no body contains `<script`, `href` or an `on*=` attribute.

**Cost:** ~26 icons measure 2.9 KB gzipped as one file. Zero client JS where
a Server Component renders them.

**Emoji leave the browse pages** (`lib/category-emoji.ts` is deleted with
G3, and `/shop`'s chips move to the same `<Icon>`): an emoji renders
differently on every OS, and the rail's fallback 🧺 is the page's one AI-slop
tell.

---

## 7. The listing engine (HomeKrafter, admin, later the app)

### 7.1 Shape

- **`client/lib/listing-flow/`**, pure and shared with the native app under
  the `client/lib` contract (no React, no DOM). A question is data:

  ```ts
  interface Question {
    id: string;                        // stable, stored in ListingDraft.answers
    section: "photos" | "basics" | "details" | "price" | "delivery" | "extras";
    prompt: string;                    // "What is it made of?"
    help?: string;
    input: QuestionInput;              // photos | text | money | single | multi | swatches | number | dimensions | yesno
    when?: (draft: Draft, ctx: FlowContext) => boolean;   // branching
    requirement: (draft: Draft, ctx: FlowContext) => "required" | "encouraged" | "optional";
    validate?: (value: unknown, draft: Draft) => string | undefined;  // sentence, never a code
  }
  ```

- **Core questions are code; attribute questions are generated** from the
  category's `CategoryAttribute` rows (`GET /seller/listing-schema?categoryId=`).
  Adding "Wax type" to Candles is an admin action, not a deploy.
- **One validator, two callers.** `validateDraft(draft, schema)` in
  `lib/listing-flow` drives the client; the server re-validates against the
  same definitions and is the authority.
- **`schemaVersion`** on every draft. A draft started before a question was
  added still opens; new required questions appear in the review screen as
  "1 new question".

### 7.2 Question order for a gift

Each line appears only when its `when` holds. **Bold** = required to submit.

1. **Photos** (1–6). Skippable with "I'll add it later", never blocking (M45).
2. **What do you call it?**
3. **What is it?** Department search with suggestions. Today the suggestions
   come from the name matched against `Category.synonyms`; later from the
   photo (§8). "None of these" files a `TaxonomySuggestion` (M50).
4. **Which kind?** Subcategory, only if the department has children.
5. **Attribute questions** for that category, one per screen, required first.
   Earrings: metal or base → stone or embellishment → closure → size.
   Candles: scent family → wax → burn time → vessel.
6. Colours (swatches, `lib/sell/listing-colours.ts`, where the category asks).
7. **Price**, then "Is it on offer?" → MRP.
8. **Ready to ship, or made when ordered?** (it changes what the buyer is
   promised, so it is required)
   - Ready → **How many do you have?**
   - Made to order → **How many days to make and send?** (→ `prepTimeMins`,
     which already drives the Pre-order badge)
   - Delivery is **not asked** for a gift: gifts always ship nationwide
     (2026-09-15). The page states it as a fact line instead.
9. Packed weight (for the courier; "roughly is fine").
10. Can the buyer personalise it? → what (name, date, photo, message) →
    character limit → extra charge.
11. Which occasions suit it? Upcoming dated ones listed first.
12. Who is it for? Recipients.
13. **Description.** Opens with a starter sentence **built from the answers
    by a plain template**, clearly editable, not AI: "Handmade brass earrings
    with mirror work, a hook closure, about 5 cm long."
14. Care instructions (where the category asks).
15. **Review**: every answer as a tappable row, grouped by section, the card
    preview at the top, "3 things left before you can submit", then
    **Submit for review** (moderation is unchanged, M22).

The food flow is the same engine with a different question set: the
`listing-families.ts` families become category attribute templates
(ingredients, allergens with "None of these", veg mark, shelf life,
prep time), and every food rule in CLAUDE.md carries over unchanged.

### 7.3 Auto-reveal: how the page grows (D5)

One scrolling page, not a wizard. The engine computes the **visible
question list** from the answers on every change
(`visibleQuestions(draft, schema)`, pure), and the page renders that list.
"Revealing" a question is nothing more than it entering that list, so there
is no step state to drift out of sync with the answers.

**When the next question appears**

| Input | Appears when | Why |
|---|---|---|
| Single choice, yes/no, chips | on tap | the tap *is* the answer; a Next button after it is a wasted press |
| Multi choice, swatches | on "Done" or on moving to the next field | a multi-select has no natural end |
| Text, money, number | on Enter / the keyboard's Next key, or leaving the field **with a valid value** | never while typing: a question appearing mid-word moves the page under the thumb |
| Photos | after the first upload finishes, or "I'll add photos later" | the photo step must not block (M45) |
| Optional question | immediately shown with a "Skip" link; skipping reveals the next one | encouraged ≠ required |

**What happens on reveal**

- The new question enters with `@starting-style`: opacity 0 → 1 and a 8px
  rise, 220ms ease-out. Reduced motion: fade only.
- It scrolls to the upper third of the viewport through `scrollBehavior()`
  (`lib/motion.ts`), because a scripted smooth scroll ignores the media query.
- **Focus follows only when the person advanced with that question's own
  control** (tap, Enter). Editing an earlier answer never steals focus down
  the page. On a phone the next text input takes focus so the keyboard stays
  up rather than dropping and rising again.
- One polite live region announces "Next: What is it made of?". The
  questions themselves are not live regions (M49's one-announcement rule).

**Answered questions**

- Collapse to a one-line summary row ("Metal or base · Brass") with the
  question in small type above it. Tap to reopen in place; the rest of the
  page stays put.
- Changing a **branch-deciding** answer (department, subcategory, ready vs
  made to order, personalisable) re-runs `visibleQuestions`. Questions that
  drop out fold away (height and opacity, 200ms); their answers stay in the
  draft so switching back restores them, and **the server discards answers
  to questions that are not visible** on submit, the same rule as a licence
  typed by a non-food applicant not being stored (M32).
- Section headings (Photos · Basics · Details · Price & stock · Delivery ·
  Extras) appear as their first question does, and form the jump nav on
  desktop.

**The end of the page**

- When every required question is answered, a **Ready to submit** card
  appears at the bottom: the live card preview, "2 optional details left"
  (links to each), and **Submit for review**. Before that, a pinned footer
  says "4 things left" and jumps to the first.

**Editing an existing listing** opens the same page with every applicable
question revealed and collapsed to its summary row. That page *is* the
review screen; there is no second one.

### 7.4 Screens

- **Phone**: the single column above. Primary action in the thumb zone,
  `enterkeyhint="next"` on text inputs, 16px controls (M29).
- **Desktop (≥900)**: the same column (max ~640px), with a sticky right rail
  holding the live `ProductCard` preview (the real component, `inert`, as the
  admin queue does) and the section jump nav.
- **Admin create/edit**: same engine, `actor: 'admin'`, a "Which storefront?"
  question first (defaults to `vd8`), and the M44 rules (no queue, no
  re-queue) unchanged.
- **Duplicate a listing** (repeat makers): opens a new draft pre-answered from
  an existing listing with photos and name cleared.

### 7.5 Details that are easy to get wrong

- Autosave every committed answer, debounced 800ms, "Saved" in receipt type.
  A failed save is a Notice with Try again, never silence (the `lib/api`
  write rule).
- A server refusal opens the question it names and says its sentence (the M45
  "jump to the first missing field" rule, per question).
- Nothing reveal-related is keyed on time or randomness, so server and
  browser render the same initial list (M12).
- CLS: content only ever appears **below** the question being answered; a fold
  of dropped questions above the viewport is compensated by keeping the
  current question's scroll anchor (`overflow-anchor` stays on).
- Every portal rule holds: kit components, no `window.confirm`, no
  `role="tablist"` on chips.

---

## 8. AI-ready, without AI (what G1–G2 build so G5 is a drop-in)

The pattern every platform that ships this uses (eBay, Amazon, Shopify,
Mercari, Depop, Poshmark, Facebook Marketplace): **photo first, the model
writes a draft, a person confirms, nothing auto-publishes.** Two lessons
decide our shape:

- **Confirm the category before generating anything else** (Mercari: a photo
  of a toy car produced a listing for a real car). Attributes hang off the
  category, so a wrong category poisons every answer under it.
- **Structured answers are the truth; prose is rewritten from them**
  (Poshmark's "Regenerate"). The template description starter in §7.2 is
  that pipeline with a template where the model will go.

And one to **not** copy: Shopify treats an untouched suggestion as confirmed
when the product is saved. Here, an untouched suggestion is unanswered.

### 8.1 What G1–G2 build now

| Piece | Where | Why it has to exist before the model does |
|---|---|---|
| **Grounding**: `Category.description`, `synonyms` (incl. Hinglish: achaar, jhumka, diya, kada), include/exclude notes ("cake-shaped soap → Self-care, not Cakes"), `AttributeOption.synonyms` | G1 schema + admin screens | A model can only choose from a taxonomy that explains itself. The same fields power buyer search and today's keyword suggester |
| **Per-field provenance** on `ListingDraft.fieldMeta`: `{ source: user \| default \| suggested \| suggestion_accepted \| suggestion_edited, confidence?, suggestionId?, at }` | G2 | Drives the "unconfirmed" styling, edit-rate per field, and the audit trail. Started now, it is also how the eval set gets collected (production has no seeded data) |
| **`ListingSuggestion` rows**: draft, provider, model, prompt version, taxonomy version, image ids, output, latency, status | G2 (written by the keyword provider) | Audit and evaluation from day one |
| **`SuggestionProvider` interface** with `none` and `keyword` implementations, chosen by `LISTING_SUGGESTIONS=none\|keyword` | G2 server | The same env-gated shape as email, WhatsApp and Shadowfax. G5 adds a `vision` implementation and changes nothing else |
| **Endpoint contract** `POST /seller/listing-drafts/:id/suggestions` → `{ requestId, categories: [{ id, confidence }] (≤3), attributes: { key: { optionId, confidence } }, title?, description?, needsExplicitConfirm: [keys], warnings: [] }` | G2 | Idempotent on draft + image hash. **Any failure answers empty suggestions and the form carries on.** It never writes to `Product` |
| **Suggestion UI slot** on the "What is it?" question: chips reading "Looks like: Earrings · Bangles" that must be tapped to become answers | G2 (fed by the keyword provider) | The UI, its accessibility and its analytics are proven before a model is trusted to feed it |
| **`AttributeDefinition.trustSensitive`** | G1 | See 8.2 |
| **Eval export** `server/scripts/export-listing-eval.mjs`: admin-approved listings → photo, name, final category, attributes. Excludes Pexels demo stock | G2 | Measures top-1/top-3 category accuracy, per-attribute exact match and a **claim-leak rate that must be 0** before G5 ships |

### 8.2 Things a suggestion may never fill

Marked `trustSensitive` and rendered as plain questions, never pre-selected:
FSSAI or any licence · "organic" (needs certification under FSS Organic Foods
Regulations 2017) · hallmark / 925 / "pure gold" (BIS hallmarking is
mandatory) · hypoallergenic, nickel-free, natural, chemical-free,
preservative-free · the veg/non-veg mark (`dietOf`) · shelf life · price.
**Allergens** may be *suggested* only as individual items each confirmed
separately, and "None of these" is never pre-selected. Generated description
text is filtered for the same claim phrases before it is shown. This is the
2026-09-14 "stop claiming what nothing records" rule applied to a model.

### 8.3 Moderation and privacy

- A suggested listing enters the same `pending` queue (M22). Accepting a
  suggestion is never an exemption from material-change re-queueing, and the
  admin queue shows provenance ("category suggested, accepted by maker").
- Uploads are already EXIF-stripped and re-encoded (M25). A workshop photo can
  still show a face, a document or an address, so the prompt tells the model
  to ignore people and text that is not a product label, and the provider's
  data-retention terms are checked before G5.

### 8.4 Known failure modes to test against

Hampers (the biggest object wins instead of `isHamper`) · look-alikes
(cake-shaped candles and soaps vs cakes, resin vs glass, printed vs
hand-painted, block vs screen print) · what pixels cannot show (metal,
plating, real vs artificial stone, wax type) · scale (toy vs real) ·
background objects picked up as the product · a custom-print sample
mistaken for the product · regional names.

### 8.5 Left for G5

Model choice, prompt, and cost per listing. Image input scales with pixels
(Anthropic's vision docs: a 1000×1000 image is ~1,296 tokens), so photos are
sent at ~1000px, not the stored 2000px. Price it with current pricing at the
time rather than a number written here. Fire the request when the first
photo finishes uploading so the maker is answering "What do you call it?"
while it runs.

---

## 9. Milestones

| # | Scope | Depends on | Size |
|---|---|---|---|
| **G0** | **Quick fixes on today's page and data.** *Code built 2026-09-16; the production data pass (merges and moves below) is not done yet and needs a go-ahead with a backup.* Parent shelves selectable (D3). Hide zero-count tiles (D2). Sold out sorts last; default sort "Recommended" (D9). Drop "Authentic" and "One"/"one" from the card meta. No location modal on `/gifts` (D8). `pageSize: 500` (B15). Fold accents as well as case when a category name is compared (the Home Décor duplicate's cause, §3.1). Admin data pass: merge the two Home Décor shelves, move Rakhi hampers, crochet toys, scrunchies, pooja items to the right shelves, set `isHamper`. The sold-out Rakhi listings stay listed and sort last (owner) | none | S |
| **G1** | **Taxonomy + attributes.** *Built 2026-09-16 (schema, migration, both seeds, server-side validation, the three endpoints, gift facet filtering on `GET /products`, archive/merge, the admin attribute routes, the recategorisation proposal script, D10's courier rule, and all three admin screens — shelf editor with archive/merge, attribute templates, bulk Recategorise). **Still owed: the production migration + data pass** (merge the Home Décor duplicates, re-file the live listings, set `isHamper`), which needs a go-ahead and a backup in the turn it happens.* §4 schema; seed the gift department tree and attribute sets (additive, idempotent, never overwrites, like `seed-subcategories.ts`); admin screens for departments, icons, synonyms, attribute templates, merge/archive; recategorisation proposal + bulk screen; server validation of attribute values; compliance fields (§3.6); `GET /seller/listing-schema`, `/catalog/departments`, `/catalog/facets`; server-side gift filtering | G0 | L |
| **G2** | **Listing engine.** `lib/listing-flow`, `ListingDraft` + autosave, phone and desktop screens, review/edit screen, admin on the same engine, keyword suggester, template description starter; delete `GuidedListingForm`, `ListingForm`, `listing-families.ts` once the food question set is ported and its specs pass | G1 | L |
| **G3** | **`/gifts` redesign.** *Built 2026-09-16: §6 icons end to end (committed catalogue, registry, `<Icon>`, six new hand-drawn department marks, the admin picker, emoji deleted from both browse pages), the compact title band, the gift finder sentence, department tiles with real-listing faces and subcategory disclosure, the coming-up strip, the sticky toolbar with Dispatch + Personalisable, the 4-across grid and the card fact line. **Still owed: §5.1.9's right-side 420px filter drawer** (the existing sheet is used at every width), the finder collapsing into three pills once the toolbar sticks, and the §5.2 removals that are data rather than code — recipient shelves stop being categories in the production pass.* | G1 (data), D12 (typography) | M–L |
| **G4** | **Personalisation to the order.** Buyer enters the text on the product page; it rides on `CartItem`/`OrderItem`; shown on the maker's order detail and the packing view; fee added server-side | G2, owner go/no-go (D11) | M |
| **G5** | **AI listing assist.** A vision provider behind the §8 contract | G2, eval set, owner go/no-go | M |

G2 and G3 can run in parallel once G1 lands. G3 does not wait for attributes
to fill in: a facet appears only when enough listings answer it (§4).

Tests owed per milestone follow `docs/TESTS.md`: pure specs for the flow
graph and facet predicates, unit specs for attribute validation, an e2e
against real Postgres for "a gift filtered by department + attribute +
recipient returns the intersection", and structural specs for
admin-only taxonomy writes and "a trust-sensitive attribute is never
prefilled". Add `/gifts` states to `e2e/tests/public-routes.ts` and run
`node e2e/sweep.mjs` before G3 is called done.

---

## 10. Sources

Checked 2026-09-15. Anything unconfirmed is marked in the text.

**Taxonomy and filters:** Etsy attributes — https://www.etsy.com/seller-handbook/article/362857340643 ·
https://help.etsy.com/hc/en-us/articles/115014502508 · Etsy search filters —
https://help.etsy.com/hc/en-gb/articles/115015627947 · Etsy Gift Mode —
https://techcrunch.com/2024/01/24/etsy-launches-gift-mode-a-new-ai-powered-feature-that-generates-200-gift-guides/ ·
NOTHS — https://www.notonthehighstreet.com/gifts/shop-by-category ·
https://www.notonthehighstreet.com/gifts/shop-by-recipient/for-her · Amazon Custom —
https://sell.amazon.com/programs/custom · FNP — https://www.fnp.com/ · IGP — https://www.igp.com/ ·
Archies — https://www.archiesonline.com/ · Okhai — https://okhai.org/ · Zwende — https://www.zwende.com/ ·
iTokri — https://www.itokri.com/ · Jaypore crafts — https://www.jaypore.com/m/craft ·
Shopify taxonomy — https://github.com/Shopify/product-taxonomy · Google taxonomy —
https://www.google.com/basepages/producttype/taxonomy.en-US.txt · Baymard —
https://baymard.com/blog/5-essential-filters · https://baymard.com/blog/ecommerce-over-categorization ·
https://baymard.com/blog/sales-filter-based-category · https://baymard.com/blog/promoting-product-filters ·
https://baymard.com/blog/horizontal-filtering-sorting-design · https://baymard.com/blog/how-to-design-applied-filters ·
NN/g — https://www.nngroup.com/articles/filter-categories-values/

**Listing flows:** eBay — https://innovation.ebayinc.com/stories/ebay-reduces-the-time-to-list-on-mobile-with-new-simplified-selling-tool-now-featuring-magical-listing-ai-technology/ ·
Amazon — https://www.aboutamazon.com/news/innovation-at-amazon/amazon-generative-ai-seller-growth-shopping-experience ·
Shopify category — https://help.shopify.com/en/manual/products/details/product-category ·
https://shopify.engineering/evolution-product-classification · Mercari —
https://careers.mercari.com/en/mercan/articles/49770/ · Depop —
https://news.depop.com/company-news/depop-launches-ai-powered-listing-from-one-photo/ ·
Poshmark — https://blog.poshmark.com/smart-list-ai-101/ · Facebook Marketplace —
https://about.fb.com/news/2026/03/facebook-marketplace-new-meta-ai-tools-make-selling-faster-and-easier/ ·
https://www.valueaddedresource.net/meta-ai-listing-facebook-marketplace/ · Meesho —
https://www.meesho.io/ai/data-challenge · Swiggy — https://inc42.com/buzz/swiggy-ai-tool-help-restaurants-create-menu/ ·
Zomato — https://aws.amazon.com/blogs/machine-learning/zomato-digitizes-menus-using-amazon-textract-and-amazon-sagemaker/

**Forms:** GOV.UK one thing per page — https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/ ·
question pages / check answers — https://service-manual.nhs.uk/design-system/patterns/question-pages ·
https://service-manual.nhs.uk/design-system/patterns/check-answers · NN/g wizards —
https://www.nngroup.com/articles/wizards/ · NN/g progressive disclosure —
https://www.nngroup.com/articles/progressive-disclosure/ · Baymard fields —
https://baymard.com/blog/checkout-flow-average-form-fields · Kim et al. CHI 2019 —
https://dl.acm.org/doi/10.1145/3290605.3300316 · JSON Forms rules — https://jsonforms.io/docs/uischema/rules ·
SurveyJS conditional logic — https://surveyjs.io/form-library/documentation/design-survey/conditional-logic ·
JsonLogic — https://jsonlogic.com/ · Microsoft HAX guidelines —
https://www.microsoft.com/en-us/haxtoolkit/guideline/support-efficient-correction/ · Anthropic vision —
https://platform.claude.com/docs/en/build-with-claude/vision

**Icons:** Iconify React — https://iconify.design/docs/icon-components/react/ · Iconify utils —
https://iconify.design/docs/libraries/utils/ · collections and licences — https://api.iconify.design/collections ·
unplugin-icons Turbopack — https://github.com/unplugin/unplugin-icons/issues/384 · Lucide Lab —
https://github.com/lucide-icons/lucide-lab · Phosphor — https://github.com/phosphor-icons/react ·
Hugeicons free — https://www.npmjs.com/package/@hugeicons/core-free-icons

**Compliance (not legal advice):** E-Commerce Rules r.6 — https://www.consumerprotection.in/rule-6-duties-of-sellers-on-marketplace/ ·
https://ssrana.in/articles/e-commerce-platforms-display-seller-details/ · Legal Metrology FAQ —
https://taxguru.in/corporate-law/faqs-legal-metrology-packaged-commodities-rules-2011.html · r.6(10) —
https://www.lexology.com/library/detail.aspx?g=220acc38-775a-41db-b91f-bf64d4422b02 · 2023 amendment —
https://www.legitquest.com/act/legal-metrology-packaged-commodities-amendment-rules-2023/E049 · 2026 amendment —
https://www.mhcolaw.com/updates/regulatory-update-legal-metrology-packaged-commodities-amendment-rules-2026/209 ·
FSSAI e-commerce shelf life — https://food.chemlinked.com/news/food-news/fssai-reinforce-compliance-requirements-for-e-commerce-food-businesses ·
FSS organic — https://fssai.gov.in/cms/organic-food.php · BIS hallmarking —
https://www.pib.gov.in/PressReleasePage.aspx?PRID=2073332
