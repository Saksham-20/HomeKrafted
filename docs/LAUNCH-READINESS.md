# Launch readiness

What stands between the current build and taking real money from real
people in the tricity. Written 2026-08-02, after M17.

`docs/PRODUCTION-AUDIT.md` is the *product* backlog — what to build next.
This is the *launch* checklist — what must be true before the first real
customer, most of which is configuration and operations rather than code.

Ordered by what blocks what.

---

## 0. Do this first — the site is live and these are open now

### 0.0 Audit production for uncollected auto-top-up credits ✅

**Fixed in code (M19); production audited 2026-08-05 and clean.** All
three result sets were empty: no uncollected credits, no affected wallets,
and no `AutoTopupRule` left enabled. Nothing to claw back — the bug was
found before anybody exercised it.

Re-run the query if the credit path is ever re-enabled. The rest of this
section is kept because it is the reasoning behind the query, and a future
reader needs it to trust the result.

`WalletService#maybeFireAutoTopupTx` used to post a `credit`/`topup` ledger
entry for `AutoTopupRule.topupAmount` whenever a debit dropped a wallet
below its threshold — with **no Razorpay charge and no captured payment
behind it**. `PUT /wallet/auto-topup` is owner-scoped and its DTO capped
nothing, so any signed-in shopper could set a large `topupAmount`, spend
once, and mint real spendable balance. That balance buys real food from
real home kitchens, who then draw real payouts against it.

The credit is disabled now and `setAutoTopup` refuses `enabled: true`.
What remains is finding what it already created:

```
psql "$DATABASE_URL" -f scripts/audit-uncollected-topups.sql
```

The query is exact: the legitimate path (`creditTopupTx`, reachable only
from the HMAC-verified Razorpay webhook) always sets `refId`, and the
auto-top-up path never did — so `category = 'topup' AND refId IS NULL` is
precisely the uncollected set.

Decide **per row**. Writing off a legitimate top-up would be its own trust
incident. To claw one back, post a compensating debit through
`POST /wallet/adjust` with a reason — never delete the ledger row, which
would make the balance unauditable.

### 0.1 Rotate the seeded admin password on production ⛔

`docs/DEPLOY.md` seeds production on first deploy, which creates
`admin@homekrafted.example` with the shared demo password. Until M17 that
email **and that password** were compiled into the public JavaScript
bundle (`AuthContext` is a client module), so anyone who viewed source on
homekrafted.in could read them. The account is a full admin.

Assume it is compromised. The bundle was fixed by the M17 deploy
(2026-08-02); the account itself has not been. On the box:

```bash
ssh -i ~/.ssh/homekrafted_vps root@187.127.171.48
bash /var/www/homekrafted/HomeKrafted/scripts/rotate-admin.sh
```

It prompts for a new password, hashes it with the same argon2 settings
the API uses, and refuses the leaked one. Then check `AdminAuditLog` for
anything you did not do — as of 2026-08-02 it held a single legitimate
entry (a seller-application approval on 2026-07-30).

### 0.4 Social sign-in verifies nothing — account takeover ⛔

**Found by the production audit 2026-08-06. Confirmed exploitable against
a running server, not a code-reading guess.**

`POST /api/v1/auth/social/:provider` is `@Public()`, takes a
client-supplied `providerAccountId` and `email`, and **never verifies a
Google or Apple id-token**. If a `User` with that email exists it links a
`SocialAccount` and issues a full session:

```
POST /api/v1/auth/social/google
{"providerAccountId":"anything","email":"admin@homekrafted.example"}
→ 200, accessToken with {"sub":"user-admin-demo","role":"admin"}
```

Any account whose email can be guessed is takeable — the admin, and any
HomeKrafter whose payout details the attacker could then change. It
defeats every other control in the auth layer: the argon2 OTP, the
deliberate refusal to issue an admin session from a bypassed OTP
(§0.2/M18), and the rotating refresh tokens.

**The owner's decision (2026-08-06) is to keep the endpoint and the
buttons, and add the verification layer before launch** rather than remove
social sign-in and rebuild the UI later. That is defensible only while
there are no real accounts to take over — which is true today and stops
being true at the first real signup.

**This is therefore a hard launch gate, not backlog.** Closing it means
verifying a real id-token against Google's/Apple's JWKS in
`AuthService#socialLogin`, which needs a Google OAuth client ID and an
Apple service ID — neither of which exists yet. Until then, treat
`admin@homekrafted.example` as reachable by anyone, and note that §0.1's
password rotation does **not** help: this path never checks a password.

Files: `server/src/auth/auth.service.ts` (`socialLogin`),
`server/src/auth/dto/social-login.dto.ts`,
`client/components/auth/SocialSignIn.tsx`.

### 0.2 Demo accounts: kept, deliberately, for now

The seed creates demo shoppers and three demo HomeKrafters sharing one
password. **Decision (2026-08-03): they stay** while the site is being
tested, and their phone numbers are the `OTP_TEST_PHONES` allowlist.

