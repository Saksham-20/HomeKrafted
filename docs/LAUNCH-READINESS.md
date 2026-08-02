# Launch readiness

What stands between the current build and taking real money from real
people in the tricity. Written 2026-08-02, after M17.

`docs/PRODUCTION-AUDIT.md` is the *product* backlog — what to build next.
This is the *launch* checklist — what must be true before the first real
customer, most of which is configuration and operations rather than code.

Ordered by what blocks what.

---

## 0. Do this first — the site is live and these are open now

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

### 0.2 Decide whether demo accounts belong on production at all

The seed also creates demo shoppers and three demo HomeKrafters, all
sharing one password, all still live. They are useful for testing and
indefensible on a site taking payments. Either give production its own
seed without them, or delete them once real data exists.

### 0.3 SMS, or approved HomeKrafters still cannot log in

M17 fixed the lockout in the product: a newly approved HomeKrafter signs
in with **phone OTP**, because approval never sets a password. That path
only works if OTP codes are actually delivered. `TWILIO_*` is still a
placeholder, so the code is written to the server log and nowhere else.

**On production today, a real HomeKrafter you approve cannot sign in.**
This is the single hard blocker on onboarding anybody.

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

1. **No password reset, anywhere.** There is no "forgot password" endpoint
   and no UI. A shopper who forgets theirs has no route back in unless
   they happen to have a phone on the account. This is week-one support
   volume, and it is not a small build: token issue, expiry, single-use,
   email delivery.
2. **No refund execution.** A buyer can request a return and an admin can
   resolve it, but settlement is a wallet credit — money never returns to
   the card it came from. Razorpay refunds are not wired.
3. **No payout execution.** `POST /admin/payouts/:id/pay` records a
   settlement someone performed by hand in a banking app. Fine at ten
   HomeKrafters, not at a hundred.
4. **Commission is modelled, never collected.** Payouts are gross. The
   rate on `/admin/settings` drives a projection and deducts nothing.
5. **No order-confirmation email or SMS.** Depends on §1.
6. **No live delivery tracking** — deliberate (it is app-only, per the
   channel matrix), but buyers will ask.
7. **Support tickets are one-way-ish.** A customer can reply and it
   reopens, but there is no notification to either side that it happened.

---

## 3. Operations — currently absent

None of this is code, and all of it is what "production ready" mostly
means.

- **No database backups.** `docs/DEPLOY.md` has no backup step, no
  `pg_dump` cron, no restore drill. A single bad migration or a dropped
  table loses every order, wallet balance and review. **This is the
  highest-severity item in this document after §0.** A nightly dump to
  off-box storage plus one tested restore is a day's work.
- **No error monitoring.** No Sentry or equivalent. A 500 on checkout is
  invisible unless someone reads pm2 logs.
- **No uptime monitoring or alerting.** `/health` and `/health/db` exist
  and nothing watches them.
- **No log rotation policy** documented for pm2/nginx.
- **No staging environment.** Deploys go from a laptop to production.
- **CI does not deploy.** `.github/workflows/ci.yml` tests; `deploy.sh` is
  run by hand. Reasonable for now, but nothing prevents deploying a red
  build.

---

## 4. Legal and commercial

Not code, and genuinely blocking for a marketplace handling food and
money in India.

- **Terms of service, privacy policy, refund/cancellation policy** —
  Razorpay requires published refund and contact policies before
  activating a live account.
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

- Auth, RBAC and row scoping, now with 189 end-to-end tests against a
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
- CI running typecheck, lint, 365 tests and both builds on every push.

The gap is not the product. It is keys, backups, monitoring, and the
paperwork that lets you take money.
