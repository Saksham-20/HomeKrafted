/**
 * Food Delivery types. Snacks are browsable on the website but ordered
 * via WhatsApp (no on-site checkout); full meals are promo-only on the
 * web, with ordering and live tracking entirely in-app. See
 * `lib/channel.ts` for the enforced channel rules.
 */

import type { ID } from "./shared";

export type SnackCategory = "savoury" | "sweet" | "baked" | "namkeen";
export type DietType = "veg" | "non-veg";

export interface Snack {
  id: ID;
  slug: string;
  name: string;
  description: string;
  price: number;
  category: SnackCategory;
  diet: DietType;
  imagePlaceholder: string;
  imageSrc?: string;
  available: boolean;
  /**
   * M10b: the snack-seller `Seller.id` whose menu this belongs to —
   * what `/seller/menu` scopes its CRUD by. Optional because the M0–M5
   * consumer-facing catalog predates seller-scoping (the public `/snacks`
   * grid still just reads every available snack regardless of seller,
   * matching the single-menu reality of a one-seller catalog today).
   */
  sellerId?: ID;
  /** Distance from the buyer to this kitchen, km. Absent when location is unknown. */
  distanceKm?: number;
  /** Pre-formatted `distanceKm`, e.g. "2.3 km". */
  distanceLabel?: string;
}

export interface SnackListItem {
  snackId: ID;
  name: string;
  quantity: number;
  price: number;
}

export type SnackListStatus =
  | "draft"
  | "sent"
  | "received"
  | "accepted"
  | "out-for-delivery"
  | "delivered";

/** The customer's in-progress selection → becomes a WhatsApp payload. */
export interface SnackList {
  id: ID;
  userId?: ID;
  items: SnackListItem[];
  estimateTotal: number;
  /** Pre-formatted text sent through `buildWhatsAppLink`. */
  whatsappPayload: string;
  status: SnackListStatus;
  createdAt: string;
}

export type SnackOrderStatus = "received" | "accepted" | "out-for-delivery" | "delivered";

/**
 * M10b: the seller-portal's own record of an incoming WhatsApp-origin
 * snack order. Consumer snack orders never become a server-side `Order`
 * (Snacks has no on-site checkout — `SnackList` becomes a `wa.me`
 * message, not a domain entity, per `lib/channel.ts`), so there is no
 * real order for a seller to manage today. This type is the seller-side
 * mock stand-in: seeded here rather than created by an actual consumer
 * flow, so `/seller/orders` (snack sellers) and its status-advance
 * action have something real to operate on. **M9 replaces the seeding**
 * with real WhatsApp Cloud API inbound-message ingestion (creating one
 * of these per incoming order) and wires `status` changes here to push a
 * real WhatsApp status update back to the customer — the
 * `received→accepted→out-for-delivery→delivered` sequence already
 * mirrors the exact WA timeline `StatusTimeline` shows the consumer on
 * `/snacks` today (`SnackListStatus`), so no shape change is expected at
 * that point, just a real writer.
 */
export interface SnackOrder {
  id: ID;
  /** The snack-seller `Seller.id` managing this order. */
  sellerId: ID;
  customerName: string;
  customerPhone: string;
  items: SnackListItem[];
  total: number;
  /** Always `"whatsapp"` today — the only inbound channel Snacks supports (`lib/channel.ts`). Kept as a union of one, not a boolean, so a future channel (e.g. in-app ordering) is a value addition, not a shape change. */
  channel: "whatsapp";
  status: SnackOrderStatus;
  createdAt: string;
}

export interface MealPromo {
  id: ID;
  title: string;
  description: string;
  imagePlaceholder: string;
  imageSrc?: string;
  appStoreUrl: string;
  playStoreUrl: string;
  qrCodePlaceholder: string;
}
