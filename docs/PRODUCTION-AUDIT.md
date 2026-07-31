# Homekrafted — production readiness audit

**Audited:** 2026-07-31, against `main` @ `7d4a203` (post-M14).
**Scope:** whole monorepo — `client/` (65 routes), `server/` (~190 files,
60+ endpoints), `server/prisma/schema.prisma` (63 models/enums), docs.
**Phase 1 shipped:** 2026-07-31 (M15) — every item in §7 Phase 1 is done.

Findings are kept **as they were found**, each marked ✅ with the
milestone that closed it, so the record of what was wrong survives the
fix. Phases 2–4 are untouched.

This is a **gap audit of a working marketplace**, not a review of a
scaffold. M0→M14 shipped; the site is live on https://homekrafted.in with
a real NestJS + Prisma + Postgres backend, JWT auth, three role surfaces,
Razorpay wiring, WhatsApp webhooks and file uploads. What follows is what
stands between that and a public launch.

Severity ladder used throughout:

| | Meaning |
|---|---|
| **Critical** | A core marketplace loop dead-ends, or money/trust is at risk. Blocks launch. |
| **High** | Launch is possible but visibly unfinished, unfindable, or fragile. |
| **Medium** | Real gap, absorbable in the first weeks after launch. |
| **Low** | Polish, or work that only pays off at scale. |

---

## 1. Executive summary

The build is unusually disciplined for its stage: a single schema
contract, one API seam (`client/lib/api`), enforced channel rules, audit
logging on every admin mutation, idempotency on every money mutation,
byte-sniffed uploads. The gaps are not sloppiness — they are **loops that
were built from one end and never joined at the other.**

Five of those open loops are launch-blocking. **All five were closed in
M15** — listed here as found, with what each became:

1. **Nobody can search.** No search exists anywhere in the product.
   → `q` on products/vendors/snacks, a `/search` route, a real header form.
2. **Nobody can leave a review.** The endpoint exists; no UI reaches it.
   → `<ReviewForm>`, `/account/reviews`, and ratings that recompute.
3. **No HomeKrafter can be paid.** They can request a payout; no admin
   surface exists to approve or settle it. → `/admin/payouts`.
4. **No dispute can be resolved.** Customers can open support tickets; no
   admin surface exists to read them. → `/admin/support`, plus the
   customer's own thread on `/support`.
5. **No customer can cancel, return, or ask for a refund.**
   → `POST /orders/:id/cancel` and `/return`.

Everything else in this document was downstream of those five. What
remains is Phase 2 onward — see §7.

---

## 2. Findings by category

### 2.1 Critical

| # | Finding | Evidence |
|---|---|---|
| C1 ✅ | **Fixed in M15.** **No search anywhere in the product.** `SearchField` exists as a UI primitive but is used only by the dev gallery and admin orders. There is no `/search` route, no header search input, and `ListProductsQueryDto` has no `q` field — so even the API cannot answer "pickle". The header's search pill is a `<Link href="/shop">`. | `client/components/ui/SearchField.tsx`, `client/components/layout/HeaderClient.tsx:95`, `server/src/catalog/dto/list-products.query.dto.ts` |
| C2 ✅ | **Fixed in M15.** **Review submission has no UI.** `POST /reviews` is implemented, including verified-purchase computation against non-cancelled orders. `lib/api/reviews.ts` states outright: "There's no review-submission UI in the frontend yet… `POST /reviews` has no call site." Ratings on cards and storefronts are therefore fed only by seed data. | `server/src/reviews/reviews.service.ts:24`, `client/lib/api/reviews.ts:5` |
| C3 ✅ | **Fixed in M15.** **Payout loop is open.** `POST /seller/payouts/request` creates `Payout{status: pending}`. There is no `admin/payouts` controller, no admin page, and no transition to `paid`/`rejected` anywhere in `server/`. Sellers accrue delivered earnings that can never leave the platform. | `server/src/seller/payouts.service.ts`, absence of `server/src/admin/payouts.*` |
| C4 ✅ | **Fixed in M15.** **Disputes have no admin surface.** `SupportTicket`/`SupportMessage` models and the customer-side `/support/tickets` API exist. No `/admin/support*` endpoint, no admin nav entry, no page. Tickets are written and never read. | `server/src/support/support.controller.ts`, `client/components/admin/AdminShell.tsx:31-38` |
| C5 ✅ | **Fixed in M15.** **No customer cancellation, return or refund request.** `RefundStatus` carries `requested`, and admins can push a refund from `/admin/orders/:type/:id/refund` — but no customer-facing path reaches `requested`, and no order screen offers "cancel". The only listed remedy is a support ticket nobody reads (C4). | `server/prisma/schema.prisma` (`RefundStatus`), grep of `client/app` + `client/components` for cancel/return |

