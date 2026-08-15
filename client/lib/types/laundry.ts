/**
 * Laundry, Cleaning & Ironing types. Web supports full booking + a basic
 * status line; real-time pickup/delivery tracking is app-only (see
 * `lib/channel.ts`).
 */

import type { ID, ISODateString } from "./shared";
import type { PaymentMethod } from "./marketplace";

export type LaundryPricingModel = "per-kg" | "per-item" | "per-hour";

export interface LaundryService {
  id: ID;
  slug: string;
  name: string;
  description: string;
  pricingModel: LaundryPricingModel;
  /** Numeric unit price, e.g. 79 for "₹79 / kg". */
  price: number;
  unitLabel: string; // "kg" | "pc" | "hr"
  /** True when the price is a starting estimate ("from ₹99"). */
  priceIsFrom: boolean;
  /** Exact display string ported from the prototype, e.g. "₹79 / kg". */
  priceLabel: string;
  iconPlaceholder?: string;
}

export interface LaundryDay {
  id: ID;
  day: string; // "Sat"
  date: string; // "19 Jul"
  isoDate: ISODateString;
}

export interface LaundrySlot {
  id: ID;
  label: string; // "9 – 11 AM"
}

export interface LaundryHowItWorksStep {
  n: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Bookings & subscriptions
// ---------------------------------------------------------------------------

export interface LaundryLine {
  serviceId: ID;
  /**
   * Denormalised from the service row server-side (M37). With the
   * laundry browse API gone, the booking payload is the only place a
   * legacy line's service name still reaches a screen — optional because
   * mock-seeded bookings predate the enrichment.
   */
  serviceName?: string;
  unitLabel?: string;
  estimatedWeightKg?: number;
  itemCount?: number;
  estimatedHours?: number;
  estimatedPrice: number;
}

export type LaundryBookingStatus =
  | "scheduled"
  | "picked-up"
  | "in-progress"
  | "out-for-delivery"
  | "delivered"
  | "cancelled";

export interface LaundryBooking {
  id: ID;
  /** Human-readable booking number ("LB1042"), same id/number split as `Order.id`/`Order.orderNumber`. */
  bookingNumber: string;
  userId: ID;
  lines: LaundryLine[];
  pickupSlot: { date: ISODateString; slotId: ID };
  deliverySlot: { date: ISODateString; slotId: ID };
  /** Slot labels, denormalised server-side (M37) — same reasoning as `LaundryLine.serviceName`. */
  pickupSlotLabel?: string;
  deliverySlotLabel?: string;
  addressId: ID;
  /** Placeholder labels for dry-clean estimate photo uploads. */
  photos: string[];
  specialInstructions?: string;
  subscriptionId?: ID;
  paymentMethod: PaymentMethod;
  status: LaundryBookingStatus;
  estimatedTotal: number;
  walletCashback?: number;
  createdAt: ISODateString;
  /**
   * M10b: the laundry-partner `Seller.id` this booking is assigned to —
   * what `/seller/pickups` scopes its query by. Optional because M0–M7's
   * consumer booking flow predates partner assignment; every booking
   * `lib/api/laundry.ts#createBooking` places today auto-assigns to the
   * one seeded demo partner (see that file) since there's no real
   * dispatch/assignment logic yet — M8/M9 build real partner routing.
   */
  partnerId?: ID;
}

export type LaundrySubscriptionPlan = "weekly" | "biweekly" | "monthly";

export interface LaundrySubscription {
  id: ID;
  userId: ID;
  serviceId: ID;
  plan: LaundrySubscriptionPlan;
  slot: { day: string; slotId: ID };
  active: boolean;
  nextPickup: ISODateString;
}
