# Homekrafted

A multi-service home-craft platform — Gifting Marketplace, Laundry &
Cleaning, Snacks + Food Delivery, unified by one Wallet — built with
Next.js (App Router, TypeScript).

**Start here:** [`CLAUDE.md`](./CLAUDE.md) for project context, stack,
run commands, directory map and conventions. Product/technical docs live
in [`docs/`](./docs). `handoff/` is the design system reference — read
it, never edit it.

## Run commands

```bash
npm run dev            # dev server — http://localhost:3000
npm run build           # production build
npm run lint             # ESLint
npx tsc --noEmit         # standalone type-check
```

Fonts are Fraunces / IBM Plex Sans / IBM Plex Mono via `next/font/google`
(see `app/layout.tsx`) — not the Next.js default Geist.