### 2.2 High

| # | Finding | Evidence |
|---|---|---|
| H1 ✅ | **Fixed in M15.** **No error, loading or 404 boundaries.** The app has zero `error.tsx`, `not-found.tsx`, `loading.tsx` or `global-error.tsx` files. `notFound()` is called by product, storefront and collection pages and lands on Next's unstyled default; any thrown render error takes the whole page white. | `find client/app -name 'error.tsx' -o -name 'not-found.tsx'` → empty |
| H2 ✅ | **Fixed in M15.** **SEO is effectively absent.** Two of 65 route files export metadata (`layout`, `about`). No `sitemap.ts`, no `robots.ts`, no canonical URLs, no Open Graph images, no JSON-LD (`Product`, `Offer`, `AggregateRating`, `LocalBusiness`, `BreadcrumbList`). A discovery marketplace that cannot be discovered. | grep for `generateMetadata` across `client/app` |
| H3 ✅ | **Fixed in M15.** **Follow is fake.** `FollowButton` is local `useState` with a comment saying "no persistence yet". `VendorFollow` exists in the schema with a `@@unique([userId, vendorId])` — no endpoint, no mutation, no `/account/following`. `Vendor.followerCount` is decorative. | `client/components/storefront/FollowButton.tsx`, `server/prisma/schema.prisma` (`VendorFollow`) |
| H4 ✅ | **Fixed in M15.** **No reorder.** Zero occurrences outside app-promo marketing copy — which advertises "reorder a past meal in one tap" as an app feature the web does not have. Reorder is the cheapest repeat-purchase lever a food marketplace has. | grep `reorder` across `client/` |
| H5 ✅ | **Fixed in M16.** **HomeKrafter profiles are a store page, not a profile.** `Vendor` carries slug, name, type, bio, avatar, banner, location, area, lat/lng, radius, rating, reviewCount, followerCount, joinedAt. Nothing of: shop story, kitchen photos, certifications (FSSAI), prep time, response time, policies, languages, achievements, trust score, profile completion, social links. The storefront renders header + product grid + reviews and stops. | `server/prisma/schema.prisma` (`Vendor`), `client/app/storefront/[vendor]/page.tsx` |
| H6 | **Seller portal has no analytics.** Eight nav items — Dashboard, Listings, Menu, Orders, Pickups, Storefront, Payouts, Reviews — none of which answer "what is selling, and when". No `/seller/analytics` route and no seller-scoped analytics endpoint. | `client/components/seller/SellerShell.tsx:41-48` |
| H7 | **No image optimisation.** `next/image` is used nowhere; `ImageSlot` renders a raw `<img>`. Every uploaded product photo ships at whatever resolution the HomeKrafter's phone produced, to every buyer's phone. `next.config.ts` is empty. | `client/components/placeholder/ImageSlot.tsx:45`, `client/next.config.ts` |
| H8 | **Occasion shopping is a filter, not a destination.** `Occasion` + `ProductOccasion` + `Collection` exist and `/collections/[occasion]` renders, but there is no occasion hub, no gift guide, no seasonal merchandising, and no way to browse "what's coming up". The gifting marketplace's strongest seasonal hook is unexploited. | `client/app/collections/[occasion]/page.tsx` |

