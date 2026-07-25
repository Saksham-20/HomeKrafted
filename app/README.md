# app/ — Homekrafted native mobile apps (placeholder)

The **native iOS/Android apps** (planned: React Native / Expo). Empty for now — the web app (`client/`) ships first; the mobile apps come after and consume the same backend (`server/`).

## Why the apps exist (per the product spec, these flows are app-only)
- **Full-meal food delivery** — ordering + menu + cart + checkout live entirely in the app (web shows a promo section + store badges + install QR only).
- **Live rider / order tracking** — real-time pickup/delivery tracking for Laundry and Food is app-only (web shows a basic status line + "track on the app").
- Plus the full shared surface (Marketplace, Laundry booking, Wallet, Snacks, account) for on-the-go use.

## Shared with the web
- **Backend:** the same `server/` API — one source of truth for auth, wallet, orders, catalog.
- **Design system:** the same `handoff/` tokens + visual language, re-expressed in native components.
- **Types:** mirror `client/lib/types` so the domain model stays identical across web + mobile.

Scaffold this when the web milestones (M0–M9) are far enough along to share a stable API + design language.
