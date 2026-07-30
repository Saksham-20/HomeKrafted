import { formatCurrency } from "@/lib/format";
import type { SnackListItem } from "@/lib/types";

/**
 * Builds the WhatsApp message text for a customer's snack list — the
 * payload `buildWhatsAppLink` (lib/messaging.ts) turns into a `wa.me`
 * click-to-chat URL. Mirrors the mock `sampleSnackList.whatsappPayload`
 * format (lib/data/snacks.ts) so a real (client-built) list and the demo
 * fixture read identically in chat:
 *
 *   Hi Homekrafted! I'd like to order:
 *   1x Masala Mathri
 *   1x Besan Ladoo
 *
 *   Estimated total: ₹280
 *
 * Snacks has no on-site checkout (see `lib/channel.ts` —
 * `snacks.hasCheckoutOnWeb === false`); this text, sent via wa.me, is the
 * entire "order" — the vendor confirms final price & slot back in chat.
 */
export function buildSnackListMessage(
  items: SnackListItem[],
  estimateTotal: number,
  /** Pre-order slot, e.g. "Tomorrow, 6 – 8 PM". Omitted means "as soon as you can". */
  requestedSlot?: string,
): string {
  const lines = items.map((item) => `${item.quantity}x ${item.name}`);
  return [
    "Hi Homekrafted! I'd like to order:",
    ...lines,
    "",
    `Estimated total: ${formatCurrency(estimateTotal)}`,
    // The slot goes in the message rather than into an order record on the
    // site: Snacks has no on-site checkout, so the chat *is* the order, and
    // the kitchen needs to see the requested time in the same place.
    ...(requestedSlot ? [`Requested for: ${requestedSlot}`] : []),
  ].join("\n");
}