### 2.3 Medium

| # | Finding |
|---|---|
| M1 | **Subscriptions exist only for laundry.** `LaundrySubscription` + `POST/PATCH/DELETE /laundry/subscriptions` are real and wired into the booking flow, but there is no management surface (no `/account/subscriptions`), no pause/skip/resume, and nothing equivalent for snacks, meals or cleaning. No recurring-order generation job exists — a subscription records intent and produces nothing. |
| M2 | **Pre-order is rolling days only.** `lib/schedule.ts` derives the next N days and suppresses today's expired windows. No custom date picker, no seller-blocked dates, no holiday/festival handling, no per-item preparation-time rule, no availability-driven slot suggestion. |
| M3 | **Accessibility is thin.** Two `aria-live` regions and a handful of `role="alert"` across the whole client. No skip-to-content link. `ImageSlot` sets `role="img"` + `aria-label` then renders the real image `aria-hidden` — workable, but every product photo's alt text is the placeholder caption, not the product. Focus management on drawers/modals unverified. |
| M4 | **Razorpay runs on a placeholder key.** With the `.env.example` value the server degrades to `mock: true` and the checkout modal cannot take a test card. Launch requires real test → live keys and a webhook secret. |
| M5 | **Admin has no reports, exports or platform settings.** Analytics is five stat cards plus a 14-day GMV chart. No CSV export, no date-range control, no cohort/retention view, no settings surface for commission, delivery radius defaults, or feature flags (`lib/features.ts` is edited by hand and requires a redeploy). |
| M6 | **Support is a client-side auto-reply.** `SupportClient` runs `lib/support/autoReply.ts` with no backend conversation; ticket creation posts, but the chat the customer sees is scripted locally. |
| M7 | **No notification delivery verification.** Providers are env-gated to logged stubs. Email/SMS/WhatsApp templates and the actual send path are untested against real providers. |
| M8 | **Guest checkout undefined.** Cart is client state; checkout fetches owner-scoped addresses and wallet. What a signed-out buyer experiences at checkout is not explicitly designed. |

### 2.4 Low

| # | Finding |
|---|---|
| L1 | Two copies of the tricity area table (`client/lib/geo.ts`, `server/src/common/geo.ts`) kept in sync by hand and by convention only — no test asserts they match. |
| L2 | `WalletContext` still holds client-side wallet state alongside the real wallet API in places; the balance shown is context-derived. |
| L3 | The dev gallery (`/gallery`) is unlinked but publicly routable in production. |
| L4 | No test suite of any kind in either package — no unit, integration or e2e. |
| L5 | No rate limiting visible on auth/OTP endpoints beyond what nginx provides. |
| L6 | `handoff/prototype` ships in the repo (correctly excluded from lint, but still deployed source). |

### 2.5 Not found — things that are fine

Worth recording, so a later audit does not re-litigate them:

- **No duplicate components.** `StatCard` exists twice (admin, seller) but with genuinely different props and styling; `OrderDetailClient` exists three times, one per role surface, correctly.
- **No dead routes.** Every route file resolves and is reachable from nav, a link, or is deliberately unlinked (`/gallery`).
- **No broken internal links** found in nav, footer, drawer, or account/seller/admin shells.
- **Empty states are well covered** — 68 empty-state strings across the client; every list surface has one.
- **UI consistency is high.** CSS Modules over `--hk-*` tokens throughout, no inline styling, no Tailwind leakage, no stray hex outside the documented one-off exceptions.
- **Permissions are sound server-side.** Every `/seller/*` path resolves through `SellerService.resolveHomeKrafter` and re-reads the row rather than trusting the JWT claim; every admin mutation writes an audit row; ownership is never taken from a route param.

