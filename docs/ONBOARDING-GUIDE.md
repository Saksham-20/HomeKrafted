# HomeKrafted Onboarding Guide

Purpose: this guide is for operating the end-to-end HomeKrafter onboarding flow from first application to first successful sign-in.

## Who this is for

- Ops/admin staff who review applications.
- Support staff helping a newly approved HomeKrafter sign in.
- Product/QA teammates validating onboarding behavior.

## Primary routes

- Public apply page: /sell
- Admin queue: /admin/sellers (Approval queue tab)
- Admin seller detail: /admin/sellers/[id]
- Sign-in: /login
- Forced first password rotation: /set-password
- Password reset link target: /reset-password

## Onboarding states

A seller can appear in one of these practical states in admin:

- No sign-in yet: approved account has no credentials yet.
- Details issued: temporary credentials were created but not yet used.
- Signed in: HomeKrafter has signed in and set their own password.

These are surfaced in admin filters and row badges and are not equivalent.

## Step 1: Intake on /sell

The seller application form captures:

- Required: businessName, contactName, email, phone, specialties, shippingFrom, description.
- Optional: delivery radius, Instagram URL, website URL, years making, capacity/day.
- Conditional optional: FSSAI number (only for food makers).

Operational notes:

- The form validates business/contact names and contact details before submit.
- Unknown/non-tricity origin can enter waitlist-style handling (area set to other).
- Submission lands in the real admin approval queue.

## Step 2: Review in Admin Approval Queue

Go to /admin/sellers and switch to Approval queue.

For each application:

1. Review submitted details (specialties, location, description, contact quality).
2. If area is unresolvable for approval, assign/fix area first.
3. Approve or reject.

On approve:

- System creates/activates seller records and storefront linkage.
- Invite flow attempts delivery by email and SMS.
- If both channels fail, admin is explicitly warned and a fallback link can be handed over.

## Step 3: Deliver sign-in access

There are two supported access paths for a newly approved HomeKrafter:

1. Invite link path:
- Admin can resend invite from /admin/sellers.
- Invite links are single-use and expire (7 days).
- Resending burns the previous invite link.

2. Temporary credential path:
- In /admin/sellers row or seller detail, open Sign-in details for pending users.
- If no credentials exist, create sign-in details.
- Read or copy username + temporary password to the HomeKrafter.
- Temporary password is force-rotated at first sign-in.

Important:

- Do not issue credentials for users already signed in.
- Suspended sellers should not receive sign-in credentials.

## Step 4: First sign-in and forced rotation

Expected behavior:

1. HomeKrafter signs in via /login.
2. If using temporary credentials, they are redirected to /set-password.
3. They must set a new password before accessing seller pages.
4. After successful change, temp credentials are no longer valid or visible.

This forced rotation is part of the security model and should not be bypassed.

## Duplicate and edge-case handling

- Duplicate application from existing HomeKrafter: reject duplicate and help recover access.
- Invite not delivered: use resend invite, then fallback operational handoff if still unreachable.
- Account stuck without credentials: use Create sign-in details.
- Locked-out but previously onboarded: prefer reset/invite path instead of issuing new temp credentials indiscriminately.

## Daily onboarding checklist (admin)

1. Clear Approval queue first.
2. Resolve no-credentials and details-issued sellers next.
3. Re-send invites where delivery failed.
4. Confirm newly approved sellers reach Signed in status.
5. Escalate repeated delivery failures (provider config/ops issue).

## Related guides

- Seller operations: docs/SELLER-DASHBOARD-GUIDE.md
- Admin operations: docs/ADMIN-DASHBOARD-GUIDE.md
- QA/test expectations: docs/TESTING.md
- Endpoint contract: docs/API.md
