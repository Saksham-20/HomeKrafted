/**
 * Messaging abstraction for order/booking status updates.
 *
 * Today (pre-M9) the only implementation is click-to-chat: a `wa.me` deep
 * link a human (or a simple automation) opens to notify a customer
 * manually — there is no server-side send. M9 drops in a WhatsApp Cloud
 * API implementation behind the same `Messaging` interface so callers
 * (Snacks WA timeline, Laundry/Order status notifications) never change.
 */

export type OrderStatusUpdate =
  | "received"
  | "accepted"
  | "out-for-delivery"
  | "delivered"
  | "cancelled";

export interface MessagingTarget {
  /** Digits only or any format — `buildWhatsAppLink` strips non-digits. */
  phone: string;
  name?: string;
}

export interface Messaging {
  /** Notify `target` that `orderRef` has moved to `state`. */
  sendStatus(
    target: MessagingTarget,
    orderRef: string,
    state: OrderStatusUpdate,
  ): Promise<void>;
}

/**
 * Builds a wa.me click-to-chat deep link.
 *
 * `phone` should be full international format (country code + number,
 * e.g. "919876543210"); any non-digit characters (spaces, "+", hyphens)
 * are stripped automatically.
 */
export function buildWhatsAppLink(phone: string, text: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${digitsOnly}?text=${encoded}`;
}

const STATUS_COPY: Record<OrderStatusUpdate, string> = {
  received: "we've received your order",
  accepted: "your order has been accepted and is being prepared",
  "out-for-delivery": "your order is out for delivery",
  delivered: "your order has been delivered — enjoy!",
  cancelled: "your order has been cancelled",
};

/**
 * Click-to-chat messaging — the only implementation available before the
 * WhatsApp Cloud API (M9) is provisioned. `sendStatus` cannot actually
 * push a message server-side; it prepares the wa.me link and payload
 * text a staff member (or a future scheduled job) uses to notify the
 * customer by hand.
 */
export class ClickToChatMessaging implements Messaging {
  constructor(private readonly businessPhone: string) {}

  async sendStatus(
    target: MessagingTarget,
    orderRef: string,
    state: OrderStatusUpdate,
  ): Promise<void> {
    const greeting = target.name ? `Hi ${target.name}, ` : "Hi, ";
    const text = `${greeting}update on order ${orderRef}: ${STATUS_COPY[state]}.`;
    const link = buildWhatsAppLink(target.phone, text);

    // No server-side send is possible with click-to-chat — this simply
    // records the prepared link. Swap for a real API call in M9.
    console.info("[messaging:click-to-chat] prepared WhatsApp status link", {
      businessPhone: this.businessPhone,
      orderRef,
      state,
      link,
    });
  }
}

/**
 * ---------------------------------------------------------------------
 * M9 STUB — WhatsApp Cloud API implementation
 * ---------------------------------------------------------------------
 * Drop-in replacement for `ClickToChatMessaging` once a Cloud API
 * business account + permanent access token are provisioned.
 * `sendStatus` will POST a template message to Meta's Graph API instead
 * of returning a manual wa.me link — no caller changes, since both
 * implement `Messaging`.
 *
 *   class CloudApiMessaging implements Messaging {
 *     constructor(private phoneNumberId: string, private accessToken: string) {}
 *
 *     async sendStatus(target, orderRef, state) {
 *       await fetch(
 *         `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`,
 *         {
 *           method: "POST",
 *           headers: {
 *             Authorization: `Bearer ${this.accessToken}`,
 *             "Content-Type": "application/json",
 *           },
 *           body: JSON.stringify({
 *             messaging_product: "whatsapp",
 *             to: target.phone,
 *             type: "template",
 *             template: {
 *               name: "order_status_update",
 *               language: { code: "en" },
 *               components: [{ type: "body", parameters: [...] }],
 *             },
 *           }),
 *         },
 *       );
 *     }
 *   }
 */

/**
 * The single business WhatsApp number every click-to-chat link on the
 * site points at — Snacks' "Send list on WhatsApp" (M5) builds its own
 * `wa.me` link directly via `buildWhatsAppLink` (the customer is
 * messaging the business, not the other way around, so it doesn't go
 * through `Messaging.sendStatus`), and should reuse this constant rather
 * than re-hardcode the number.
 */
export const HOMEKRAFTED_WHATSAPP_NUMBER = "919999999999";

/** Default export used by the app until the Cloud API impl lands. */
export const messaging: Messaging = new ClickToChatMessaging(HOMEKRAFTED_WHATSAPP_NUMBER);