---

## 3. Flow walkthroughs

### 3.1 Customer

| Step | State | Gap |
|---|---|---|
| Landing | ✅ complete | — |
| Browse | ✅ complete | Location-aware, degrades correctly when declined |
| **Search** | ❌ **missing entirely** | C1 |
| Category | ✅ complete | — |
| Product | ✅ complete | No JSON-LD (H2); no "customers also bought" |
| Cart | ✅ complete | — |
| Checkout | ✅ complete | Guest path undefined (M8) |
| Payment | ⚠️ works, placeholder key | M4 |
| Order success | ✅ complete | — |
| Tracking | ✅ status stepper, per channel rules | Correct by design — live tracking is app-only |
| Order history | ✅ complete | — |
| **Review** | ❌ **no path** | C2 |
| **Reorder** | ❌ **missing** | H4 |
| **Cancel / return / refund** | ❌ **missing** | C5 |

### 3.2 HomeKrafter (seller)

| Step | State | Gap |
|---|---|---|
| Signup → application | ✅ complete | `/sell` posts to the admin queue |
| Verification | ✅ admin approve/reject | No document upload for FSSAI/ID (H5) |
| Profile / shop setup | ⚠️ minimal | Name, bio, avatar, banner, radius only (H5) |
| Store branding | ⚠️ minimal | No logo separate from avatar, no cover story |
| Add products | ✅ complete | Real image upload since M14 |
| Inventory | ✅ availability toggle + stock | No low-stock alerting |
| Pricing | ✅ complete | No bulk edit, no scheduled/sale pricing |
| Orders → preparation → dispatch | ✅ complete | `POST /seller/orders/:id/advance` |
| Completed orders | ✅ complete | — |
| Wallet / earnings | ✅ computed from delivered | — |
| **Withdraw earnings** | ⚠️ **request only, never settles** | C3 |
| **Analytics** | ❌ **missing** | H6 |
| Reviews | ✅ list + reply | Nothing to reply to until C2 lands |
| Store settings | ⚠️ folded into storefront | No policies, hours, holidays (H5, M2) |

### 3.3 Admin

| Step | State | Gap |
|---|---|---|
| Authentication | ✅ own login, own shell | — |
| Seller approval | ✅ complete | — |
| Product moderation | ✅ complete | — |
| Order management | ✅ list, detail, status override, refund | — |
| **Dispute resolution** | ❌ **missing** | C4 |
| Analytics | ⚠️ shallow | M5 |
| Users | ✅ list, detail, suspend | — |
| **Payouts** | ❌ **missing** | C3 |
| Reports | ❌ missing | M5 |
| Platform settings | ❌ missing | M5 |

---

## 4. Page-by-page

Completion is against "what this page must do at launch", not against a
hypothetical maximum.

