# Homekrafted Rider — the delivery partner app (plan, 2026-09-14)

Own-fleet delivery for Chandigarh tricity. **Android first.** The website's
"quick delivery for food orders" comes *after* this app works end to end.

Status: **R1 (server), R5a (app shell + onboarding) built 2026-09-14; R2
(server), R5b (duty, offers, job flow) and R3 (server, cash and payouts)
built 2026-09-15; R4 and R5c next.** Every number marked *(placeholder)*
is a business decision, editable in admin settings, not a constant in
code.

---

## 0. Decisions taken (and why) — confirm or overturn

| # | Decision | Why |
|---|---|---|
| D1 | **Separate app, `rider/`** (package `in.homekrafted.rider`), not a role inside `mobile/` | Background location + a location foreground service put an app under Play's sensitive-permission review. Doing that to the shopper app risks the shopper listing for a feature no shopper uses. Riders also get a different listing, audience and release cadence. |
| D2 | `rider/` does **not** compile `client/lib` | The shared-code contract (`docs/APP.md` §4–5) exists for catalogue/cart code a rider never touches. The rider app has its own ~200-line API client. One less set of Metro aliases to break. |
| D3 | New `UserRole.rider`; sign-in is **phone OTP** | Riders are phone-first. Same `/auth/otp` flow, same JWT, `@Roles('rider')` on every `/rider/*` controller. |
| D4 | New `DeliveryJob`, **not** a `Consignment` with a new provider | Consignment is a carrier record fed by untrusted callbacks and is **gifts-only** (`courier-eligibility.ts`). A fleet job carries food, has OTPs, photos, a rider, cash and pay. Different object. |
| D5 | **Zones are circles**, centre + radius, radius validated 3–10 km, default 6 | Aggregator advice: 5–7 km. Circles are cheap to evaluate and an admin can draw one by typing a centre. Polygons later if needed. |
| D6 | Dispatch = **one offer at a time**, nearest eligible online rider in the job's zone, 45 s to accept *(placeholder)* | What Zomato/Swiggy do. Broadcasting to all riders creates a race, and losers learn to ignore pings. |
| D7 | **Polling first, FCM next** | FCM needs a Firebase project (config, not code). Online riders poll `/rider/offers/current` every 5 s from a foreground service. FCM data-message ring is milestone R6. Full-screen intents are **not available** to delivery apps on Android 14+ (Play revokes it) — we use a high-importance channel with a custom ring sound instead. |
| D8 | **COD cash is a ledger, never a counter** | `RiderCashEntry` rows (collected / deposit / payout deduction / adjustment); balance is computed from rows — same rule as rating aggregates (M15). |
| D9 | Cash settlement: **rider chooses** "deduct from payout" (default) or "I'll deposit" | User's brief. Either way, over the cash limit ⇒ no new COD offers (prepaid still allowed) — Zomato's model. |
| D10 | Deposit v1 = **UPI to company VPA + rider submits UTR → admin verifies**. Razorpay collect in R3b | Works with zero integration on day one. Razorpay test keys exist; adding `RazorpayOrderPurpose.rider_deposit` is a follow-up. |
| D11 | KYC documents go to a **private directory never served by nginx**, streamed only to admins | Aadhaar/DL/PAN photos under public `/uploads` (UUID-obscured) is not acceptable. |
| D12 | **Never store a full Aadhaar number.** Last 4 digits only; rider uploads a *masked* Aadhaar (first 8 digits hidden) | UIDAI rules for non-authorised entities. DigiLocker verification later. |
| D13 | The chef's pickup address is shown to **the assigned rider only, only while the job is active** (accepted → picked up) | This is a deliberate **third** surface for `VendorProfile.pickup*` (CLAUDE.md M36b names two). A rider cannot collect without it. It disappears from the rider's history once picked up. |
| D14 | Buyer phone is shown to the assigned rider only until delivered/failed. Call masking (Exotel/Knowlarity) in R6 | Riders must be able to call a customer who is not answering the door. Masking is a provider key. |
| D15 | Photos are **camera-only** (no gallery) for proofs, re-encoded and EXIF-stripped server-side like every upload | A gallery pick is not proof of anything. GPS from the phone is sent as separate fields, not left in EXIF. |

---

## 1. What competitors do (research summary)

Sources at the end. Items marked *(unverified)* came from secondary blogs.

**Onboarding (Swiggy/Zomato):** download → phone OTP → personal details →
upload Aadhaar, PAN, driving licence (bicycle riders exempt from DL/RC) →
bank details → selfie → pick zone → online training → kit (T-shirt, bag;
Zomato charges a refundable/one-time kit fee) → verification takes 2–5 days.
Emergency contact and vehicle RC are collected.

**Zones & shifts:** rider picks a home zone; logs in/out ("online"); shifts
and peak slots (lunch/dinner) pay more; orders ping only while online.

**Order flow:** ping with pickup distance + earnings + timer → accept →
navigate (Google Maps intent) → "arrived at restaurant" → order ID match →
"picked up" → navigate → "reached" → customer OTP (Zomato/Swiggy use
OTP on high-value / flagged orders) → mark delivered. Customer unreachable
flow: call, wait timer, then support-approved "undeliverable" → return.

**COD / floating cash (Zomato):** limit ≈ ₹1,000–1,500 for new riders,
₹2,000–3,000 for experienced *(unverified)*. Over the limit the app stops
COD pings (or pauses all), shows a restriction screen; paying via UPI
unblocks within seconds. Outstanding cash is **auto-deducted from the
weekly payout**. No office cash deposits in 2026 *(unverified)*.

**Earnings:** per-order base + distance + wait + surge/rain; weekly payout
with instant-withdraw option; earnings history per day/week.

**Support & safety:** Profile → Help → chat/call; SOS button; accident
insurance (Zomato: ₹10 L accident, ₹1 L medical — provided via insurer
partner). Rider rating by customers.

