# Homekrafted

Multi-service home-craft platform — **Gifting Marketplace**, **Laundry / Cleaning / Ironing**, **Snacks + Food Delivery**, unified by one **Wallet** and a shared account layer.

## Monorepo layout

| Path | What |
|------|------|
| `client/` | **Next.js web app** — all web source. Built frontend-first with typed mock data (`client/lib/api`). |
| `server/` | **Standalone backend API** — shared by the web *and* the native apps. Lands in M8 (Postgres + Prisma, Auth.js, wallet ledger, Razorpay, WhatsApp). Placeholder for now. |
| `app/` | **Native mobile apps** (React Native / Expo) — future. Hosts the app-only flows (full-meal ordering, live rider tracking). Placeholder for now. |
| `handoff/` | Design system (tokens, components, `Homekrafted.dc.html` prototype) — **read-only reference, never edit**. |
| `docs/` | PRD, API, architecture, data model, design system, ADRs. |
| `CLAUDE.md` | Start-here context for any human/agent session. |
| `CHANGELOG.md` | One entry per milestone. |

## Run the web app

```bash
cd client
npm install      # first time
npm run dev      # http://localhost:3000
```

See `CLAUDE.md` for conventions and `~/.claude/plans/read-the-handoff-i-jolly-hennessy.md` for the full build plan.
