# Admin Dashboard Guide

Purpose: this guide describes how to run platform operations from the admin surface.

## Access

- Admin portal root: /admin
- Admin sign-in: /admin/login
- Admin role is required for all /admin routes.

## Admin navigation map

Current admin nav:

- Dashboard: /admin
- Users: /admin/users
- HomeKrafters: /admin/sellers
- Orders: /admin/orders
- Catalog: /admin/catalog
- Wallet: /admin/wallet
- Payouts: /admin/payouts
- Support: /admin/support
- Corporate: /admin/corporate
- Collections: /admin/collections
- Analytics: /admin/analytics
- Audit: /admin/audit
- Settings: /admin/settings

## Queue-first daily operating rhythm

1. Dashboard: read queue pressure and oldest waiting indicators.
2. HomeKrafters: clear approval queue and onboarding blockers.
3. Catalog: clear pending listing moderation.
4. Support and Corporate: clear customer and business response queues.
5. Orders and Payouts: close money-impacting operational tasks.
6. Audit: spot-check sensitive actions.

## Route-by-route operating playbook

### Dashboard (/admin)

Use as command center:

- GMV and order volume trends.
- Pending applications and pending listings age.
- Wallet liability and payout pressure.

Act on cards by jumping directly into the linked queue.

### HomeKrafters (/admin/sellers)

Use for seller lifecycle and status:

- All HomeKrafters tab: status, specialty, onboarding state.
- Approval queue tab: approve/reject applications.
- Sign-in details: create/reissue temporary details only for not-yet-onboarded sellers.
- Seller detail: full profile, contact, listing stats, verification controls.

### Users (/admin/users)

Use for account-level control:

- Search/filter by role and status.
- Suspend/reactivate with care.

### Orders (/admin/orders)

Use for cross-module order oversight:

- Unified view across marketplace, laundry legacy records, and snack orders.
- Investigate edge cases and apply valid operational actions.

Money guardrail:

- Handle order refunds from order-specific flows, not as generic wallet adjustments.

### Catalog (/admin/catalog)

Use for listing moderation:

- Review pending listings.
- Approve/hide/flag as required.
- Keep moderation notes explicit and actionable.

### Wallet (/admin/wallet)

Use for platform liability and account-level ledger review:

- Inspect user wallet balances and transaction history.
- Use manual adjustments only for non-order corrective operations.

### Payouts (/admin/payouts)

Use to process HomeKrafter settlements:

- Review pending payout requests.
- Mark paid with proper transfer reference discipline.

### Support (/admin/support)

Use as customer resolution queue:

- Prioritize unresolved tickets first.
- Move tickets through clear states and leave meaningful notes.

### Corporate (/admin/corporate)

Use for bulk inquiry handling:

- Review requests and progress them through quote/response lifecycle.

### Collections (/admin/collections)

Use for merchandising and occasion surfaces:

- Curate collections and ordering.
- Maintain occasion-linked content and promo bands.

### Analytics (/admin/analytics)

Use for strategic readouts:

- Top sellers/products.
- Orders by module and wallet movement.
- User growth and trend diagnostics.

### Audit (/admin/audit)

Use for accountability and investigations:

- Review admin mutations chronologically.
- Validate that sensitive actions are traceable and justified.

### Settings (/admin/settings)

Use for platform-level operational configuration.

## Onboarding escalation rules

- Approved but unreachable seller: resend invite, then operationally hand over details if needed.
- No sign-in yet cohort: prioritize until they become Signed in.
- Duplicate seller applications: reject duplicate and route the person to account recovery.

## Incident triage shortcuts

- Sign-in/access incidents: check role, status, and onboarding state in /admin/sellers.
- Refund disputes: validate order state in /admin/orders before touching wallet tools.
- Moderation backlog: use oldest-waiting signals from dashboard and clear by SLA order.

## Related guides

- Onboarding flow and first-access handling: docs/ONBOARDING-GUIDE.md
- Seller-side operating guide: docs/SELLER-DASHBOARD-GUIDE.md
- API behavior and status contracts: docs/API.md
- Test scenarios and demo accounts: docs/TESTING.md