**Settings (union of both apps):** profile, language, documents, vehicle,
bank/UPI, zone change, ID card, notification sounds, referral, earnings
statements, insurance, T&C, privacy policy, help, delete account, logout.

**Law that binds us (not legal advice — get a lawyer to review §7):**
- **Social Security (Central) Rules, notified 8 May 2026**: aggregators
  register on the government portal, upload existing gig workers within 45
  days, report onboarding/exit in real time (or daily), refresh quarterly;
  contribute 1–2 % of turnover (capped at 5 % of payouts to workers).
  ⇒ we must export rider onboard/exit events. Built into the data model.
- **DPDP Act 2023**: notice + consent per purpose, right to access/correct/
  erase, grievance officer, breach notification. ⇒ consent timestamps per
  purpose, data-export and delete-request flows.
- **Google Play**: background location needs a prominent in-app disclosure
  *before* the OS prompt, a declaration form + video, and a
  `foregroundServiceType="location"` service; the store description must
  say location is collected when the app is closed.
- **Android 14+**: `USE_FULL_SCREEN_INTENT` is revoked for non-call/alarm
  apps, so the order ping must work as a heads-up notification.

---

## 2. Rider journeys

### 2.1 Onboarding (target: 8 minutes of typing, the rest is photos)

1. Language (English / हिंदी / ਪੰਜਾਬੀ) → phone OTP.
2. **Consents** (separate checkboxes, timestamped): Rider Agreement,
   Privacy Policy, location while on duty, background verification.
3. Personal: full name (as on Aadhaar), DOB (18+ enforced), gender
   (optional), email (optional), home address + pincode, languages spoken.
4. Emergency contact: name, relation, phone (≠ own phone).
5. Vehicle: bicycle / e-bike / scooter / motorcycle; registration number
   (not for bicycle); DL number + expiry (not for bicycle).
6. Identity: Aadhaar last 4 digits, PAN.
7. Bank: account holder name, account number (typed twice), IFSC; or UPI ID.
8. **Documents (camera):** selfie, masked Aadhaar front/back, PAN, DL
   front/back, RC, vehicle insurance, vehicle photo with plate, cancelled
   cheque/passbook. Required set depends on vehicle type.
9. Zone: map/list of zones, pick home zone.
10. T-shirt size (kit). → **Submit → "Under review"** screen with what
    happens next.

Admin reviews each document (approve / reject with reason, sent verbatim
— the M22 rule), then approves the rider. Rejected docs reopen just that
step in the app.

### 2.2 A shift

Home → **Go online** (disclosure first time → location permission →
battery-optimisation exemption prompt) → foreground notification "You're
online — Homekrafted is using your location" → waiting screen with today's
earnings, cash in hand, zone. Go offline any time unless mid-job.

### 2.3 A delivery

| Step | Rider sees | Rider does | Server records |
|---|---|---|---|
| Offer | pickup area + distance to pickup, drop area + distance, **pay**, COD amount if any, 45 s ring | Accept / Decline | `DeliveryOffer` |
| Go to pickup | kitchen name, **pickup address**, chef phone, map button | "Arrived at pickup" (must be ≤ 300 m, *placeholder*) | `arrivedPickupAt`, GPS |
| Pickup | order number, item count, pickup code to show chef | **Photo of parcel**; chef takes **handover photo** in seller app/portal | `DeliveryProof(pickup_rider)`, `(pickup_chef)` |
| Picked up | — | "Picked up" (requires rider photo) | `pickedUpAt`; `Order.status → shipped` + buyer message |
| Go to drop | buyer first name, address, instructions, call button, map | "Arrived" (≤ 300 m) | `arrivedDropAt` |
| Drop | COD amount in big type if COD | enter **4-digit delivery OTP** from buyer; confirm cash collected; **drop photo** | `DeliveryProof(drop)`, `RiderCashEntry(cod_collected)`, `deliveredAt`; `Order.status → delivered` |
| Can't deliver | — | call buyer → 10 min wait timer *(placeholder)* → "Customer unavailable" with photo of door | `failed_attempt`; support decides return |

Delivery OTP is minted when the job is created and shown to the buyer (order
page + WhatsApp/SMS). A delivery without OTP is possible only with an admin
override (the buyer lost their phone is real).

### 2.4 Cash & payouts

- **Cash in hand** card on home: balance, limit, bar.
- Over the limit ⇒ banner "Deposit ₹X to get cash orders again"; prepaid
  offers still arrive.
- **Deposit**: shows company UPI ID + QR + amount → rider pays in any UPI app
  → enters UTR → `pending` → admin verifies → balance drops.
- **Settlement preference**: "Deduct from my payout" / "I'll deposit".
  Weekly payout (Mon–Sun, paid Wednesday *placeholder*):
  `net = earnings + incentives + adjustments − (cash still in hand if
  deduct-mode, or cash older than 7 days in deposit-mode)`. A deduction is
  itself a ledger entry, so the balance and the payout explain each other.
  Negative net carries forward; never goes to the bank as a debit.
- Earnings tab: today / week, per-job breakdown (base, distance, wait,
  incentive), payout history with UTR.

### 2.5 Support, safety, settings

- **Help**: ticket categories (payment, cash, order issue, app problem,
  documents, accident, other) — reuse `SupportTicket` with a rider category;
  call support; FAQ.
- **SOS** (always one tap from the job screen): records GPS + job, alerts
  admins, offers dial 112 and emergency contact.
- **Settings**: profile, language, documents (status per doc, re-upload),
  vehicle change (re-verification), bank/UPI change (re-verification, payouts
  held until approved), zone change request, settlement preference,
  notification sound test, digital ID card, battery/permission health check,
  Rider Agreement, Privacy Policy, download my data, delete account request,
  logout.

---

## 3. Data model (Prisma)

