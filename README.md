# Homekrafted

A home-craft platform: a **Gifting Marketplace** (multi-vendor, homemade
food + handcrafted goods, hampers, occasions), **Snacks on WhatsApp**,
**meal-plan subscriptions** with dated menus, and one shared **Wallet**
and account layer across three role surfaces — consumer `/`, HomeKrafter
`/seller/*`, admin `/admin/*`. Laundry was a fourth module and is
**withdrawn** (M19; browse API removed M37) — existing bookings still
render, nothing new can be created.

**Live:** https://homekrafted.in — see `docs/DEPLOY.md` for the runbook
and `docs/TESTING.md` for the tester handout and demo accounts.

## Monorepo layout

| Path | What |
|------|------|
| `client/` | **Next.js web app** (App Router, CSS Modules over `styles/tokens.css`) — all web source. `client/lib/api` makes real HTTP calls to `server/`; `NEXT_PUBLIC_USE_MOCK=true` reverts every module to typed in-memory mocks for offline frontend work. |
| `server/` | **NestJS + Prisma + Postgres 16 backend** — live, shared by the web and the future native apps. JWT auth/RBAC, wallet ledger, payouts + commission engine, Razorpay (test keys), moderation queue, meal subscriptions, uploads pipeline. |
| `app/` | Native mobile apps (React Native / Expo) — future; placeholder. |
| `e2e/` | Playwright suite + `sweep.mjs` (87 routes × 4 roles × 2 viewports). |
| `scripts/` | `deploy.sh` (pull + build + migrate + pm2 restart), `healthcheck.sh`. |
| `handoff/` | Design system (tokens, components, reference prototype) — **read-only, never edit**. |
| `docs/` | PRD, API, architecture, data model, deploy, testing, launch readiness, production audit. |
| `CLAUDE.md` | Start-here context for any human/agent session — read it first. |
| `CHANGELOG.md` | One entry per milestone. |

## Run it

```bash
# Web (all web commands run from client/)
cd client
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (also type-checks)
npm test             # jest unit specs

# API
cd server
npm install
npx prisma migrate dev
npm run start:dev    # http://localhost:4000
npm test             # unit (stub Prisma)
npm run test:e2e     # real Nest app against real Postgres — needs
                     # TEST_DATABASE_URL, see docs/TESTS.md

# Browser tests (servers must already be running — no webServer block)
npx playwright test
node e2e/sweep.mjs   # full route × role × viewport screenshot sweep
```

See `CLAUDE.md` for conventions (they are enforced by tests in several
places) and `docs/LAUNCH-READINESS.md` for what stands between this
build and real customers.
