# server/ — Homekrafted backend API (placeholder)

The **single backend API shared by both the web app (`client/`) and the native mobile apps (`app/`)**. Empty for now — the platform is being built frontend-first, so the web's data layer currently runs on typed mock stubs in `client/lib/api`.

## Lands in M8 (see the plan)
- **Postgres + Prisma** — schema derived from `client/lib/types` (the frontend types are the schema contract).
- **Auth** — phone OTP + email + social, issued as tokens/sessions usable by *both* web and mobile (not web-only).
- **Wallet ledger** — server-authoritative, idempotent; single balance across Marketplace + Laundry + Snacks; instant refunds.
- **Razorpay** — payments + refunds + webhook signature verification.
- **Domain APIs** — marketplace, orders, laundry bookings + subscriptions, reviews, referral/loyalty, corporate + seller inquiries.
- **Messaging** — WhatsApp (click-to-chat now → Cloud API status automation in M9), SMS/email notifications.

At M8 the `client/lib/api` mock functions swap to real calls against this service — one layer changes.

## Security principles (M8 contract)
Server-authoritative pricing (never trust client totals) · zod/DTO validation · rate-limited OTP · per-user ownership checks · verified payment webhooks · least-privilege DB access.
