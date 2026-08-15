/**
 * Canned auto-reply matcher for the `/support` mock chat widget — simple
 * keyword rules, no LLM/backend involved (there is none pre-M9). Purely a
 * client-local convenience so the demo chat feels responsive; a real
 * support agent (human or bot) replaces this entirely once a ticketing/
 * chat backend lands.
 */

interface AutoReplyRule {
  keywords: string[];
  reply: string;
}

const RULES: AutoReplyRule[] = [
  {
    keywords: ["order", "delivery", "deliver", "track", "shipped", "shipping"],
    reply:
      "I can help with that — you can track any order under Account → Orders. If it's running late, share your order number and I'll flag it for our team.",
  },
  {
    // The keywords stay although the module is withdrawn (M19/M37):
    // someone with an old booking will still ask about it, and an honest
    // answer beats the bot pretending the word means nothing.
    keywords: ["laundry", "pickup", "pick up", "wash", "iron", "dry clean"],
    reply:
      "Laundry is no longer offered on Homekrafted. Bookings you already made still show under Account → Orders — raise a ticket below if one needs attention.",
  },
  {
    keywords: ["refund", "cancel", "return"],
    reply:
      "Refunds are credited straight to your Homekrafted wallet, usually within a few hours of approval. Want me to raise a ticket for this below?",
  },
  {
    keywords: ["wallet", "cashback", "balance", "top up", "topup"],
    reply:
      "Your wallet balance and full transaction history live under Wallet in the header — cashback and refunds show up there as credit lines.",
  },
  {
    keywords: ["referral", "invite", "loyalty", "points", "tier"],
    reply:
      "Your referral code and loyalty tier are under Account → Referrals — invites earn wallet credit once your friend places their first order.",
  },
  {
    keywords: ["snack", "whatsapp"],
    reply:
      "Snacks are ordered over WhatsApp — build your list on the Snacks page and tap \"Send list on WhatsApp\" to confirm with our team.",
  },
];

const DEFAULT_REPLY =
  "Thanks for reaching out! A member of our team will follow up shortly. You can also raise a ticket below, or call us for anything urgent.";

/** Returns the first matching canned reply for `message`, or a generic fallback. */
export function getAutoReply(message: string): string {
  const lower = message.toLowerCase();
  const match = RULES.find((rule) => rule.keywords.some((keyword) => lower.includes(keyword)));
  return match?.reply ?? DEFAULT_REPLY;
}
