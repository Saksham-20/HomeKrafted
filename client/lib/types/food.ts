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
  available: boolean;
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

export interface MealPromo {
  id: ID;
  title: string;
  description: string;
  imagePlaceholder: string;
  appStoreUrl: string;
  playStoreUrl: string;
  qrCodePlaceholder: string;
}