| Route | Purpose | Done | Missing | Priority |
|---|---|---|---|---|
| `/` | Store-first home | 95% | Metadata, JSON-LD | High |
| `/shop` | Marketplace browse | 85% | Search, pagination SEO, metadata | Critical |
| `/product/[slug]` | Product detail | 85% | Review CTA, JSON-LD, related items | Critical |
| `/storefront/[vendor]` | HomeKrafter profile | 40% | Everything in H5; real follow | High |
| `/collections/[occasion]` | Occasion collection | 70% | Hub page, gift guides, seasonal banner | High |
| `/cart` | Cart | 95% | — | — |
| `/checkout` | Checkout | 90% | Guest path | Medium |
| `/laundry` | Booking | 90% | Subscription management | Medium |
| `/snacks` | WhatsApp menu | 95% | — | — |
| `/hamper` | Hamper builder | held behind `FEATURES.hamperBuilder` | Deliberate | — |
| `/wallet` | Wallet | 90% | — | — |
| `/account` + 6 children | Account | 85% | Reviews written, subscriptions, following, returns | Critical |
| `/account/orders/[id]` | Order detail | 70% | Reorder, review, cancel, return, invoice | Critical |
| `/support` | Support | 60% | Real ticket thread, admin reply loop | Critical |
| `/sell` | Seller onboarding | 90% | Document upload | Medium |
| `/corporate`, `/about`, `/app-promo` | Marketing | 95% | Metadata | High |
| `/login`, `/signup` | Auth | 90% | Password reset flow unverified | High |
| `/seller/*` (10 routes) | Seller portal | 80% | Analytics, settings, payout settlement | High |
| `/admin/*` (13 routes) | Admin panel | 75% | Payouts, disputes, reports, settings | Critical |
| `/gallery` | Dev primitives | n/a | Should be dev-only in prod (L3) | Low |
| **missing** | `/search` | 0% | C1 | Critical |
| **missing** | `not-found`, `error`, `loading` | 0% | H1 | High |
| **missing** | `sitemap.ts`, `robots.ts` | 0% | H2 | High |

---

## 5. Dashboards

### 5.1 Customer (`/account`)

Present: overview, orders, addresses, wishlist, referrals, notifications,
profile.

Missing, in value order: **my reviews** (write + see), **returns &
refunds**, **subscriptions**, **following**, saved payment methods,
invoice download, spend summary ("₹X saved via wallet this year").

### 5.2 Seller (`/seller`)

Present: dashboard stats, listings, menu, orders, pickups, storefront,
payouts, reviews.

Missing, in value order: **analytics** — revenue over time, top items,
repeat-customer rate, order-value distribution, hour/day heatmap of
demand, conversion from storefront views; **low-stock and
unanswered-review alerts**; **profile completion meter** (directly drives
H5 adoption); bulk price/availability edit; holiday/blocked-date control;
payout status with expected settlement date.

### 5.3 Admin (`/admin`)

Present: dashboard, users, HomeKrafters, orders, catalog, wallet,
collections, analytics, audit log.

Missing, in value order: **payouts queue** (C3), **dispute queue** (C4),
moderation SLA view (oldest pending application/product), GMV by module
(gifting vs laundry vs snacks — the platform's whole thesis and it is not
measured), cohort retention, take-rate/commission reporting, CSV export,
platform settings.

---

## 6. Marketplace readiness

| Dimension | Verdict |
|---|---|
| **Trust** | ⚠️ The two mechanisms that build trust in a homemade-goods marketplace — reviews and a human seller profile — are the two least finished things in the product (C2, H5). Verification badge, certifications, and trust score do not exist. |
| **Safety** | ✅ Upload type sniffing, UUID filenames, nosniff + CSP on `/uploads`, audit logging, idempotency, server-computed money. Genuinely strong. ⚠️ No abuse reporting, no review moderation queue depth, no rate limits on OTP. |
| **Seller experience** | ⚠️ Good operationally, blind commercially (H6) and unpaid (C3). |
| **Customer experience** | ⚠️ Good until something goes wrong — then there is no cancel, no return, and no one reading support (C4, C5). |
| **Search** | ❌ Does not exist (C1). |
| **Categories / filters** | ✅ Multi-select, OR-within/AND-across, price, dietary, distance sort. Solid. |
| **Discovery** | ⚠️ Filters yes, merchandising no (H8). Reels rail exists and is a genuine differentiator — underused. |
| **Reviews / ratings** | ❌ Read-only (C2). |
| **Checkout / payments** | ✅ Wallet, Razorpay, COD for laundry, idempotent. Needs real keys (M4). |
| **Refunds / returns** | ❌ Admin-initiated only (C5). |
| **Notifications** | ⚠️ Modelled and stubbed; unverified against real providers (M7). |
| **Delivery** | ✅ Correctly scoped — radius-based availability on web, logistics deferred to the apps. Consistent with the vision. |
| **Scalability** | ⚠️ No caching layer, no image CDN (H7), no pagination on several admin lists, no tests (L4). Fine for launch volume, not for the second year. |
| **Retention** | ❌ No reorder (H4), no subscriptions in the modules that need them most (M1), no follow (H3), no lifecycle email. |
| **Monetisation** | ⚠️ Payout machinery exists; commission/take-rate is not modelled anywhere. Featured placement, promoted listings and hamper upsell are all unbuilt. |

