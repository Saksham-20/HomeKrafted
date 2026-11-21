# Auth and identity

Moved verbatim from `CLAUDE.md` on 2026-11-21 to keep that file short. These rules still bind; `CLAUDE.md` says when to read this file.

## Auth & identity (M17) — three ways this broke at once

All three shipped, were reviewed, and were manually tested. None of them
had a test, and none was visible from reading the happy path.

- **An approved HomeKrafter's password is issued *to* them, and dies on
  first use (M32 — this reverses the rule below; show-once since M37).**
  Approval mints the account (`authProviders: ['phone']`) **and** a
  temporary password, returned once in the approve/issue response and
  stored only as a hash, because no provider key is set and the invite
  link reaches nobody. The old rule — "an admin never sets a credential,
  and must never be able to" — was protecting a principle by leaving
  every real kitchen with an account and no door. What preserves its
  substance: `mustChangePassword` is enforced in `JwtAuthGuard` (403
  `PASSWORD_CHANGE_REQUIRED` on every route but the change screen), the
  plaintext is never stored (a lost one is re-issued, not re-read), and
  the act is audited. **Restore the original rule once SendGrid/Twilio
  exist.**

  **Onboarding state is three-valued, and `mustChangePassword` alone
  cannot express it.** That flag is `false` both for a kitchen that
  arrived and chose a password *and* for one that was never given a
  credential, so the two-state version reported all thirteen existing
  production HomeKrafters as "onboarded" with zero sign-ins between them.
  `mapSignInState` reads `passwordHash` too: `awaiting` (issued, unused) ·
  `onboarded` (has a password of their own) · `no_credentials` (none at
  all — pre-M32, and the list with the most work attached). Any new
  surface answering "has this kitchen actually got online" owes the same
  three-way split.
  Everything below still holds: A one-time code therefore remains a first-class sign-in and
  **any surface offering to sign a HomeKrafter in must offer it**:
  removing it gives every real kitchen "Incorrect email or password" for a
  password that never existed.

  **M25 collapsed the form to one field and kept that door open, by
  status.** `POST /auth/continue` answers **409** (not 401) when the
  account exists with `passwordHash: null`, and the form turns that into
  the code route automatically. If you ever change that branch to a 401
  "for consistency", you have re-broken supply-side onboarding — the
  end-to-end path is pinned in `test/e2e/auth-continue.e2e-spec.ts`
  ("the approved HomeKrafter case"). "Use a code instead" is also always
  visible on the form, deliberately, not only after a failure.

  **M21 added the second door.** Approval sends a single-use, 7-day
  set-password link by email and SMS (`SellerInviteService`), which is
  why `resetPassword` adds `email` to `authProviders` — the account stops
  being phone-only the moment they use it. The link is minted through the
  same `PasswordResetToken` machinery as a reset, deliberately: it is
  single-use, expiring and session-revoking, and **a plaintext password
  must never be emailed**. That credential would sit readable in an inbox
  forever, could not be rotated, and on this platform is the one that can
  change payout details.
- **A failed refresh is never an answer, and a session ends only on one
  (2026-09-19).** `http.ts`'s refresh resolves `ok | rejected | unavailable`:
  only a 401/403 with **no newer token in storage** ends the session
  (`clearSession()` + redirect); a 429, 5xx, network failure, timeout or
  non-JSON body keeps it and throws the status-0 `ApiError` — the
  `session-answer.ts` rule applied to the refresh, which had never asked it
  (a 429 from the throttler was signing admins out). The refresh token is
  **re-read from `localStorage` under a Web Lock** (`navigator.locks`,
  `hk-auth-refresh`) before it is posted, and a tab adopts a sibling's
  rotation instead of replaying a spent token; `session.ts`'s memory is a
  **cache** of `localStorage` that follows the `storage` event, **not a
  second source of truth**. **`AuthContext` restore and uploads go through
  `refreshSessionNow()` from `http.ts` — never post a token themselves.**
  `lib/api/auth.ts#refreshSession` is the raw endpoint (no lock, no
  re-read) and is documented as such. Server side, a replay beyond the 10 s
  grace revokes **its own chain** (`RefreshToken.replacedByTokenId`), never
  the user's other sessions — the old revoke-everything blast radius was the
  "admin keeps getting logged out" report. `docs/ERROR-HANDLING.md` §6.
