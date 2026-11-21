# Rider fleet

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Rider fleet (R1–R5, 2026-09-14 → 09-25) — own delivery partners

Plan, decisions and per-milestone briefs: **`docs/RIDER-APP.md`**.

| | Scope | State, 2026-09-25 |
|---|---|---|
| R1–R3 | riders, KYC, zones · deliveries, dispatch, proofs · cash, deposits, payouts | server built |
| R4 | SOS, rider support, DPDP deletion + export, gig-worker registry, `/rider*` legal pages, the admin fleet screens | server, web and app wiring built — **uncommitted, not deployed** |
| R5a–c | the rider app | committed (`7bfb4eb`); its R4 wiring is not |
| R7 | H3 zones — cell editor, cell-aware dispatch behind `RIDER_ZONES_H3` (off) | server + admin web built, committed 2026-09-26, **not deployed** |
| R6a | push for riders (FCM sender, device registry, three triggers, the app's channel), the honest-words pass a Play review forced, `/rider/delete-account`, `docs/RIDER-PLAY-LISTING.md` | built, committed 2026-09-26, **not deployed**; real FCM and a real phone never exercised |
| R6b · W1 | call masking, live UPI deposit, the Firebase project + device proof, Play submission · website quick delivery | not built |

R4's one migration, `20260925100000_rider_safety_support`, is additive
(`RiderSosEvent.lat/lng` nullable, `acknowledgedById/At`,
`SupportTicket.category`; nothing backfilled). It needs the owner's go-ahead
and a backup **in the turn it ships**, and runs before the API restarts.
R1–R3's are dated `20260914*`, sorting *before* the `20260919*` ones
production has: `migrate deploy` applies any unapplied migration whatever its
date, but the box's lineage check must confirm which rider tables it holds.

The app is a **second Expo project, `rider/`** (`in.homekrafted.rider`), not a
mode of `mobile/` (background location puts a listing under Play's
sensitive-permission review), and it compiles none of `client/lib`: its own API
client and theme, `en`/`hi` copy, `pa` where `i18n.spec.ts` requires it. Riders
cannot sign in on production: **no SMS provider is wired to the OTP**
(`TWILIO_*` is set and has never sent a message) — config, not code.

- **Enrolment flips `consumer` → `rider` and re-issues tokens**
  (`POST /rider-enrolment`); no `@Roles` on purpose, so a seller or admin gets
  the 409 sentence, not a bare 403. Every other `src/rider` controller is
  `@Roles('rider')` at the class (`rbac-structure.spec.ts`).
- **KYC photos never touch `/uploads`**: re-encoded, written to
  `RIDER_KYC_DIR` (not served by nginx), never a path in a response, read by
  admins through an audited `no-store` stream. **Only the last 4 digits of the
  *typed* Aadhaar number are stored; the card photographs are kept as taken and
  nothing masks them** — the policy and the app ask the rider to cover the
  first 8 digits, the reviewer's row says to reject a card that shows more.
  Never reword it as "masked".
- **A zone is a set of H3 hexagons, and circles still decide until
  `RIDER_ZONES_H3` is on (R7, built 2026-09-26, off).** Read `docs/RIDER-APP.md`
  §3a and "R7 — as built". D5's "zones are circles" is superseded but **true while
  the flag is off, which is the default**; the circle columns stay (the map's
  opening view, the starter set, and the deciding geometry until the flip).
  `DispatchService` **fails open** on an unzoned pickup either way, so a job in a
  gap is dispatched, not stuck — and the admin coverage panel lists it. Easy to
  undo: **`h3-js` has one import site, `src/rider/h3.ts`**, is server-only (banned in
  `client/lib` and absent from `client/`, `mobile/`, `rider/` manifests;
  `h3-import-boundary.spec.ts` and `shared-boundary.spec.ts`), and **never
  `gridRingUnsafe`**; **a cell id is a 15-character string, never a number, and no
  screen or sentence shows one** (the editor names a cell by the nearest landmark);
  **keep BOTH eligibility tests** — home zone **and** live cell — or a rider loses
  offers on a bad fix; **a cell belongs to one zone** (a second claim is a 409 naming
  the holder) **and a closed zone keeps its cells**; **adjacency is not an ETA** —
  spillover decides who may be offered (in-zone riders first), ranking stays
  haversine × `ROAD_FACTOR`; **hexagons order supply, never gate a buyer**. Cell
  columns are caches (readers compute from lat/lng when one is NULL) and are written
  whichever way the flag is set; shadow mode compares circles and cells every tick.
  The migration, the operator-run `prisma/backfill-zone-cells.ts` and the flip order
  are in `docs/DEPLOY.md` "R7 ships with".
- **D6's offer loop is `DispatchService`, off by default
  (`RIDER_DISPATCH_ENABLED`)**: one offer at a time to the nearest eligible
  online rider, 45 s to accept, then back to `unassigned`.
  `POST /admin/deliveries` (manual despatch) works regardless of the flag.
- **The buyer's delivery OTP never reaches the rider's app.** Minted at job
  creation, shown on the buyer's order page (a WhatsApp/SMS copy is unbuilt);
  the rider types what the buyer reads out. 5 wrong guesses lock the job to
  support (`otp-lock.ts`); the comparison is constant-time.
- **A rider's cash is a ledger, and a pending deposit is already paid (R3).**
  `RiderCashEntry` rows only (`cash-ledger.ts`), never a counter (M15).
  `deductionFor` subtracts **pending** deposits before a payout deducts
  anything, and the 7-day grace counts cash *collected* in the window, not the
  balance's age — both were wrong in review and charged a rider ₹500 twice.
- **A fleet job pushes its order forward only when it covers every line of
  it** (`DeliveryOrderReconcileService`, the M57 shape).
- **A rider sees the pickup address and the buyer's address/phone only for a
  job they hold in the right window** (`accepted`/`at_pickup`, then
  `picked_up`/`at_drop`) — the **third** surface for `VendorProfile.pickup*`.
  One function, `rider-jobs.mapper.ts#mapActiveJobForRider`;
  `rider-address-privacy.spec.ts` fails the build on a read anywhere else.

**R6a — rules that are easy to undo**

- **A lock screen is a public surface.** A push carries a job number, an id or a time — never an address, a name, a
  phone, an amount or a code (`rider-push.ts` is pure and a structural spec fails the build if it reads
  `pickup*`/`drop*`/`phone`/`address`/`vendor`/`recipient`/`deliveryOtp`/`codAmount`/`totalPay`). English only.
- **A push is `void`, after the commit, and swallows every failure.** It must never slow the dispatch tick or fail an
  assignment or a cancel; the 5-second poll is the fallback and is **never removed**. `FcmClient` is the seam tests
  replace; no `FCM_SERVICE_ACCOUNT_FILE` is a logged stub (a supported state), a broken one is one ERROR at boot.
- **A device row is deleted only on an FCM answer that names the token** (`UNREGISTERED`, or a 400 whose field violation
  is `message.token`). A bare 404 is also what a wrong project id looks like; treating it as a dead token wipes every
  registration on a misconfigured box.
- **A push token is a credential-shaped identifier:** never returned, exported, audited or logged in full.
  `deactivate` removes a rider's devices; a deletion *request* keeps them.
- **Rider push ignores `NotificationPreference`** (`docs/NOTIFICATIONS.md` §3, decision D22 — an operational alert, not a
  category). **Never add a rider push that carries PII "because it is useful".**
- **Android freezes a notification channel's sound and importance once it exists** — change either by creating
  `offers_v2`, never by editing `offers`. **Android raw-resource names allow only `a-z 0-9 _`**, so the channel's ring is
  `offer_ring.wav`, not `offer-ring.wav`. `google-services.json` enters the build only through the `GOOGLE_SERVICES_JSON`
  EAS file secret (`app.config.js`); a hardcoded path that is absent breaks `expo prebuild` for everyone.
- **No location runtime prompt may precede the disclosure, on any path** — `requestForegroundPermission` /
  `requestBackgroundPermission` refuse until an acceptance is recorded and a structural spec bans any other caller. The
  disclosure says only what the product does (**never "buyers can see your ETA"** — no buyer surface shows a position).
- **The words follow the product, not the other way round.** A Play review found the privacy draft claiming location
  "recorded with proof photos" (`DeliveryProof.lat/lng` exist and are never written), location used "to show buyers the
  status", and a consent-withdrawal control that does not exist. Both legal versions are `2026-09-26.1`. **Nothing erases
  anything yet** (`deactivate` deletes nothing; no runbook backs privacy §7 or agreement §12), and `/rider/delete-account`
  deliberately promises no timeline, retention period or identity check. Reviewer access for Play without SMS is an owner
  decision (`docs/RIDER-PLAY-LISTING.md` §7); do not leave `OTP_TEST_*` on for a rider number.

**R4 — rules that are easy to undo**

- **Consent versions are constants, and a stale one is a 400.**
  `server/src/rider/legal-versions.ts` is what `POST /rider/me/consents` checks
  and `GET /rider/legal` serves; the app hardcodes none (it once posted
  `draft-2026-09-14`). `client/lib/rider-legal/versions.ts` is mirrored by hand
  and `rider-legal-parity.spec.ts` fails if one side moves alone. The documents
  are **our drafts pending legal review**, not the client's sixteen.
- **The privacy text names a retention period only where a job deletes on that
  schedule.** Pings: 30 days, `RiderLocationRetentionService`, its own timer and
  **no dispatch flag** (it once rode the dispatcher's tick, off everywhere);
  `rider-legal.spec.ts` reads `PING_RETENTION_DAYS` from the server. Proof
  photos: no period — nothing purges them.
- **A safety route never refuses over an optional field and never checks
  `RiderStatus`.** `POST /rider/sos` is `@Roles('rider')` and nothing narrower
  (`rbac-structure.spec.ts`); `lat`/`lng`/`jobId` are `unknown` on the DTO and
  cleaned in `sos.ts` (0,0, out of range, half a pair → no position; a job not
  theirs → dropped); the row commits before anyone is told. A repeat inside ten
  minutes re-pages only if no in-app row shows the first press reached anybody.
  Recipients: admins holding `riders`, max 25; rider-typed text passes
  `notification-text.ts` first.
- **A per-caller throttle runs after auth.** `ThrottlerGuard` runs before
  `JwtAuthGuard`, so a `@Throttle` tracker keys on something unverified (a
  random bearer per request = a fresh bucket, unbounded limiter storage).
  `@UserThrottle` (`session-throttle.ts`) keys on the verified user id **on top
  of** the per-IP floor (`rider-throttle-ip-floor.spec.ts`). Never `@Throttle`
  the SOS, export or deletion routes.
- **A pending deletion request takes the rider out of work, and the server
  keeps them out.** Asking withdraws unanswered offers, forces offline, and is
  refused (409, with rupee amounts) unless the cash balance is ₹0 and nothing
  is in flight or pending. Going online, dispatch, accepting an offer and
  pings all refuse while `deletionRequestedAt` is set. **`deactivate` deletes
  and anonymises nothing** (retention is a lawyer's answer): it flips status,
  stamps `exitedAt`, withdraws offers, revokes refresh tokens, is refused
  mid-delivery — and is the only way to close a never-approved rider's request
  (`exitedAt` stays null: it is the registry's exit date).
- **The export is the rider's own data and nobody else's**
  (`rider-export-privacy.spec.ts`, a structural scan beside `vendor-privacy`
  and `rider-address-privacy`). The ping trail is summarised, never listed; the
  file's `notIncluded` says what it leaves out.
- **The gig-worker registry is a hand-off file** (`GET /admin/riders/export/
  gig-registry`, scope `riders`, IST range, audit row = range + count only).
  Its columns are **unverified against the portal's template**
  (`GIG_REGISTRY_COLUMNS_VERIFIED_AGAINST_PORTAL`): check before the first upload.
- **A payout is settled for the days worked.** `generate` cuts whole IST days,
  only once the last day is before today, for approved, suspended and
  deactivated riders; an identical period or a pending/paid overlap is skipped,
  so no day is paid twice. **A bare `YYYY-MM-DD` is an IST day everywhere**
  (`earnings-range.ts`, the rider's Earnings too): read as UTC, the week's last
  day fell out. `Rider.deliveredCount` is recomputed from delivered rows
  (`rider-stats.ts`), never incremented — and for a while never written.
- **Two contact settings need a second scope.** `rider.supportPhone`,
  `rider.emergencyPhone`, `rider.companyUpiId` are `PlatformSetting` rows edited
  on `/admin/settings` (blank = unset, never a placeholder to dial or pay).
  Changing the UPI id needs `finance`, the emergency number `riders`, on top of
  `settings`, read from the database, only when the value changes: a
  settings-only sub-admin could otherwise repoint every cash deposit or the SOS
  button (`rider-setting-access.spec.ts` holds the web's map to the server's).
- **Admin fleet screens** (Fleet nav group; `riders` scope, deposits and payouts
  `finance`). **A KYC photo is fetched on a click as a Blob**, revoked on hide,
  never auto-loaded, never an `href`; the bank number is masked until
  **Reveal**; both and a live delivery code are audit rows. **A money write
  mints its `Idempotency-Key` once per operation**, not per click
  (`kyc-privacy.spec.ts`). Counts come from the server's `summary`; a typed
  search treats `%`, `_`, `\` literally (`escapeLike`) — `HK20_2` found another
  live order.
- **A hand-marked delivery decides the cash, in the same transaction.**
  `POST /admin/deliveries/:id/override-deliver` takes `{ reason, cashCollected? }`:
  on a cash job with a rider the answer is required (400 naming the amount),
  `true` writes the `cod_collected` entry beside the status flip and `false`
  writes none. The rider's own `deliver` writes its entry in its flip's
  transaction too — both were separate statements once, so a failed insert left
  a delivered job that owed no cash. `payouts.generate` asks
  `IdempotencyService.run` for a 120 s transaction (`{ timeout, maxWait }`,
  forwarded only when a caller passes it).
- **The app follows the server's answer, not its last press.** `isOnDuty(me)`
  is the server's rule; Home re-reads `/rider/me` on foreground and every 60 s
  and stops the location service for a rider the server keeps no position for.
- **Two contract harnesses** run the clients' real `api` modules against the
  built server: `cd rider && npm run contract`, `cd client && npm run
  contract:admin` (see Tests).

**Known gaps — owner decisions or unbuilt, so nobody "fixes" them by
accident.** SOS pages admins holding `riders`, not `support` as the plan said.
A suspended rider mid-delivery keeps the buyer's address and phone until an
admin cancels or overrides. Vehicle, bank and zone changes after approval (plan
§2.5) have no flow. A failed, cancelled or returned job never gets a second
rider (unique `(order, vendor, address)`), and a rejected payout leaves its
exact period taken. Proof photos use the **public** upload pipeline and nothing
purges them; no erasure tooling; no server-side Aadhaar masking. A replayed
`Idempotency-Key` on deposit verify, payout pay or a cash adjustment
double-writes an audit row and re-notifies (pinned by a test).
`generate` holds every rider's row lock for its whole run (allowed 120 s), so a
rider action on a locked rider waits; chunking is the answer if that bites.