---

## 7. Launch roadmap

### Phase 1 — critical before launch ✅ **shipped (M15, 2026-07-31)**

Closing the five open loops plus the two things that make a marketplace
usable and findable. See `CHANGELOG.md`'s M15 entry for what each one
actually became, and the decisions taken along the way.

1. `not-found` / `error` / `loading` / `global-error` across consumer,
   seller and admin surfaces. *(H1)*
2. **Search** — `q` on the products API, `/search` route with the
   existing filter primitives, live header field. *(C1)*
3. **Review submission** — write endpoint wired, `ReviewForm`, entry from
   a delivered order and from the product page. *(C2)*
4. **Follow persistence** — endpoints, real `isFollowing`, live counter.
   *(H3)*
5. **Reorder** — one action from any past order. *(H4)*
6. **Cancel / return / refund request** — customer path into
   `RefundStatus.requested`, admin resolves. *(C5)*
7. **Admin payouts** — approve, reject, mark paid, audit-logged. *(C3)*
8. **Admin disputes** — ticket queue, thread, reply, resolve. *(C4)*
9. **SEO** — per-route metadata, `sitemap.ts`, `robots.ts`, JSON-LD.
   *(H2)*

**Still open after Phase 1**, and the reason Phase 2 matters: trust is
now *mechanically* possible (a review can be written, a dispute can be
answered, a HomeKrafter can be paid) but the seller profile that trust
attaches to is still a store page — H5 is the single highest-value item
left.

### Phase 2 — important

10. ✅ **Shipped (M16).** Rich HomeKrafter profiles: `VendorProfile` +
    `VendorPhoto`, storefront story/photos/facts/policies, seller
    editor with a completion meter, admin-only verification badge,
    computed trust signals and derived achievements. *(H5)*
11. Occasion hub, curated gift guides, seasonal banners. *(H8)*
12. Seller analytics. *(H6)*
13. Pre-order calendar: custom dates, blocked dates, holidays, prep-time
    rules, slot suggestion. *(M2)*
14. `next/image` + image CDN. *(H7)*
15. Admin reports, exports, platform settings. *(M5)*
16. Accessibility pass + real alt text. *(M3)*

### Phase 3 — growth

17. Subscription system across snacks, meals, laundry and cleaning —
    schedule, pause, skip, resume, recurring-order generation, seller
    fulfilment tools, admin churn/MRR analytics. *(M1)*
18. Real support conversations. *(M6)*
19. Lifecycle notifications against real providers. *(M7)*
20. Commission/take-rate modelling, featured placement.
21. Test suite. *(L4)*

### Phase 4 — long-term

22. Mobile apps: full food delivery, live tracking, delivery partners.
23. Personalised recommendations from order history.
24. Caching, read replicas, search infrastructure beyond Postgres.
25. Multi-city expansion beyond the tricity.

---

## 8. Guardrails for anyone acting on this

- The channel matrix in `CLAUDE.md` and `lib/channel.ts` is a product
  decision, not an oversight. Snacks having no cart is **correct**. Do
  not "fix" it.
- Location must never become a gate. Declining the prompt returns the
  full catalogue.
- `Product.isAvailable` (HomeKrafter's switch) and `moderationStatus`
  (admin's switch) stay separate.
- `handoff/` is read-only. `styles/tokens.css` is law.
- Every change updates its docs in the same commit — see CLAUDE.md's
  upkeep table.