```
enum UserRole          + rider
enum RiderStatus       applied | under_review | approved | rejected | suspended | deactivated
enum VehicleType       bicycle | ev_bike | scooter | motorcycle
enum RiderDocumentKind selfie | aadhaar_front | aadhaar_back | pan | dl_front | dl_back |
                       vehicle_rc | vehicle_insurance | vehicle_photo | bank_proof | police_verification
enum DocumentStatus    pending | approved | rejected
enum CashSettlementMode deduct_from_payout | deposit
enum DeliveryJobStatus unassigned | offered | accepted | at_pickup | picked_up | at_drop |
                       delivered | failed | returned | cancelled
enum DeliveryOfferStatus offered | accepted | declined | expired | withdrawn
enum DeliveryProofStage pickup_rider | pickup_chef | drop | failed_attempt
enum RiderCashEntryType cod_collected | deposit | payout_deduction | adjustment
enum RiderDepositStatus pending | verified | rejected
enum RiderPayoutStatus  pending | paid | rejected
enum SosStatus          open | acknowledged | resolved

DeliveryZone   id, name, city, centerLat, centerLng, radiusKm, isActive, timestamps
Rider          userId@unique, status, profile/emergency/vehicle/identity/bank fields,
               homeZoneId, isOnline, onlineSince, lastLat, lastLng, lastLocationAt,
               cashLimit, settlementMode, consent timestamps + versions, statusNote,
               approvedAt/ById, deliveredCount, rating, timestamps
RiderDocument  riderId, kind, storageKey (private), status, note, reviewedById/At  @@unique(riderId, kind)
DeliveryJob    jobNumber@unique, orderId, vendorId, addressId, zoneId?, riderId?, status,
               pickup/drop coords snapshot, distanceKm, codAmount, deliveryOtp,
               pay breakdown (basePay, distancePay, waitPay, incentivePay, totalPay),
               step timestamps, cancelReason, failureReason, timestamps
               @@unique(orderId, vendorId, addressId)
DeliveryOffer  jobId, riderId, status, offeredAt, expiresAt, respondedAt  @@unique(jobId, riderId)
DeliveryProof  jobId, stage, url, lat?, lng?, takenAt, uploadedById
RiderLocationPing riderId, jobId?, lat, lng, accuracyM?, speedMps?, recordedAt  (retain 30 days)
RiderCashEntry riderId, type, amount (signed), jobId?, depositId?, payoutId?, note, createdById?
RiderDeposit   riderId, amount, utr@unique, status, note, decidedById/At
RiderPayout    riderId, periodStart, periodEnd, earnings, cashDeducted, adjustments, net,
               status, reference, paidAt, decidedById
RiderSosEvent  riderId, jobId?, lat, lng, status, note, resolvedById/At
```

`Order`, `Vendor`, `Address`, `User` gain back-relations only. No existing
column changes meaning.

---

## 4. API surface

All `/api/v1`. `/rider/*` is `@Roles('rider')` at the class (added to
`rbac-structure.spec.ts`). A rider who is not `approved` may use only the
onboarding, documents, support and account routes.

**Rider**
```
GET    /rider/me                         profile + status + doc checklist + cash summary
PUT    /rider/me/application            onboarding fields (partial, step by step)
POST   /rider/me/consents                { agreementVersion, privacyVersion, location, bgv }
POST   /rider/me/submit                  applied → under_review (validates completeness)
POST   /rider/documents/:kind            multipart image → private store
GET    /rider/zones                      active zones
POST   /rider/duty                       { online: boolean, lat, lng }
POST   /rider/location                   batch of pings (≤ 50)
GET    /rider/offers/current             the one live offer, or null
POST   /rider/offers/:id/accept | decline
GET    /rider/jobs/active                current job with pickup/drop details
GET    /rider/jobs?page                  history (no addresses)
POST   /rider/jobs/:id/arrived-pickup    { lat, lng }
POST   /rider/jobs/:id/pickup-photo      multipart
POST   /rider/jobs/:id/picked-up
POST   /rider/jobs/:id/arrived-drop      { lat, lng }
POST   /rider/jobs/:id/drop-photo        multipart
POST   /rider/jobs/:id/deliver           { otp, cashCollected }
POST   /rider/jobs/:id/fail              { reason } (needs failed_attempt photo)
GET    /rider/cash                       balance, limit, entries
POST   /rider/cash/deposits              { amount, utr }
PUT    /rider/settlement-mode            { mode }
GET    /rider/earnings?from&to           per-job pay + payouts
POST   /rider/sos                        { lat, lng, jobId? }
```
**Seller:** `POST /seller/deliveries/:jobId/handover-photo`, `GET /seller/orders/:id/delivery`.
**Buyer:** delivery OTP + rider first name + status on `GET /orders/:id`.
**Admin** (`@RequireAdminScope('riders')` — new scope): zones CRUD; rider
queue, detail, document stream + approve/reject, approve/reject/suspend
rider, cash limit; deliveries list, create from order (manual dispatch),
reassign, cancel, override deliver; deposits verify/reject; payouts
generate/pay/reject; SOS queue; gig-worker onboarding/exit CSV export.

---

## 5. Rider app (`rider/`)

Expo SDK 57 + expo-router, Android build via EAS. Native modules:
`expo-location` + `expo-task-manager` (background updates with a
`location` foreground service), `expo-image-picker` (camera only),
`expo-image-manipulator` (resize to 1600px before upload), `expo-secure-store`,
`expo-notifications` (R6), `@tanstack/react-query`, `expo-linking` (maps
`google.navigation:q=lat,lng`, `tel:`), `expo-keep-awake` during a job.

```
app/
  _layout.tsx                 auth gate → (onboarding) | (app)
  login.tsx                   phone → OTP
  (onboarding)/               language, consents, personal, emergency, vehicle,
                              identity, bank, documents, zone, kit, review, status
  (app)/(tabs)/index.tsx      duty toggle, today, cash card, offer modal, active job
  (app)/(tabs)/earnings.tsx
  (app)/(tabs)/cash.tsx
  (app)/(tabs)/account.tsx    settings list
  (app)/job/[id].tsx          step screen (pickup → drop)
  (app)/help/, sos, documents, bank, vehicle, zone, id-card, legal/[doc]
src/api, src/auth, src/location (task + disclosure), src/camera, src/i18n, src/theme
```

