/**
 * Support screen content — the phone number the `/support` call CTA
 * (`tel:` link) points at, and the greeting the mock chat widget opens
 * with. Not a domain entity (no `lib/types` shape), so this stays a
 * small content seed rather than growing its own type.
 */

/** Human-readable display form, for the visible CTA label. */
export const SUPPORT_PHONE_DISPLAY = "+91 80 4718 2020";

/** Digits-only `tel:` target. */
export const SUPPORT_PHONE_TEL = "+918047182020";

export const SUPPORT_HOURS = "Mon–Sat, 9am–8pm IST";

/** First message the mock chat widget shows before the shopper types anything. */
export const SUPPORT_CHAT_GREETING =
  "Hi! I'm the Homekrafted support bot. Ask me about an order, laundry pickup, refund, or wallet — or raise a ticket below for anything else.";