That is a real exposure, so it is worth being exact about its size: anyone
who reads `docs/TESTING.md` can sign in as a demo shopper or a demo
kitchen and act as them. They cannot reach the admin panel — the test OTP
code is refused for admin accounts, and the admin password is not in the
bundle any more (§0.1).

**Delete them the day real customers arrive**, along with `OTP_TEST_CODE`.
Both are one action: they are the same accounts.

### 0.3 SMS, or approved HomeKrafters still cannot log in

> **Partly mitigated in M18.** `OTP_TEST_CODE`/`OTP_TEST_PHONES` make the
> phone-login flow testable without Twilio — but only for the listed demo
> numbers, so this is a testing affordance, not a fix. A *real* HomeKrafter
> you approve still cannot sign in. Delete `OTP_TEST_CODE` once Twilio is
> live.

M17 fixed the lockout in the product: a newly approved HomeKrafter signs
in with **phone OTP**, because approval never sets a password. That path
only works if OTP codes are actually delivered. `TWILIO_*` is still a
placeholder, so the code is written to the server log and nowhere else.

**M21 added a second door, and it needs a different key.** Approval now
also sends a single-use, 7-day set-password link by **email and SMS**
(`SellerInviteService`), so onboarding no longer depends on OTP alone —
`SENDGRID_API_KEY` on its own is now enough to get a real HomeKrafter in.
Two things follow:

