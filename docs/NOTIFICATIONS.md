# Notifications — every message this platform sends

What goes out, to whom, on which channel, and from which line of code
(2026-09-04). Keep it in step when you add a trigger: a message nobody
can find the source of is a message nobody can turn off.

Two entirely different paths, and the difference matters.

---

## 1. Direct sends — always email, preferences do not apply

These bypass `NotificationPreference` on purpose: each one is either a
credential or a legal/commercial document, and a person who has switched
off "account" email still has to be able to get into their account.

| When | To | Code | Notes |
|---|---|---|---|
| **Sign-in code requested** with an email identifier | that address | `auth/otp.service.ts` | Goes by SMS instead when the identifier is a phone number. The whole one-time-code door exists because a real kitchen may have no password (M17/M32). |
| **Password reset requested** (`POST /auth/password/forgot`) | the account's email | `auth/auth.service.ts#forgotPassword` | Single-use, 60-minute link. Always answers `200`, whether or not the address exists — an enumeration guard. |
| **Account created** with an email — register, `POST /auth/continue`, social | the new account | `auth/auth.service.ts#sendWelcomeEmail`, fired from `createUserWithAccounts` | Every signup route, because it hangs off the one place that mints a user. Never awaited: a mail outage must not fail a signup. A phone-OTP-only account has no address, so nothing is sent. |
| **HomeKrafter application approved**, and **"resend invite"** | the applicant | `admin/seller-invite.service.ts#sendApprovalInvite` | Email **and** SMS. Carries the single-use, 7-day set-password link — never a password (a mailed password sits readable in an inbox forever and is the credential that can change payout details). The admin screen reports per-channel delivery and shows the link for hand-delivery when nothing landed. |
| **Corporate quote sent** by an admin | the enquiry's contact | `admin/corporate.service.ts` | Total, validity date and a unique quote link. |

## 2. `deliver()` — inbox row + the channels that recipient allows

Everything else goes through `NotificationsDeliveryService.deliver`,
which reads that person's `NotificationPreference` for the category and
fans out. Defaults (`defaultChannelsFor`): **WhatsApp + email + in-app
on, SMS off** for every transactional category; **in-app only** for
`promo`, because a WhatsApp block is per-sender and one marketing message
costs every future order update to that person.

Each email renders through the shared shell with a button whose
destination comes from `refType`/`category`, and a line saying why they
received it.

### Buyer

| When | Code | Category |
|---|---|---|
| Order reaches `pending_payment`, `placed`, `confirmed`, `packed`, `shipped`, `delivered`, `cancelled`, `returned` — from checkout, the kitchen's portal, an admin override, or a courier callback | `orders/order-notifications.service.ts#notifyBuyerOfStatus` + `orders/order-status-copy.ts` | `order` |
| A courier booking succeeds and the parcel has a waybill | `#notifyBuyerOfDespatch` | `order` |
| An admin refunds an order | `#notifyBuyerOfRefund` | `wallet` |
| An admin credits or debits their wallet | `admin/wallet.service.ts` | `wallet` |
| A support ticket is replied to, or resolved | `admin/support.service.ts` | `account` |
| Meal subscription created, paused, resumed, cancelled, renewed | `meals/meal-subscriptions.service.ts` | `meals` |
| A kitchen blacks out a date their meals were scheduled on | `meals/blackout-cascade.service.ts` | `meals` |
| A dated menu they are scheduled for is **changed** (a first-time set notifies nobody) | `meals/day-menus.service.ts` | `meals` |

### HomeKrafter

| When | Code | Category |
|---|---|---|
| A new order lands on their kitchen | `orders/order-notifications.service.ts#notifySellerOfNewOrder` | `order` |
| A buyer cancels an order they may have started | `#notifySellerOfCancellation` | `order` |
| A listing is approved, rejected, hidden, taken down or flagged — the moderator's reason is carried **verbatim** | `admin/moderation-notifications.service.ts` | `account` |
| A category/occasion they suggested is added or declined | `admin/taxonomy-suggestions.service.ts` | `account` |
| A payout is approved, sent or declined | `admin/payouts.service.ts` | `wallet` |
| A verification badge is granted or withdrawn | `admin/sellers.service.ts` | `account` |
| Their application is approved (also the invite above) or declined | `admin/sellers.service.ts` | `account` |
| **Somebody reviews their listing or storefront** | `reviews/reviews.service.ts#notifySeller` | `account` |

### Admin

| When | Code | Category |
|---|---|---|
| A corporate or bulk enquiry is submitted | `corporate/corporate.service.ts#notifyAdmins` | `account` |

---

## Rules that hold across all of it

- **A notification never throws into its caller.** Every call site is
  `void`-ed and every method swallows and logs. A paid order must not
  roll back because a message failed.
- **Every path that writes `Order.status` owes the buyer a message** —
  three modules do, and all three go through
  `OrderNotificationsService`, never a bare `notify()`.
- **A refusal carries its reason, verbatim** (M22). Moderation and
  taxonomy declines pass the admin's sentence through untouched: it is
  the only thing telling somebody what to change.
- **Category `account`, never `promo`, for anything transactional** —
  see the WhatsApp-block reasoning above.
- **No email is sent to an address we do not have.** A channel with no
  contact detail is skipped with a debug log, not an error.
- **With no provider key, nothing is sent** and the message is logged
  `[EMAIL STUB]`. That is a supported state, and the admin approve screen
  reads it to say "we could not reach them" rather than claiming success.
