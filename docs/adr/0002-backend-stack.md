# ADR 0002: Backend stack — NestJS + Prisma + Postgres + JWT

**Status:** Accepted (M8.0)

**Supersedes:** ADR 0001's point 1, the "(from M8) API routes" clause —
that clause anticipated serving the API from Next.js route handlers
inside `client/`. The monorepo structure locked in since M0 (root
`CLAUDE.md`'s directory map, `server/README.md`'s original placeholder)
already called for `server/` as a **standalone backend API shared by
`client/` (web) and `app/` (native, future)** — this ADR is the actual
stack decision for that standalone service, not a reversal of the
monorepo shape itself.

## Context

M8.0's brief locked in three decisions before implementation started:
**NestJS** (TypeScript, npm) in `server/`; **Postgres + Prisma**; **JWT**
auth (short-lived access + rotating refresh) with three sign-in flows
(phone OTP, email+password, social) and RBAC over `User.role`
(`consumer`\|`seller`\|`admin`). This ADR records why, for a session that
picks this up later without the original milestone brief in hand.

## Decisions

1. **NestJS, not raw Express or a Next.js API-routes backend.** The
   service needs to be genuinely standalone — shared by `client/` *and*
   the future `app/` (React Native/Expo) — which rules out Next.js route
   handlers (tightly coupled to the Next.js request lifecycle and
   deployment model). Nest gives structured modules/DI/guards/pipes out
   of the box, which this milestone leans on directly: a global
   `JwtAuthGuard` + `RolesGuard` pair (as `APP_GUARD` providers), DTO
   validation via decorators + a global `ValidationPipe`, and a module
   boundary (`AuthModule`, `UsersModule`, and the M8.1–M8.3 modules to
   come) that mirrors `client/lib/api/`'s one-module-per-domain shape.

2. **Prisma over Postgres, `provider = postgresql`.** `client/lib/types/*.ts`
   is the existing schema contract (per root `CLAUDE.md`); Prisma's schema
   DSL is close enough to that TypeScript shape that the translation is
   mechanical (see `docs/DATA-MODEL.md`'s "M8.0 Prisma mapping" section
   for the field-by-field mapping and every place it deviates). Prisma
   Migrate gives versioned, reviewable SQL migrations
   (`server/prisma/migrations/`) instead of hand-written DDL or an
   ORM that hides schema evolution.

3. **JWT (access + rotating refresh), not Auth.js/NextAuth.** Auth.js is
   built around Next.js's request lifecycle (route handlers, middleware,
   its own session cookie handling) — wiring it into a standalone NestJS
   service consumed by both the web app and (eventually) native mobile
   clients would mean fighting the library's core assumption. A JWT pair
   is transport-agnostic: any client that can attach an `Authorization:
   Bearer <token>` header can use it, satisfying `server/README.md`'s
   original brief ("issued as tokens/sessions usable by *both* web and
   mobile"). Refresh tokens are **rotating** and stored server-side only
   as a hash (`RefreshToken.tokenHash`, SHA-256) — a reused (already-
   rotated) refresh token is rejected outright, which is the standard
   reuse-detection signal for a stolen/replayed token. No
   `@nestjs/passport` — a small custom `JwtAuthGuard` was enough given
   there's exactly one token format to verify (no OAuth strategy chains
   needed for the stub social flow).

4. **argon2 for password + OTP-code hashing, not bcrypt.** argon2 is the
   current recommended default (winner of the Password Hashing
   Competition, resistant to GPU/ASIC cracking in a way bcrypt's
   fixed-cost design isn't as future-proof against) and has a
   well-maintained native Node binding (`argon2` npm package).

5. **Phone-OTP "sender" and social login are stubs in M8.0, wired for
   real later.** OTP codes are generated, argon2-hashed, and stored with
   a short TTL + attempt counter — but "sending" just logs to the server
   console (a real SMS/WhatsApp Cloud API provider swaps in at M9, behind
   the same `OtpService.requestOtp` interface). Social login
   (`POST /auth/social/:provider`) trusts a client-submitted profile
   payload instead of verifying a real Google/Apple OAuth token — a real
   provider SDK verification is a service-body-only change (the DTO
   shape doesn't change; a verified profile has the same fields). Both
   are flagged inline in code (`OtpService`, `SocialLoginDto`) and in
   `server/README.md`'s "Needs real credentials" section, not silently
   left as a gap.

6. **Only auth + users/addresses get real endpoints in M8.0.** Every
   other domain model (catalog, cart, orders, wallet, laundry, snacks,
   seller, admin) is fully schema'd in `prisma/schema.prisma` — so
   M8.1–M8.3 only add controllers/services/DTOs, never new tables — but
   deliberately has no endpoint yet. This keeps M8.0 reviewable as one
   vertical slice (schema + one real auth-gated resource, proven end to
   end with curl) rather than a partially-wired sprawl across every
   domain at once.

## Consequences

- `server/` and `client/` are two separate deployable processes,
  communicating over HTTP once M8.4 swaps `client/lib/api/`'s mock reads
  for real `fetch()` calls — never a shared import graph.
- Every later milestone's seller/admin-scoped endpoint must resolve its
  scoping id (`vendorId`/`sellerId`/`userId`) from the verified JWT
  payload (via `server/src/common/scoping/ownership.util.ts`), not from a
  client-submitted value — the real fix for the gap
  `docs/ARCHITECTURE.md`'s "Role surfaces" section already flagged in the
  M10a/M11a frontend mock.
- Local dev doesn't require Docker: `docker-compose.yml` is provided for
  convenience, but any reachable Postgres 14+ with a `CREATEDB`-capable
  role works (that's how M8.0 itself was built and verified — the
  environment it shipped from had no Docker available, so a local
  Homebrew Postgres install was used instead, per `server/README.md`).
- Secrets (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`DATABASE_URL`/
  Razorpay keys) are env-only; `src/config/env.validation.ts` fails fast
  on missing values and on the dev-placeholder secrets specifically once
  `NODE_ENV=production`, so a misconfigured prod deploy can't boot
  insecure.
