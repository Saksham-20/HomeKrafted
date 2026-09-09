/**
 * The support contact details and the chat greeting.
 *
 * **Moved out of `lib/data/` on 2026-09-06 for the same reason as
 * `lib/referrals/loyalty-copy.ts`.** `getSupportPhone` and
 * `getSupportChatGreeting` return these **unconditionally** — no
 * `isMockMode()` branch, because a phone number is not a fixture — and
 * the native app resolves everything under `lib/data/` to a throwing
 * stub. Both functions therefore threw on a device while compiling,
 * typechecking and passing every test here.
 *
 * `lib/data/support.ts` re-exports them, so nothing that imported them
 * from there has to change.
 *
 * **The two phone forms are deliberately separate.** The display form is
 * what somebody reads; the digits-only form is what a `tel:` link dials.
 * Deriving one from the other by stripping characters is how a number
 * ends up dialling wrong in one locale.
 */

/** Human-readable display form, for the visible CTA label. */
export const SUPPORT_PHONE_DISPLAY = "+91 80 4718 2020";

/** Digits-only `tel:` target. */
export const SUPPORT_PHONE_TEL = "+918047182020";

export const SUPPORT_HOURS = "Mon–Sat, 9am–8pm IST";

/** First message the chat widget shows before the shopper types anything. */
export const SUPPORT_CHAT_GREETING =
  "Hi! I'm the Homekrafted support bot. Ask me about an order, refund, or wallet — or raise a ticket below for anything else.";