Design: Homekrafted tokens (pine/gold/white-first), but **big targets for
gloves and sunlight**: 56 px primary buttons, 18 px body, one primary
action per screen, high contrast, works in Hindi/Punjabi.

---

## 6. Milestones

| ID | Scope | Depends on |
|---|---|---|
| **R1** | Schema + migration; `rider` role; zones; onboarding + consents + private KYC documents; admin rider review/approve; seed tricity zones | — |
| **R2** | Delivery jobs: create from order (admin), dispatch/offers with timeout, rider job lifecycle, geofence checks, proofs, delivery OTP, order status + buyer notifications, location pings | R1 |
| **R3** | Cash ledger, cash limit gating, UTR deposits + admin verify, settlement mode, weekly payout generation with deduction, admin pay | R2 |
| **R4** | SOS, support tickets for riders, account deletion/data export requests, gig-worker CSV export, legal pages (`/rider/terms`, `/rider/privacy` on the website — Play needs public URLs) | R1 |
| **R5** | Rider app: auth, onboarding, home/duty with background location, offers, job flow with camera, cash, earnings, account/settings, help/SOS, i18n (en/hi/pa) | R1–R4 APIs |
| **R6** | FCM ring + heads-up channel, call masking, Razorpay UPI deposit, admin web screens polish, Play Store: listing, data-safety form, background-location declaration video, internal → closed testing (Play requires 12 testers × 14 days for new personal accounts) | R5 |
| **W1** | Website: quick delivery for food at checkout (zone check against kitchen + buyer), COD at checkout with a per-order cap, live rider status on order page, seller handover photo in portal | R6 |

---

## 7. Legal documents (drafts ship with R4 — **lawyer review required before launch**)

**Rider Agreement** must cover: independent-contractor status (no
employment), eligibility (18+, valid DL for motor vehicles, own vehicle,
insurance, helmet), onboarding verification + consent to background check,
per-order fee schedule and that it may change with notice, weekly payouts
and TDS where applicable, **cash collected is held in trust for Homekrafted**,
cash limit, deposit timelines, deduction from payouts, consequences of
non-deposit; food-safety handling (closed bag, no tampering), conduct,
traffic law compliance, accident insurance (if/when provided) and claims,
deactivation grounds + notice + appeal, grievance redressal (named officer,
timelines), gig-worker social-security registration, data use (link to
privacy policy), limitation of liability, governing law (Chandigarh courts),
changes to terms.

**Rider Privacy Policy** must cover: data collected (identity docs, bank,
selfie, precise location **only while online/on a job**, photos, device
info, call logs are **not** collected), purposes, legal basis/consent under
DPDP, sharing (buyers see first name + live status; chefs see first name;
government portal for gig-worker registration; payment/insurance partners),
retention (location pings 30 days; KYC for the engagement + statutory
period; proofs 180 days), rights (access, correction, erasure, withdraw
consent, nominate), grievance officer contact, security, children (18+),
changes.

---

## 8. Open questions for the owner

1. Pay per delivery: base, per-km, wait pay, incentives? *(placeholders: ₹25 base, ₹6/km after 2 km, ₹1/min after 10 min wait)*
2. Default cash limit? *(placeholder ₹1,500 new, admin can raise)*
3. Payout day and whether instant withdrawal is offered.
4. Company UPI ID for deposits (and business bank account).
5. Zone centres: seeded as Chandigarh Central, Chandigarh South, Manimajra,
   Mohali, Kharar, Panchkula, Zirakpur at 6 km — correct them in admin.
6. Kit (T-shirt/bag): free, fee, or refundable deposit?
7. Insurance partner (accident cover is expected by riders and by the 2026 rules).
8. Google Play developer account: organisation account (needs D-U-N-S) — who owns it?
9. Firebase project for push (R6) and Exotel/Knowlarity for call masking.
10. Police verification: required at onboarding or within 30 days?

---

## Sources

- Zomato floating cash limits and auto-deduction — https://alphareach.tech/blog/zomato-floating-cash-limit/
- Swiggy delivery partner onboarding — https://alphareach.tech/blog/swiggy-delivery-partner-job/ , https://www.registrationwala.com/knowledge-base/post/learning/how-to-become-swiggy-delivery-partner
- Swiggy Delivery Partner on Play — https://play.google.com/store/apps/details?id=in.swiggy.deliveryapp
- Zomato Delivery Partner FAQ (insurance, support path) — https://zomatodeliverypartner.com/faq.html
- Play background location policy — https://support.google.com/googleplay/android-developer/answer/9799150
- Play sensitive permissions — https://support.google.com/googleplay/android-developer/answer/16558241
- Full-screen intent limits (Android 14) — https://source.android.com/docs/core/permissions/fsi-limits , https://support.google.com/googleplay/android-developer/answer/13392821
- Social Security Code gig-worker obligations — https://www.indianhrm.com/guides/gig-workers-social-security-code , https://amlegals.com/platform-economy-under-scrutiny-analysing-social-security-compliance-for-gig-workers-in-india/
- Karnataka Platform-Based Gig Workers Act 2025 — https://prsindia.org/bills/states/the-karnataka-platform-based-gig-workers-social-security-and-welfare-bill-2025

---

## 9. Standing blocker the app cannot code around

**Riders sign in by SMS OTP, and no SMS provider is configured**
(`docs/LAUNCH-READINESS.md`). On production today an OTP reaches nobody and
`OTP_TEST_PHONES` is empty. Before the first external rider installs the
app, one of these must exist: an SMS provider with **DLT-registered** sender
+ template (MSG91/Twilio India), or WhatsApp Cloud API OTP (the WhatsApp
module exists; needs an approved authentication template). Until then,
internal testers go on `OTP_TEST_PHONES` — **never** add rider numbers
permanently (CLAUDE.md M18: that list is an auth bypass).