- **A failed request is never an answer, and `/seller/me` is where that
  bit (M39).** `getMySeller`/`getSellerVendor` ended `catch { return
  undefined }`. `/seller/me` is **not** in `PASSWORD_CHANGE_EXEMPT`, so
  an admin-issued temporary password makes it answer **403
  PASSWORD_CHANGE_REQUIRED** — on purpose, pinned by
  `server/test/e2e/temp-password.e2e-spec.ts`. Swallowed, that 403 became
  "this account has no kitchen", `SellerShell` rendered **"Sign in as a
  HomeKrafter"** at somebody who had just typed the right password, and
  its button returned to `/login`, whose "You're all set" card sent them
  straight back. A closed loop with no sign-in form in it, and the same
  swallow did it for a 500 or a dropped connection — which is why it
  looked intermittent. Now: **404 alone returns `undefined`**, everything
  else throws (`lib/api/seller-me-contract.spec.ts`); `AuthContext` keeps
  `failed` apart from `answered` and exposes `sellerLoadFailed` +
  `retrySellerRecord`; `SellerShell` has **four** states, and a failure
  gets a retry, never a rejection. `http.ts` routes the code to
  `/set-password` from wherever it lands — before M39 the client had
  **zero** references to a code the server invents so a client can act on
  it. Don't "fix" a future version of this by exempting `/seller/me`:
  that disables the control instead of handling it.
- **`/set-password` needs a way out for somebody who was never given
  one.** It asks for "the password you were given"; a HomeKrafter who
  signed in with a **one-time code** — the door that exists because the
  invite reaches nobody — has none, and met an unfillable form with no
  link off it. `resetPassword` already sets a password without the old
  one and clears `mustChangePassword` (its own comment says the forced
  gate must let them through), so the screen links to `/forgot-password`.
  A route, not a new endpoint and not a weaker guard.
- **One box decides its own type, and the two parsers are NOT twins.**
  `server/src/auth/identifier.util.ts` (libphonenumber-js, region `IN`) is
  the authority; `client/lib/auth/identifier.ts` only enables the button
  and picks the label. Unlike `lib/geo.ts` and its server copy, these are
  *allowed* to disagree — but only in one direction. The client must stay
  **looser**: a false positive costs one request and a clear 400, while a
  false negative strands somebody at a dead button with a valid number
  typed in and nothing to fix. Never "tighten" the client to match.
- **Never resolve the signed-in seller from `lib/data`.** Use
  `GET /seller/me` (`getMySeller()`). The mock list contains only seeded
  kitchens, so a lookup for a real one misses — and falling back to a
  demo record shows one HomeKrafter another's name and `vendorId`.
  Anything derived from a session must fail empty, never fall back to a
  fixture.
- **A login form must use what was typed.** `/admin/login` called a
  hardcoded-credential helper and threw its inputs away — full admin to
  anyone who opened a publicly routable page. Check the role the *server*
  returns; don't trust which form was used.
- **No credential belongs in a client module.** `AuthContext` is
  `"use client"`, so its constants ship in the public bundle: the seeded
  admin's email and password were readable with view-source. Demo
  accounts are documented in `docs/TESTING.md` and typed into the normal
  form — there are no "continue as demo ___" buttons, and adding one back
  reintroduces this.
- **`@BooleanField()` is the only correct way to declare a boolean
  request field.** The global pipe's `enableImplicitConversion` turns
  every non-empty string into `true`, so a bare `@IsBoolean()` read
  `"false"` as `true` — on the verification badge, wallet auto-top-up and
  more. See `server/src/common/decorators/boolean-field.decorator.ts`.
- **argon2 parameters live in `server/src/auth/hashing.ts`, and nowhere
  else (M31).** Never call `argon2.hash` bare — that is how all seven
  call sites ended up on the library's defaults (`m=65536, t=3, p=4`),
  which nobody chose and which put four lanes on the production box's one
  core. Passwords use the OWASP argon2id reference config
  (`m=19456, t=2, p=1`); one-time codes are cheaper on reasoning written
  out in that file. `argon2.verify` stays parameterless — it reads the
  cost from the stored digest, which is what lets old hashes keep working
  while `AuthService.maybeRehash` upgrades each one in the background on
  its owner's next sign-in. Both sets are pinned by
  `server/test/unit/hashing.spec.ts`.
