# Tests

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Tests (M17) — `docs/TESTS.md`

`cd client && npm test` · `cd server && npm test` · `cd server && npm run
test:e2e` (needs `TEST_DATABASE_URL` — see `docs/TESTS.md`). CI runs all
of it plus typecheck, lint and both builds.

**Structural specs are a layer of their own, and they exist because each
one caught a silent failure.** `vendor-privacy.spec.ts` (no public read of
a pickup address), `rbac-structure.spec.ts` (every portal controller
role-gated), `focus-trap.spec.ts`, `keyboard-activation.spec.ts`,
`silent-failure.spec.ts`, `vendor-avatar.spec.ts`,
`shared-boundary.spec.ts` (nothing in `client/lib` reaches for something
only the web has), and since R4 `rider-export-privacy.spec.ts` (the data
export reads nothing of anyone else's), `rider-legal-parity.spec.ts` (the
consent version the server checks and the page prints is one string),
`rider-throttle-ip-floor.spec.ts` (the safety routes keep the per-IP limit),
`location-retention.spec.ts` (the purge owns its timer and reads no dispatch
flag), `h3-import-boundary.spec.ts` (`h3-js` has one import site), `rider-push.spec.ts`
(a lock-screen push reads no address, name, phone or amount) and rider/'s
`locationPromptGuard.spec.ts` (nothing else may reach an OS location prompt),
`lib/admin-riders/kyc-privacy.spec.ts` and rider/'s
`testReferences.spec.ts` (a comment that cites a test cites one that
exists). They scan source text,
so two rules: **strip comments before scanning** — this repo quotes
decorators in prose constantly, and a scan that counts a comment as code
fails *open*, which is how `rbac-structure.spec.ts` reported three
ungated controllers as gated — and **keep the allowlist a registry with a
stated reason per entry**, so a rename fails the build instead of
silently widening it.

**And strip them with `lib/testing/strip-comments.ts`, never a regex
(2026-09-06).** Every one of these specs carried the same one-liner, and
it failed open in the *other* direction: this file writes route patterns
in prose constantly — `/seller/*`, `/admin/*`, `POST /auth/*` — and each
contains the two characters that open a block comment, so the regex read
one as an opener and deleted every line to the next closer. Measured:
**27 files under `client/` and 10 under `server/src`** carry unmatched
openers; `AuthContext.tsx` was 58% visible, `ConsumerChrome.tsx` 21%, and
`seller/seller.controller.ts` **54% visible to the RBAC scan that fails
the build on an ungated portal controller**. The replacement is a state
machine (inside a block comment nothing opens a second one, and strings
are tracked); `server/` keeps a pinned twin because it is a separate
package, held in step by `strip-comments-parity.spec.ts` the way
`geo-parity` holds `geo.ts`. The rule underneath both directions: **a
structural scan that fails open is worse than no scan, because it reports
success.**

**`RolesGuard`'s fail-closed rule only covers `/api/v1/admin`.** Three
admin-privileged routes hang off controllers most of whose routes belong
to the signed-in customer — `POST /orders/:id/refund`,
`POST /wallet/adjust`, `GET /users/:id` — so they carry a *method-level*
`@Roles('admin')` that neither the path rule nor a class-level scan sees.
They are pinned by name in `rbac-structure.spec.ts`'s
`ADMIN_ROUTES_OUTSIDE_ADMIN`. **Adding a privileged route to a mixed
controller means adding it there too**; two of the three move money, and
without the decorator every signed-in shopper can call them.

**Two contract harnesses run the clients' real `api` modules against the real
server (R4).** `cd rider && npm run contract` and `cd client && npm run
contract:admin` boot the built `server/dist/main.js` on a scratch Postgres
(every migration applied from zero; a minimal environment and a temp working
directory, so no `.env` and no provider key reaches it) and walk one story
through `rider/src/api/**` and `client/lib/api/admin-{riders,sos,zones,
deliveries,rider-money}.ts`, checking each response against the shape the
client's types promise with `null`, absent and missing kept apart. They fail
if a route the client can call was never reached (the admin one also checks
exported functions) and if the run leaves a row behind, so **a new route in
those modules needs a story step**. What they found, and no unit test had:
`Rider.deliveredCount` had three readers and no writer, a bare `to=YYYY-MM-DD`
dropped the last day of the week, an SOS rider's `phone` arrives `null`. Their
shape and route specs also run under each package's plain jest. Not a browser
and not a device: no screen is rendered. `client/test-contract/README.md` and
`rider/README.md` ("Contract test") have the flags; the server boot logic is
`server/scripts/contract-server.mjs`, and `rider/scripts/contract-run.mjs`
still carries an older copy of it — change both.

Three layers: pure functions in `client/lib/**/*.spec.ts`, services with a
stub Prisma in `server/test/unit/`, and **a real Nest app against a real
Postgres** in `server/test/e2e/`. Prisma is never mocked in the e2e layer
— every rule worth guarding here is enforced by a query, and a mocked one
would test the mock. Compute expected values by hand; a number recorded
from a run locks in the bug.