- The admin screen **tells you when nobody was reached** ("Approved — but
  we could not reach them") and shows the link so it can be passed on by
  hand. Approving somebody no longer looks successful when it wasn't.
- `POST /admin/sellers/:id/resend-invite` re-sends and burns the older
  link, which is what you will want the first time an email bounces.

**On production today, both channels are stubs, so a real HomeKrafter you
approve is still not contacted.** This remains the single hard blocker on
onboarding anybody — but it is now satisfied by *either* SendGrid or
Twilio, not only Twilio.

---

## 1. Keys and accounts still needed

Every one of these degrades to a logged stub when left as the
`.env.example` placeholder, so nothing crashes — it just silently does
not happen. That is the dangerous shape: it looks fine.

| What | Env | Without it | Blocks |
|---|---|---|---|
| **Twilio** (SMS/OTP) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | OTP codes only appear in the server log | **HomeKrafter onboarding**, phone sign-in for everyone |
| **Razorpay live** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments run a mock path — no money moves | **Taking payment** |
| **WhatsApp Cloud API** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Snack orders and status updates are logged, never sent | **The entire snacks module**, whose only ordering channel is WhatsApp |
| **SendGrid** (email) | `SENDGRID_API_KEY` | No transactional email at all | Order confirmations, receipts |
| **`NEXT_PUBLIC_SITE_URL`** | client env | Canonicals and OG tags point at the wrong host | SEO, link previews |

Razorpay also needs the **webhook** registered against
`POST /api/v1/payments/webhook` with the matching secret; the signature is
verified against the raw bytes, so the secret must match exactly. Same for
the WhatsApp webhook and `WHATSAPP_VERIFY_TOKEN`.

---

## 2. Missing workflows a real user will hit

Ranked by how soon someone hits it.

1. ~~**No password reset, anywhere.**~~ ✅ **Shipped M18.**
   `/forgot-password` + `/reset-password`, single-use one-hour tokens,
   every session revoked on reset, and no account-existence oracle. The
   *link* still needs `SENDGRID_API_KEY` to actually leave the box —
   until then it lands in the server log, so the flow is testable but not
   yet usable by a real customer.
2. **No refund execution.** A buyer can request a return and an admin can
   resolve it, but settlement is a wallet credit — money never returns to
   the card it came from. Razorpay refunds are not wired.
3. **No payout execution.** `POST /admin/payouts/:id/pay` records a
   settlement someone performed by hand in a banking app. Fine at ten
   HomeKrafters, not at a hundred.
4. **Commission is modelled, never collected.** Payouts are gross. The
   rate on `/admin/settings` drives a projection and deducts nothing.
5. ~~**No order-confirmation email or SMS.**~~ ✅ **Wired M18**, still
   gated on §1. Every order status change now messages the buyer, and a
   new order or cancellation messages each HomeKrafter — WhatsApp, email
   and in-app by default. All of it degrades to a logged stub until
   `WHATSAPP_*` and `SENDGRID_API_KEY` are real, so the work is done and
   the delivery is not.
6. **No live delivery tracking** — deliberate (it is app-only, per the
   channel matrix), but buyers will ask.
7. **Support tickets are one-way-ish.** A customer can reply and it
   reopens, but there is no notification to either side that it happened.
   M18 wired orders, not tickets — this one is still owed.

---

## 3. Operations — currently absent

None of this is code, and all of it is what "production ready" mostly
means.

- ~~**No database backups.**~~ ✅ **M18** — `scripts/backup-db.sh`.
  Nightly verified `pg_dump`, 14 kept, plus a `--restore-drill` that
  actually restores into a throwaway database and prints row counts.
  **Still owed: getting the dumps off the box.** Local backups cover a
  bad migration and a dropped table; they do not cover losing the VPS.
- ~~**No uptime monitoring.**~~ ✅ **M18** — `scripts/healthcheck.sh`
  watches both health endpoints, the web process and the public HTTPS
  URL every five minutes, restarting a pm2 process after three
  consecutive failures. **Still owed: an external check**, since this one
  runs on the box it watches. UptimeRobot pointed at
  `https://homekrafted.in/health` closes it in five minutes.
- ~~**No log rotation policy.**~~ ✅ **M18** — `pm2-logrotate` setup
  documented in `docs/DEPLOY.md`. pm2 logs growing until the disk fills
  looks exactly like an application failure.
- **No error monitoring.** No Sentry or equivalent. A 500 on checkout is
  still invisible unless someone reads pm2 logs. This is the largest
  remaining ops gap.
- **No staging environment.** Deploys go from a laptop to production.
- **CI does not deploy.** `.github/workflows/ci.yml` tests; `deploy.sh` is
  run by hand. Reasonable for now, but nothing prevents deploying a red
  build.

---

## 3b. Take rate — the platform currently collects nothing ⛔

`commissionPct` (default 10) exists **only** as a modelled number on the
admin analytics screen. `admin/dashboard.service.ts` says it outright:
"**Nothing deducts this** — `Payout` amounts are gross and settlement is
manual." Combined with 5% cashback credited on every order and the ₹49
flat shipping fee below the ₹999 threshold, the unit economics on a
low-value item are not thin, they are inverted.

This is a commercial decision, not a bug, so no code here changes it. But
it is a hard gate on anything recurring: a subscription that runs daily
multiplies a per-order loss by the number of cycles. Two things follow.

1. **Decide the take rate before recurring revenue ships.** Either deduct
   commission when a payout is computed, or decide deliberately not to and
   write down why.
2. **Nobody should settle a payout believing a cut was taken.**
   `Payout.amount` is gross. See `docs/DATA-MODEL.md`'s `Payout` row.

## 4. Legal and commercial

Not code, and genuinely blocking for a marketplace handling food and
money in India.

- ~~**Terms of service, privacy policy, refund/cancellation policy**~~
  ✅ **Drafted M18** and live at `/terms`, `/privacy`, `/refunds`,
  `/contact`, linked from every page's footer and in the sitemap. They
  are written from what the code actually enforces rather than from a
  template — the cancellation cut-off, the seven-day return window and
  the wallet-first refund on those pages are the rules the server really
  applies.

  **Two things still block using them.** (1) `client/lib/legal.ts` holds
  placeholders for the registered legal name, address and phone; until
  those are filled in, every policy page shows a banner saying it is
  incomplete, which is deliberate — a policy carrying an invented address
  looks compliant while being false. (2) **Nobody qualified has reviewed
  them.** They are an accurate description of the product written by its
  builders, not legal advice, and they should be read by someone who
  does this for a living before real money moves.
- **FSSAI**: the platform verifies HomeKrafters' licences, and the
  platform's own obligations as an aggregator need checking.
- **GST**: registration, invoicing, and whether the platform collects TCS
  on marketplace sales.
- **Razorpay KYC** for the settlement account.
- A real **support contact** — the site currently points at internal
  tickets only.

---

## 5. Smaller things worth closing

- `/gallery` is a dev-only component gallery, unlinked but publicly
  routable in production. `robots.txt` disallows it; that is not the same
  as removing it. *(L3)*
- No pagination on several admin lists — fine now, slow at volume.
- No image CDN. Uploads are served from the app box by nginx.
- `WalletContext` still holds some client-side balance state alongside
  the authoritative server ledger. *(L2)*
- Browser-level tests for the two dialog focus traps are still owed —
  jsdom would only assert that markup looks like markup.
- No load testing has been done at all.

---

## What is genuinely ready

Worth stating, because the list above is long and the build is not thin:

- Auth, RBAC and row scoping, now with 240 end-to-end tests against a
  real database including the refusals.
- The wallet ledger is server-authoritative and idempotent.
- The trust model: verification only an admin can grant, reviews only a
  delivered order earns, aggregates recomputed rather than incremented.
- Cancellation and return windows enforced server-side.
- Admin audit logging on every mutation, with before/after state.
- CSV exports with formula injection neutralised.
- Location filtering that is never a gate.
- SEO: metadata, sitemap, robots, structured data, no soft 404s.
- Accessibility floor: skip link, focus management, real alt text.
- Images through `next/image` — 78% smaller on the home hero.
- CI running typecheck, lint, 416 tests and both builds on every push.

The gap is not the product. It is keys, backups, monitoring, and the
paperwork that lets you take money.
