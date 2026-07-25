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
export function buildSnackListMessage(items: SnackListItem[], estimateTotal: number): string {
  const lines = items.map((item) => `${item.quantity}x ${item.name}`);
  return [
    "Hi Homekrafted! I'd like to order:",
    ...lines,
    "",
    `Estimated total: ${formatCurrency(estimateTotal)}`,
  ].join("\n");
}
