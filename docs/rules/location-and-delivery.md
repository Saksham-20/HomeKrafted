# Location, supply and courier delivery

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Courier despatch (M57) — a rider, and what a webhook may not do

`Consignment` (one kitchen's lines of one order, to one address) +
`ConsignmentEvent`. Shadowfax's **marketplace seller-pickup** model: a
rider collects from the HomeKrafter's own kitchen. Booked when the
kitchen marks an order **packed** — that is when a parcel exists.

- **A courier carries gifts and never food (2026-09-06, owner), and since
  D10 not quite every gift.** `courier-eligibility.ts` is still the one
  place that decides. The base predicate is `Product.kind === 'craft'` —
  the same one `/gifts` browses on, so what a buyer sees under "Handcrafted
  Gifts" is very nearly exactly what a rider collects. **The exception is
  edible gifts (2026-09-16, owner D10):** chocolates stayed on the gifts
  side rather than moving to `food`, which would have taken fourteen live
  listings off sale while `foodOrdersOpen` is off — so a craft row can now
  be something that melts in a van. A listing filed under **Chocolates &
  Edible Gifts** (the department slug, matched through `ProductCategory` so
  a subcategory counts) travels **only when its maker has set
  `heatSafePacked`**; the default `false` keeps it on local delivery, which
  is the safe direction — the cost of being wrong the other way is a bag of
  liquid chocolate arriving as a gift and a refund a home maker pays.
  `NON_COURIER_LINE` gained the matching clause, so an order holding an
  unclaimed edible gift is one a courier callback may not drive forward
  (the mixed-basket rule, arriving by a second route). Pinned by
  `test/unit/courier-edible-gifts.spec.ts`. It is deliberately **not** `shippingScope`, which
  answers how far a listing may travel and would pull in a jar of pickle
  marked `national`; nor `Vendor.type` or `specialties`, which are
  discovery tags that must never decide anything (M12). The food half is
  bit-for-bit its pre-M57 self: no `Consignment`, the kitchen marks
  packed/shipped/delivered itself. Narrowing this to long deliveries only
  is `&& shippingScope === national` **in that file and nowhere else**.
- **A mixed basket is the case to hold in your head, and it is one rule
  read from both ends.** A candle and a curry from one kitchen books a
  parcel for the candle alone. So (a) `reconcileOrderStatus` refuses to
  drive `Order.status` while any line is uncarried — a rider delivering
  the candle must not stamp `deliveredAt`, start the buyer's seven-day
  return window and set every kitchen's payout basis on food still in an
  oven — and (b) `hasParcelInFlight` therefore returns **false** on such
  an order, so the HomeKrafter can still close it by hand. Change one
  without the other and a real order is stuck until an admin overrides.
  Pinned by `shipping-gifts-only.e2e-spec.ts`.
- **`SHADOWFAX_ENABLED` is off by default and the module is dormant
  without it.** Booking a rider costs money, and every kitchen that hands
  its own parcels over must keep working untouched.
  `server/scripts/verify-shadowfax.mjs` proves an account works — host,
  token, tricity `seller_pickup` coverage, and with `--book` a real
  create/track/cancel round trip — without finding out on a live order.
- **A carrier callback may move a parcel forward and nothing else.**
  Shadowfax does **not** sign callback bodies — there is no HMAC, unlike
  Razorpay, only an `Authorization` value we chose and gave them
  (constant-time compared; an unset secret refuses everything rather than
  accepting everything). So it is the weakest input the server takes, and
  it may drive only `shipped` and `delivered`. Cancelled, returned and
  lost are recorded on the consignment and left for an admin, because
  each of those moves money and the loss lands on a home cook (M15).
- **Two channels, one path.** The push callback and the `bulk_track` poll
  both feed `ShippingService.ingest`; whichever sees an event first
  records it and the other loses the unique insert. Push only fires once
  its URL is registered in **Shadowfax's client portal**, which no code
  here can do — so `SHADOWFAX_POLL_SECONDS` is the whole auto-update
  until somebody does that, and the safety net afterwards.
- **The weakest parcel decides the order**, and only on an order the
  courier carries all of (above). `shipped` when every parcel
  has left, `delivered` when every parcel has arrived — never the first.
  `delivered` stamps `deliveredAt`, which starts the return window and is
  every kitchen's payout basis (M15/M37).
- **Booking never blocks the order.** A carrier that is down, a missing
  pickup address or an unserviceable pincode records a `failed`
  consignment with the reason and the kitchen's "packed" still succeeds.
  The despatch queue (`/admin/shipping`) is where a person fixes it.
- **Never trust the callback body's `order_id`** — resolve on
  `awb_number` against our own row (the Razorpay lesson). And never
  `String()` a callback field: an object becomes `"[object Object]"`, a
  real-looking string an operator then reads as the carrier's own words.
- **A terminal parcel is frozen.** A carrier event stamped *after* a
  delivery is legitimately "newest" and rewrote the row to
  `status=delivered, courierStatus=ofd` until `ingest` started refusing
  it. Measured, not hypothetical.
- **Carrier timestamps are IST and zoneless on the callback, ISO-`Z` on
  the tracking API.** `new Date("…T16:20:00")` parses in the *server's*
  zone — this dev box is Asia/Kolkata, the VPS is Etc/UTC, a 5h30m skew
  on every `deliveredAt`. `parseCarrierTimestamp` pins +05:30 and honours
  an explicit zone.
- **Serviceability is advisory, never a booking gate.** Measured on
  staging: `customer_delivery` calls `999999` serviceable, and
  `seller_pickup` omits Chandigarh `160022` — reading absence as refusal
  (the documented contract) refuses every real booking we have. The
  carrier's own **booking** call is the authority, and it refuses with
  **HTTP 200** + `{"message":"Failure","errors":"…"}`, so the presence of
  an AWB is the check, not `res.ok`.
- **The pickup address never lands on `Consignment` and never leaves in a
  response.** It is read from `VendorProfile.pickup*` at booking time and
  put in the carrier request only — a home cook's home address (M36b).

## Location & availability (M12) — read before touching catalog or portal

- **Location is never a gate.** No coords → the API returns the *full*
  catalogue, and the UI says so. The browser prompt has a manual tricity
  area picker behind it and a first-class "skip". Most people decline a
  location prompt; a visitor who declines must still be able to shop.
- **Two copies of the area table** (`client/lib/geo.ts`,
  `server/src/common/geo.ts`) because client/ and server/ are separate
  packages. They MUST stay identical — a kitchen's coords come from the
  server's table at approval, a buyer's from the client's; drift silently
  mis-sorts distance. **Do not delete these in favour of pincodes (M36):**
  the 21 curated coordinates are hand-checked and beat the pincode table
  by 1–5 km inside the launch city, where almost every live kitchen is.

## Supply is national, delivery is not (M36) — read before touching location

`SellerApplication.area` was a closed list of 21 tricity areas plus the
literal `'other'`, and **`'other'` could not be approved**. A home cook in
Faridabad was accepted by the public form, filed as a waitlist entry, and
no screen in the product could move them off it — the endpoint to do it
(`PATCH /admin/sellers/applications/:id/area`, M19) existed and nothing in
the browser ever called it. The form now asks one question, a **pincode**,
and every valid Indian pincode is approvable.

- **A pincode is an identity, not a coordinate.** `server/src/common/
  pincodes.json` (19,238 rows, GeoNames) is authoritative for **district
  and state**. Its **centroid is trustworthy for only 44% of pincodes** —
  the median pincode's post offices are 12.4 km apart, 134109 lands ~11 km
  from Panchkula Sector 8, and 160055 spans Mohali *and* Rupnagar. Never
  write it straight onto `Vendor.lat`/`lng`: that column decides which
  buyers can see a kitchen at all, so a 12 km error hides a real storefront
  from its own neighbourhood. Approval seeds it and flags
  `placement` when it is approximate; an admin corrects it via
  `PATCH /admin/sellers/:id/coords`, **and since 2026-08-18 the kitchen
  can pin itself** — `PATCH /seller/profile/coords` takes a GPS fix from
  the person standing in the kitchen (a "Use my current location" button
  on `/seller/profile`). That reverses M36's "no seller-facing coords
  write" on the owner's decision; what it protected stays closed by
  three guardrails: the pin must land inside the kitchen's own pincode
  (centroid + `spreadKm` + 10 km; pre-M36 rows: 25 km of the curated
  area, anchored to the *stated* place so moves can't accumulate), it
  clears `addressVerified` (the M36c rule — admin re-verifies), and it
  is audited (`vendor.set_coords_self`). `Vendor.pinConfirmedAt` records
  that a person (kitchen or admin) vouched for the pin; NULL means
  "still the approval seed", and the profile completion meter names that
  as a gap. Buyers are untouched either way — `mapVendor` rounds every
  public payload to ~1.1 km whoever set the pin. `spreadKm` is the
  honesty field — ask it rather than assuming.
- **`servicedPincodePrefixes` gates buyers, never supply.** It selects
  **copy, not visibility** (the "location is never a gate" rule above still
  holds — an empty page can't be told apart from a broken site, by the
  visitor or by us). It must never gate an application, an approval, or a
  HomeKrafter's portal; the moment it does, the waitlist is back under a
  new name. It **fails open**: an empty or missing value means no gate.
- **The pincode table is server-only.** 1.8 MB, never shipped to the
  browser — that is also what stops it becoming a third mirrored copy of
  the `geo.ts` hazard. `client/lib/pincode.ts` checks **shape only** and is
  deliberately **looser** than the server, same direction and same reason
  as the two identifier parsers (M17).
- **GeoNames is CC-BY 4.0.** The footer credit linking to geonames.org is
  a **licence condition**, not a courtesy. Remove the table and remove the
  credit together; keep the table and the credit is not optional.
- **A HomeKrafter edits their own profile, tags and address (M36c).**
  Three separate write paths, and they must stay separate: `PATCH
  /seller/profile` (story, hours, policies, **and the pickup address**),
  `PATCH /seller/specialties` (the M33 tag replacement), and nothing at
  all for verification — that is still admin-only. **Changing any pickup
  line clears `addressVerified`**, exactly as changing `fssaiNumber`
  clears `fssaiVerified`: a badge that survives an edit to the thing it
  verifies is a badge the seller set themselves. It clears *only* that
  flag, not the shared `verifiedAt`/`verificationNote`, which belong to
  the identity and licence checks too. Pinned by
  `server/test/unit/seller-profile-address.spec.ts`.
- **A HomeKrafter renames their own storefront (M60), and a rename is not
  a re-registration.** `name` on `PATCH /seller/storefront` writes
  `Vendor.name` **and** `Seller.displayName` in one transaction and
  **never re-derives `slug`** — it is in every shared and indexed
  storefront URL (the M58 category rule). **Duplicate names are allowed
  on purpose**: two real kitchens can be "Home Bakes", and the accounts
  are told apart by phone and email, which are unique — don't add a
  uniqueness check. The shape is still `checkBusinessName`, the `/sell`
  function, because production already holds a storefront named after
  somebody's email address (M32). **There are no branches**: one
  HomeKrafter is one storefront with one pickup address, since a second
  location would be a second `Vendor` and split one kitchen's reviews,
  followers and payouts in two (the M33 rule). Pinned by
  `server/test/unit/seller-storefront-name.spec.ts`.
- **The pickup address is private, and that promise is enforced (M36b;
  a third surface since R2).** `/sell` asks for the address a rider
  collects from — a home cook's **home address** — and says on the form
  that buyers never see it. `VendorProfile.pickup*` is readable on
  exactly **three** surfaces: the admin verification panel (which owns
  `addressVerified`, so it has to show the address it is verifying), the
  HomeKrafter's own `/seller/profile`, and — since R2, and narrower than
  either — **Homekrafted's own fleet rider, only for a job they hold
  `accepted`/`at_pickup`** (`docs/RIDER-APP.md`'s Rider fleet section;
  `rider-jobs.mapper.ts#mapActiveJobForRider`, gated by the job's own
  `status`, pinned by `server/test/unit/rider-address-privacy.spec.ts`).
  The buyer gets `Vendor.location`, a coarse area label, and nothing
  more. `server/test/unit/vendor-privacy.spec.ts`
  fails the build if `src/catalog`'s public region reads those columns —
  it scans `vendor-profile.service.ts` **by region**, because that file
  holds both `publicProfile` and the seller-only `ownProfile`. Never
  merge the address into `Vendor.location`, and never add it to
  `PublicVendorProfile`. This is the same exposure M25's EXIF strip
  exists to prevent, except typed in directly rather than hidden in a
  photo.
- **An address is also a pair of coordinates, so `mapVendor` rounds them
  (M36).** Withholding the address columns is only half the promise: the
  public vendor payload carries `lat`/`lng`, and at four decimals that is
  the front door to ~11 m. It was harmless while every vendor sat on one
  of 21 curated *area* centroids; M36 seeds the column from a pincode and
  adds `PATCH /admin/sellers/:id/coords`, whose approval banner tells the
  operator to "set the exact spot" — so the leak arrives the first time an
  admin does what the product asks. `mapVendor` now rounds to
  `PUBLIC_COORD_DP` (2dp, ~1.1 km — the granularity of "Sector 35,
  Chandigarh") **by default**, and the exact pin needs an explicit
  `{ preciseLocation: true }`. Two callers pass it: the admin approve
  response (which has to correct the pin) and `/seller/storefront` (a
  HomeKrafter reading their own record). **The default is the safe one on
  purpose** — a new call site added by somebody who never read this gets
  the rounded value. The column keeps full precision; distance filtering
  runs server-side against it, and nothing on the client computes a
  distance from the response.
- **Nothing is backfilled.** Pre-M36 rows keep their `area` and approve
  exactly as before; their `pincode` is NULL, which correctly reads as
  "they signed up before we asked". Guessing a pincode from a curated area
  would write a wrong one onto a real storefront and look authoritative.
- **Server Components can't read `localStorage`.** `/shop` and `/snacks`
  read the `hk_loc` cookie via `getBuyerCoords()`. Any new server-rendered
  listing page must do the same or it will silently ignore the filter.
- **Anything keyed on the current time must be client-only.** The schedule
  derives from `new Date()`; computing it during SSR caused React #418
  (server and browser disagree on "Today"). Build in an effect after mount
  behind a stable placeholder.
- **Two different "is this visible" switches, don't merge them:**
  `Product.isAvailable`/`Snack.available` is the HomeKrafter's "am I making
  this today"; `moderationStatus` is the admin's. Buyers need both to pass.
