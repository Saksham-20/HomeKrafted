import type { Product } from "@/lib/types";
import { giftFactLine } from "@/lib/gift/fact-line";

/**
 * What the product page says about getting this thing to somebody.
 *
 * **It branches on `kind` first, and that is the whole fix.** The panel
 * decided everything from `shippingScope` alone, so a crocheted teddy
 * whose scope was still `local` — any craft listed before the
 * 2026-09-15 "a gift is always national" rule, which is most of them —
 * was described to buyers as "Tricity delivery in 2–4 hours", "Fresh
 * batch prepared daily", and on a refused pincode "Kitchen delivers
 * within 15 km". A soft toy is not a kitchen, has no fresh batch, and
 * posts anywhere in India.
 *
 * That is the M51 rule met from the other side: there, a `kind` branch
 * invented a trust claim; here, the *absence* of a `kind` branch invented
 * a delivery claim. Both are the platform saying something on a maker's
 * behalf that no column supports.
 *
 * Pure and clock-free, so the server render and the browser agree.
 */

/** A craft posts anywhere; only food is ever bound to the tricity. */
export function isPosted(product: Pick<Product, "kind" | "shippingScope">): boolean {
  if (product.kind === "craft") return true;
  return product.shippingScope === "national";
}

/** The headline on the delivery block, before a pincode has been checked. */
export function deliveryTitle(product: Pick<Product, "kind" | "shippingScope">): string {
  return isPosted(product)
    ? "Posted anywhere in India · 3–5 business days"
    : "Tricity delivery in 2–4 hours";
}

/**
 * The line under it.
 *
 * For a gift this is the G1 fact line — what the maker actually answered —
 * and `null` when they answered nothing, because a quiet line beats an
 * invented one. Only food gets the kitchen's language, and only a food
 * listing's own `prepTimeMins` is read as minutes: on a craft that column
 * counts days, so "(10080 mins notice)" was the other half of the same bug.
 */
export function deliverySubtitle(
  product: Pick<Product, "kind" | "shippingScope" | "prepTimeMins" | "fulfilment" | "isPersonalisable">,
  deliveryNote?: string,
): string | null {
  if (product.kind === "craft") return giftFactLine(product);
  if (product.prepTimeMins) return `Prepared fresh to order (${product.prepTimeMins} mins notice)`;
  return `Fresh batch prepared daily${deliveryNote ? ` · ${deliveryNote}` : ""}`;
}

/**
 * What a checked pincode says.
 *
 * A posted item is serviceable everywhere, so the refusal branch is
 * unreachable for a gift — which is the point. The kitchen sentence is
 * only ever shown for something a kitchen actually delivers.
 */
export function pincodeMessage(
  product: Pick<Product, "kind" | "shippingScope">,
  pincode: string,
  district: string | undefined,
  servicedLocally: boolean,
): { serviced: boolean; message: string } {
  const place = district ? ` (${district})` : "";

  if (isPosted(product)) {
    return {
      serviced: true,
      message: `✓ Delivering to ${pincode}${place} · 3–5 business days · posted anywhere in India`,
    };
  }

  if (servicedLocally) {
    return {
      serviced: true,
      message: `✓ Delivering to ${pincode}${place} · 2–4 hours fresh delivery · ₹49 delivery (Free over ₹499)`,
    };
  }

  return {
    serviced: false,
    message: `✕ Fresh delivery is not available to ${pincode}. This kitchen delivers within 15 km in Chandigarh Tricity.`,
  };
}