---

## 10. Milestone briefs (for the building agents)

Every brief assumes the builder has read `CLAUDE.md`, this file, and — for
`rider/` — `docs/APP.md` §6–7. Build exactly the brief; do not start the
next milestone. Report back: files changed, decisions needing confirmation,
test output verbatim.

### Cross-cutting rules (all milestones)

- **Money is `Decimal` in Postgres and integer paise or `Prisma.Decimal` in
  code.** Never JS float arithmetic on rupees.
- **Aggregates are computed from rows** (cash balance, delivered count,
  earnings). Never increment a column and trust it.
- **No clock reads inside pure functions** (`dispatch.ts`, `rider-pay.ts`,
  `cash-limit.ts` take `now`). CLAUDE.md M12 rule.
- **Every state transition is one guarded `updateMany where status = from`**
  and checks `count === 1`, so two taps / two riders cannot both win.
- **A refusal carries a sentence** saying what to do next (400/409 with a
  message the app shows verbatim). Never a bare 403 for a business rule.
- **No `catch { return undefined }` on a write**, server or app (M36 rule).
- **Addresses:** a rider sees the pickup address and buyer address/phone
  **only** for a job they hold in `accepted | at_pickup` (pickup) and
  `picked_up | at_drop` (drop). History responses carry area labels only.
  Add a structural spec, `test/unit/rider-address-privacy.spec.ts`, that
  fails if `rider-jobs.mapper.ts` reads `pickup*` outside the active-job
  mapper. Update CLAUDE.md's M36b paragraph: **three** surfaces now.
- **Audit** every admin write in `AdminAuditLog` (existing service).
- Docs upkeep per CLAUDE.md table: `docs/API.md`, `docs/DATA-MODEL.md`,
  `CHANGELOG.md` entry per milestone, `docs/TESTING.md` for anything
  clickable.

### R1 — Riders exist (server)

**Schema** (one migration, `prisma/migrations/2026091412xxxx_rider_fleet`):
everything in §3, all enums, **including R2/R3 tables** so the model lands
once. Generate SQL with `prisma migrate diff --from-migrations
./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma
--shadow-database-url <scratch db> --script` against a **scratch** database
(`createdb hk_scratch_rider`) — the local dev DB has diverged from
migrations (memory: local-dev-db-lineage). Add `AdminScope.riders`; the
migration must **backfill every existing admin with `riders`** (M47 rule:
empty means nothing, and existing full admins must not lose the section).

Field details for `Rider` (all nullable until submit unless noted):
`fullName, dateOfBirth (Date), gender?, email?, homeLine1, homeLine2?,
homeCity, homePincode, languages String[], emergencyName, emergencyRelation,
emergencyPhone, vehicleType, vehicleNumber?, dlNumber?, dlExpiry?,
aadhaarLast4 (Char(4)), panNumber?, bankAccountName?, bankAccountNumber?,
bankIfsc?, upiId?, tshirtSize?, homeZoneId?, status (default applied),
statusNote?, submittedAt?, approvedAt?, approvedById?, cashLimit Decimal
default 1500, settlementMode default deduct_from_payout, isOnline default
false, onlineSince?, lastLat?, lastLng?, lastLocationAt?,
agreementVersion?, agreementAcceptedAt?, privacyVersion?,
privacyAcceptedAt?, locationConsentAt?, bgvConsentAt?,
deletionRequestedAt?, govRegisteredAt?, exitedAt?`.

**Enrolment** — `src/rider/rider-enrolment.controller.ts`,
`POST /rider-enrolment` with `@Roles('consumer', 'rider')`: creates the
`Rider` row for the caller, flips `User.role` consumer → rider, returns a
**fresh token pair** (role is a JWT claim; reuse `AuthService`'s signer via
a new public method). Idempotent for an existing rider. A `seller` or
`admin` account gets **409** "This number already has a HomeKrafter/admin
account — use a different number to ride." Allowlist this file in
`rbac-structure.spec.ts` with that reason; add a new assertion that every
other `src/rider/*.controller.ts` has `@Roles('rider')` at the class.

**Onboarding API** (`rider.controller.ts`, `@Roles('rider')`): `GET
/rider/me`, `PUT /rider/me/application` (partial; DTO validation: 18+ from
DOB, 6-digit pincode, Indian mobile for emergency ≠ own phone, vehicle
number `^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$` after uppercase/strip spaces, PAN
`^[A-Z]{5}\d{4}[A-Z]$`, IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, Aadhaar **exactly 4
digits** — reject 12-digit input with "Only the last 4 digits"; editable
only while `applied | rejected`), `POST /rider/me/consents`, `POST
/rider/me/submit` (validates completeness **and** required documents per
vehicle type: all need selfie, aadhaar_front, aadhaar_back, pan,
bank_proof; motor vehicles also dl_front, dl_back, vehicle_rc,
vehicle_insurance, vehicle_photo; `ev_bike` under 250 W needs no DL/RC —
treat `ev_bike` like bicycle and say so in a comment; returns a list of
missing items as a 400 body `{ message, missing: string[] }`), `GET
/rider/zones`.

**Private documents** — `src/rider/rider-documents.service.ts`: `POST
/rider/documents/:kind` multipart, reuse `sniffImage` + `processImage`
from uploads (same EXIF strip), write to `RIDER_KYC_DIR` (config, default
`/var/lib/homekrafted/private/rider-kyc`, dev default `./.private/rider-kyc`
gitignored) at `<riderId>/<kind>-<uuid>.webp`; upsert `RiderDocument`
(re-upload resets to `pending`, deletes the old file). **No URL is ever
returned** — only `{ kind, status, uploadedAt }`. Path built from ids only.

