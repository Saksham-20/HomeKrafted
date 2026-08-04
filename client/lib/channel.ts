/**
 * Channel rules — the enforceable form of the plan's channel matrix:
 *
 *   Module        Browse web   Checkout web        Live tracking
 *   Marketplace   yes          web                  status only
 *   Snacks        yes          WhatsApp (no cart)     WhatsApp text
 *   Full meals    promo only   app only               app only
 *   Laundry       WITHDRAWN (M19) — see `enabled` below
 *
 * Screens should read these flags rather than re-encoding the rules:
 * e.g. the Snacks screen (M5) must check `hasCheckoutOnWeb === false` and
 * never render a checkout button; the full-meals promo page must check
 * `hasMenuOnWeb === false` and never render a menu/cart.
 *
 * Laundry's rule stays in the table on purpose even though the module is
 * gone. `ChannelKey` is part of the order-history types, and a customer
 * who booked a pickup before M19 still has to be able to read that order
 * — deleting the entry would break rendering their own past. Check
 * `isChannelEnabled` before offering anything new.
 */

export type ChannelKey = "marketplace" | "laundry" | "snacks" | "full-meals";

export type OrderVia =
  | "web-checkout"
  | "web-checkout-or-cod"
  | "whatsapp"
  | "app-only";

export type LiveTracking = "status-only" | "whatsapp-status" | "app-only";

/** Visual variant a <ChannelBadge> (built in M1) maps to a pill style. */
export type ChannelBadgeVariant = "pine" | "gold-dark" | "whatsapp";

export interface ChannelBadgeConfig {
  label: string;
  variant: ChannelBadgeVariant;
}

export interface ChannelRule {
  key: ChannelKey;
  label: string;
  /**
   * Is this module offered at all right now?
   *
   * Distinct from every other flag here, which describe *how* a live
   * module behaves. `enabled: false` means the module is withdrawn: no nav
   * entry, no route, and on the server the create endpoints return `410`.
   * Laundry is the first (M19).
   *
   * Read it via `isChannelEnabled`, not by reaching into `CHANNEL_RULES` —
   * a flag nothing consults is decoration.
   */
  enabled: boolean;
  /** Can the customer browse a catalog/menu on the website at all? */
  hasMenuOnWeb: boolean;
  /** Does the website carry a cart for this module? */
  hasCartOnWeb: boolean;
  /** Does the website carry its own checkout/payment step? */
  hasCheckoutOnWeb: boolean;
  /**
   * Can the customer schedule *when* they want it, on the web?
   *
   * Deliberately separate from `hasCheckoutOnWeb`. Snacks take no payment
   * on the site and never will — but "I want this at 6pm tomorrow" is
   * scheduling information, not a transaction, and it rides along in the
   * WhatsApp handoff. Keeping the two flags apart is what lets Snacks
   * offer pre-order without reopening the cart question.
   */
  hasPreOrderOnWeb: boolean;
  orderVia: OrderVia;
  liveTracking: LiveTracking;
  badge: ChannelBadgeConfig;
  /** Human-readable rationale, surfaced in dev tooling / docs. */
  notes: string;
}

export const CHANNEL_RULES: Record<ChannelKey, ChannelRule> = {
  marketplace: {
    key: "marketplace",
    enabled: true,
    label: "Gifting Marketplace",
    hasMenuOnWeb: true,
    hasCartOnWeb: true,
    hasCheckoutOnWeb: true,
    hasPreOrderOnWeb: true,
    orderVia: "web-checkout",
    liveTracking: "status-only",
    badge: { label: "Book online now", variant: "pine" },
    notes: "Full e-commerce on web. No live rider tracking — status stepper only.",
  },
  laundry: {
    key: "laundry",
    enabled: false,
    label: "Laundry, Cleaning & Ironing",
    hasMenuOnWeb: true,
    hasCartOnWeb: true,
    hasCheckoutOnWeb: true,
    hasPreOrderOnWeb: true,
    orderVia: "web-checkout-or-cod",
    liveTracking: "app-only",
    badge: { label: "Book online now", variant: "pine" },
    notes:
      "Bookable end-to-end on web, wallet/online or COD. Real-time pickup/delivery tracking is app-only — web shows a status line + \"track on the app\" band.",
  },
  snacks: {
    key: "snacks",
    enabled: true,
    label: "Snacks",
    hasMenuOnWeb: true,
    hasCartOnWeb: false,
    hasCheckoutOnWeb: false,
    // Pre-order without a cart: the chosen day/window is written into the
    // WhatsApp message rather than into an order record on this site.
    hasPreOrderOnWeb: true,
    orderVia: "whatsapp",
    liveTracking: "whatsapp-status",
    badge: { label: "Order on WhatsApp", variant: "whatsapp" },
    notes:
      "Browsable menu on web, but NO on-site cart or checkout. The selection is sent as a WhatsApp message (wa.me); status (received → accepted → out for delivery) is communicated back over WhatsApp text.",
  },
  "full-meals": {
    key: "full-meals",
    enabled: true,
    label: "Food Delivery — Full Meals",
    hasMenuOnWeb: false,
    hasCartOnWeb: false,
    hasCheckoutOnWeb: false,
    // Pre-order interest only — there's still no menu on the web, so this
    // registers "I want meals, at these times" rather than an actual order.
    hasPreOrderOnWeb: true,
    orderVia: "app-only",
    liveTracking: "app-only",
    badge: { label: "On the app · Coming soon", variant: "gold-dark" },
    notes:
      "Web is promotional only — no menu, no cart, no checkout. Ordering and live tracking are entirely in the Homekrafted app.",
  },
};

/**
 * Whether a module is offered at all. The one thing that should gate a nav
 * entry, a route, or a create endpoint.
 */
export function isChannelEnabled(key: ChannelKey): boolean {
  return CHANNEL_RULES[key].enabled;
}

export function getChannelRule(key: ChannelKey): ChannelRule {
  return CHANNEL_RULES[key];
}

export function getChannelBadge(key: ChannelKey): ChannelBadgeConfig {
  return CHANNEL_RULES[key].badge;
}