**Zones** — `src/admin/riders/zones.controller.ts` (`@Roles('admin')`,
`@RequireAdminScope('riders')`): list/create/update (radius 3–10, lat
29–32, lng 75–78 for now with a comment that it is a tricity sanity
bound). Seed script `prisma/seed-rider-zones.ts` (additive, idempotent by
name): Chandigarh Central (Sector 17), Chandigarh South (Sector 43),
Manimajra, Mohali (Phase 7), Kharar, Panchkula (Sector 9), Zirakpur (VIP
Road) — coordinates from `server/src/common/geo.ts` `TRICITY_AREAS`, 6 km.
Pure `zoneFor(point, zones)` in `src/rider/zones.ts` → nearest zone whose
circle contains the point, else null.

**Admin review** — `src/admin/riders/riders.controller.ts`: `GET
/admin/riders?status&zoneId&page` (default filter `under_review`, counts
summary from server), `GET /admin/riders/:id` (all fields; bank account
masked to last 4 unless `?reveal=bank` which is audited), `GET
/admin/riders/:id/documents/:kind/file` (streams the webp,
`Cache-Control: no-store`, audited `rider.document_view`), `PATCH
/admin/riders/:id/documents/:kind` `{ status, note }` (reject requires
note), `POST /admin/riders/:id/approve` (requires all required docs
approved; sets `approvedAt/ById`), `POST .../reject` `{ reason }`, `POST
.../suspend` `{ reason }` (also forces offline), `POST .../reinstate`,
`PATCH .../cash-limit` `{ amount }` (0–20000). Rider is notified of
approve/reject/doc-reject through `NotificationsDeliveryService`
(`account` category), reason verbatim.

**Tests:** unit — validators, `zoneFor`, required-docs-by-vehicle, rbac
structure; e2e (`test/e2e/rider-onboarding.e2e-spec.ts`) — consumer enrols
→ token role rider → fills application → uploads docs (tiny fixture
image) → submit refused with missing list → complete → submit → admin
approves docs → approve; seller enrol → 409; rider cannot fetch document
file; admin without `riders` scope → 403; no response body anywhere
contains a document path.

**DoD:** `npm run typecheck && npm run lint:check && npm test` green;
e2e for rider specs green against a scratch `TEST_DATABASE_URL`;
`prisma:check-drift` clean; docs updated; `.private/` gitignored.

### R2 — Deliveries move (server)

**Pure modules** (unit-tested with hand-computed numbers):
- `rider-pay.ts`: `payFor({ distanceKm, waitMinutes, settings })` →
  `{ basePay, distancePay, waitPay, totalPay }` in paise. Defaults from
  `PlatformSetting` keys `rider.basePay`=2500, `rider.perKm`=600,
  `rider.freeKm`=2, `rider.waitPerMin`=100, `rider.freeWaitMin`=10.
  Distance billed in whole 0.1 km, rounded half-up.
- `dispatch.ts`: `rankCandidates({ job, riders, now, settings })` → eligible
  = approved, online, `lastLocationAt` within 120 s, no active job, not
  previously offered this job, and (if `codAmount > 0`) `cashBalance +
  codAmount <= cashLimit`; within the job's zone circle **or** home zone =
  job zone; sorted by straight-line distance to pickup, ties by fewest
  deliveries today (spread the work).
- `geofence.ts`: `withinMetres(a, b, m)`; `rider.arriveRadiusM` = 300.

**Job creation** — `DeliveryJobsService.createForOrder(orderId, vendorId,
{ actor })`: snapshot pickup coords from `Vendor.lat/lng` (**precise**,
server-side only), drop coords from `Address.lat/lng` (if null → 400 "This
address has no map pin; ask the buyer to pin it or deliver by hand"),
`zoneId = zoneFor(pickup)`, `distanceKm` haversine × 1.3 road factor
(comment: straight-line undercounts city roads; replace with a routing API
later), `codAmount` = order total − walletApplied when `paymentMethod ===
cod` (split per vendor by that vendor's line subtotal share, rounded to
the rupee, last vendor takes the remainder), `deliveryOtp` = 4 random
digits (crypto), `jobNumber` `HKD-<yymmdd>-<base36>`. Idempotent on the
unique key. Admin route `POST /admin/deliveries { orderId, vendorId }`
(scope `orders`). **Not** wired to seller "packed" yet — that is W1.

**Dispatcher** — `DispatchService` with a `setInterval` tick every 5 s
(disabled when `RIDER_DISPATCH_ENABLED !== 'true'`, like Shadowfax; e2e
calls `tick(now)` directly): expire offers past `expiresAt` (→ `expired`,
job back to `unassigned`), then for each `unassigned` job create an offer
for the top candidate with `expiresAt = now + rider.offerTimeoutSec (45)`.
A job with no candidate for `rider.unassignedAlertMin` (10) raises an admin
notification once. Offer accept: guarded update offer `offered →
accepted` **and** job `offered → accepted` with `riderId` in one
transaction; decline → `declined`, job `unassigned`, next tick re-offers.

**Rider job routes** (§4): each transition checks ownership, from-state,
geofence where noted (refusal names the distance: "You are 1.2 km from the
kitchen — tap Arrived when you are there"), required proof present
(`pickup_rider` before `picked-up`, `drop` before `deliver`,
`failed_attempt` before `fail`). `deliver` compares OTP in constant time;
5 wrong attempts lock the job to support (`failureReason`). Proof photos
use the **public** upload pipeline under a new purpose `delivery` (they are
shown to buyer/chef/admin in disputes) — add to both purpose lists.
`picked-up` → `Order.status` `shipped` (only when every job of the order
is at least picked up), `deliver` → `delivered` + `deliveredAt` (only when
every job delivered) — always via `OrderNotificationsService`, `void`ed.
Reuse the mixed-basket lesson: an order line not covered by any job
blocks the order status change, same as `reconcileOrderStatus`.

**Location** — `POST /rider/duty` (going online requires approved, no
open cash block on *all* orders — COD block only filters offers — and a
fix; going offline refused while holding a job), `POST /rider/location`
(≤ 50 pings, drop points older than 10 min or with accuracy > 100 m,
update `lastLat/lng/At` from the newest). A daily purge of pings older
than 30 days runs on the dispatcher's interval (once per hour check).

**Seller + buyer** — `POST /seller/deliveries/:jobId/handover-photo`
(seller owns vendor, job in `at_pickup | accepted`), `GET
/seller/orders/:id/delivery` (rider first name, status, vehicle type — no
rider phone). Buyer `GET /orders/:id` gains `delivery: { status,
riderFirstName, otp }` where otp is shown only before delivered.

**Admin** — `GET /admin/deliveries?status`, `GET /admin/deliveries/:id`
(proofs, offer history, pings for the job), `POST .../reassign {
riderId? }` (withdraws live offer / removes rider, back to unassigned or
direct-assigns), `POST .../cancel { reason }`, `POST .../override-deliver
{ reason }`.

**Tests:** unit — pay table (e.g. 5.34 km, 13 min wait = 2500 + 3.3×600
rounded + 3×100 = 4780 paise), ranking, geofence, otp lockout; e2e — full
happy path COD order: create job → tick → offer to nearest of two riders →
decline → tick → second rider → accept → arrive too far refused → arrive →
picked-up refused without photo → photo → picked up (order shipped) →
deliver wrong otp → right otp → order delivered, `RiderCashEntry
cod_collected` written, pay computed; two concurrent accepts → one wins;
history response contains no pickup line.

### R3 — Cash and payouts (server)

- `cash-ledger.ts` pure: `balanceOf(entries)`, `isCodBlocked(balance,
  limit)`. Sign convention: `cod_collected` positive (rider owes us),
  `deposit` and `payout_deduction` negative, `adjustment` either.
- `POST /rider/cash/deposits { amount, utr }` — UTR 12 digits (UPI RRN),
  unique; amount ≤ balance; creates `pending` deposit **without** a ledger
  entry. Admin `GET /admin/rider-deposits?status`, `POST .../:id/verify`
  (writes `deposit` entry in the same transaction), `POST .../:id/reject {
  reason }`. Scope `finance`. Idempotency key on verify.
- `GET /rider/cash` → `{ balance, limit, codBlocked, pendingDeposits,
  entries(page), companyUpiId }` (`rider.companyUpiId` setting; null → the
  app hides the pay button and says "Ask support how to deposit").
- `PUT /rider/settlement-mode`.
- Payouts: `POST /admin/rider-payouts/generate { periodStart, periodEnd }`
  (scope `finance`, idempotent per rider+period) → per approved rider:
  earnings = Σ `totalPay` of jobs delivered in period; deduction =
  `deduct_from_payout` ? min(balance, earnings) : min(balance of entries
  older than 7 days, earnings); writes `payout_deduction` entry +
  `RiderPayout` in one transaction; skips zero rows. `POST .../:id/pay {
  reference }`, `POST .../:id/reject { reason }` (reverses the deduction
  entry with an `adjustment`). Rider `GET /rider/earnings?from&to`.
- **Tests:** ledger math, generate twice = one payout, deduction capped at
  earnings, reject restores balance, blocked rider receives prepaid offers
  but not COD offers (e2e through `tick`).

### R4 — Safety, support, compliance (server + web)

- `POST /rider/sos` → `RiderSosEvent` + admin notification (all admins
  with `support` scope, every channel) + response includes emergency
  contact phone for the app to dial. Admin SOS queue acknowledge/resolve.
- Support: add `SupportTicket.category String?` (migration) and allow
  riders on existing `/support` routes; rider categories enumerated in DTO.
- `POST /rider/me/deletion-request` (sets `deletionRequestedAt`, forces
  offline, refused while cash balance > 0 with the amount in the sentence);
  `GET /rider/me/export` (JSON of their own data, no other person's data).
- `GET /admin/riders/export/gig-registry?from&to` CSV of onboard (approvedAt)
  and exit (`exitedAt`/deactivation) events with name, DOB, gender, phone,
  Aadhaar last 4, vehicle, zone — the fields the government portal asks for
  (mark the column set as "verify against the portal's upload template").
- Web: `client/app/rider/terms/page.tsx` and `client/app/rider/privacy/page.tsx`
  (public, in sitemap, `pageMetadata`), drafted from §7 with a visible
  version + effective date, and a banner comment in source "Draft — requires
  legal review before public launch" (not visible to users). Versions
  exported as constants the server's consent DTO validates against
  (`RIDER_AGREEMENT_VERSION`, `RIDER_PRIVACY_VERSION`, mirrored in server
  config). Also `client/app/rider/page.tsx` — a "Ride with Homekrafted"
  recruitment page with the Play Store link placeholder.
- Admin web screens (portal kit, CLAUDE.md "The portal kit"): Riders queue +
  detail with document viewer, Zones, Deliveries, Deposits, Rider payouts,
  SOS. Add `riders` to `AdminShell` nav with the scope map.

### R5 — The rider app (`rider/`)

Built against the §4 contract. Split into three sub-briefs so each is
reviewable:

**R5a — Shell, auth, onboarding.** `npx create-expo-app rider --template
blank-typescript` then match `mobile/`'s SDK 57 versions exactly
(`npx expo install`). `app.json`: name "Homekrafted Rider", package
`in.homekrafted.rider`, scheme `hkrider`, orientation portrait, permissions
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`,
`WAKE_LOCK`; `blockedPermissions` for `READ_MEDIA_IMAGES`,
`READ_EXTERNAL_STORAGE`, `RECORD_AUDIO` (camera-only proofs; smaller Play
declaration). `expo-location` plugin with `isAndroidBackgroundLocationEnabled`
and `isAndroidForegroundServiceEnabled`. `eas.json` with `development`,
`preview` (APK, internal) and `production` (AAB) profiles, API URL env.
Theme: generate from `client/styles/tokens.css` + `tokens.extend.css` the
way `mobile/scripts/generate-theme.mjs` does (copy the script, point it at
`rider/src/theme`). Fonts: Fraunces for display, Hanken Grotesk body (it was IBM Plex Sans
until 2026-09-16).
`src/api/http.ts`: fetch wrapper, bearer from SecureStore, refresh on 401
once, `ApiError { status, message, body }`, **network failure is not a
sign-out** (CLAUDE.md 2026-09-06 rule), 15 s timeout. `src/i18n`: tiny
key → { en, hi, pa } table + `useT()`, language persisted; ship en + hi
complete, pa for onboarding + job flow at minimum, English fallback.
Screens: language → phone → OTP → enrol (`POST /rider-enrolment`, store
new tokens) → onboarding steps (§2.1), each a screen saving with `PUT
/rider/me/application` so a rider can quit and resume; document capture
screen with a guide overlay per kind (frame the card, no glare), camera via
`ImagePicker.launchCameraAsync({ quality: 0.8 })` then
`ImageManipulator` resize longest edge 1600 → upload multipart; review
screen listing missing items from the server's 400; status screen (under
review / rejected with reason and "fix" buttons). Components: `Screen`,
`Text`, `Button` (56 px, primary/secondary/danger), `Field` (18 px input,
label above, error below), `StepHeader` (step x of y), `Notice`,
`PhotoTile`. Tests (jest-expo): validators, http refresh-once, i18n
fallback, onboarding resumes at the first incomplete step.

**R5b — Duty, offers, job flow.** Home tab (duty toggle, today's pay +
jobs, cash card, zone). Background location: `src/location/task.ts`
registers `TaskManager.defineTask` at module scope in the entry file;
`startLocationUpdatesAsync` with `accuracy: High`, `timeInterval: 10000`,
`distanceInterval: 25`, `foregroundService: { notificationTitle: "You're
online", notificationBody: "Homekrafted Rider is using your location to
send you nearby orders", killServiceOnDestroy: false }`; queue pings in
AsyncStorage and flush in batches ≤ 50; stop on offline. **Prominent
disclosure screen** before requesting background permission — full-screen,
states exactly what is collected, when (only while online or on a job), why
(nearby orders, arrival checks, customer ETA, safety), and that it stops
when offline; buttons "Continue" / "Not now". Permission health check
(location always, notifications, battery optimisation via
`IntentLauncher` to `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` settings).
Offers: while online poll `/rider/offers/current` every 5 s (React Query,
`refetchIntervalInBackground: true`), full-screen modal with countdown
ring, pickup/drop areas and distances, pay, COD badge, Accept (big) /
Decline; play a looping ring (`expo-audio`, bundled asset) and vibrate
until answered/expired. Job screen `app/job/[id].tsx`: a vertical stepper
driven by `job.status`; each step one primary action; "Navigate" opens
`google.navigation:q=lat,lng` falling back to a geo URL; "Call" `tel:`;
camera steps; OTP entry (4 large boxes, numeric keyboard); COD confirm
("I have collected ₹640 in cash" checkbox); can't-deliver flow with a 10
min timer shown after the first call attempt; SOS button pinned top-right.
`expo-keep-awake` during a job. Offline queue for transitions is **not**
built — if a request fails the button shows the server/network sentence
and a retry (a queued "delivered" that lands an hour later is worse).

**R5c — Money, account, help.** Earnings tab (today/week segmented, per-job
rows with pay breakdown, payouts with UTR). Cash tab (balance vs limit
bar, blocked banner, deposit sheet: amount, company UPI ID with copy +
`upi://pay?pa=…&pn=Homekrafted&am=…&cu=INR&tn=Cash%20deposit` intent, UTR
entry; pending deposits; ledger list; settlement mode toggle with an
explanation of each). Account tab: profile, digital ID card (photo = selfie
is **not** returned by API — show name, rider ID, zone, vehicle, status,
QR of rider ID), documents (status per kind, re-upload), vehicle, bank/UPI
(masked), zone change request (support ticket), language, notification
sound test, permission health, help (FAQ + tickets + call support), legal
(open `https://homekrafted.in/rider/terms` and `/privacy` in an in-app
browser), download my data, delete account, logout.

**R5 DoD:** `npm run typecheck && npm run lint && npm test` green; `npx
expo-doctor` clean; `eas build -p android --profile preview` config valid
(`npx expo prebuild -p android --no-install` succeeds and the generated
manifest contains the foreground service type `location`); screenshots of
every screen from an Android emulator against a local server with
`RIDER_DISPATCH_ENABLED=true`; `docs/APP.md` gains a short "`rider/` is a
second app" section and `docs/RIDER-APP.md` a run guide.

### R6 — Production readiness

FCM via `expo-notifications` (data message `offer`, Android channel
`offers` importance MAX with custom sound; server `PushService` using
`firebase-admin`, env-gated like every provider — no key = logged stub);
store `RiderDevice { riderId, expoPushToken|fcmToken, platform,
lastSeenAt }`. Call masking provider (env-gated). Razorpay UPI deposit
(`RazorpayOrderPurpose.rider_deposit`, webhook writes the `deposit` entry).
Play Store: listing copy with the location sentence, data-safety answers
(precise location, photos, name, phone, financial info, government ID —
collected, not shared except as §7), background-location declaration with
a 30 s video of disclosure → online → offer, content rating, target API per
current Play requirement, closed testing track.

### W1 — Website quick delivery (after R6)

Checkout offers "Quick delivery by a Homekrafted rider" for food lines when
kitchen pin and buyer pin are in an active zone and within the kitchen's
radius; COD for those orders up to `rider.codOrderCap` (placeholder ₹1,500);
seller "packed" creates the job automatically; order page shows rider
status and the delivery OTP; seller portal gets the handover photo button.
Courier (gifts) path unchanged.
