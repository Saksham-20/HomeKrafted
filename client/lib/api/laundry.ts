import type {
  ID,
  ISODateString,
  LaundryBooking,
  LaundryBookingStatus,
  LaundryDay,
  LaundryHowItWorksStep,
  LaundryService,
  LaundrySlot,
  LaundrySubscription,
  LaundrySubscriptionPlan,
  PaymentMethod,
} from "@/lib/types";
import {
  currentUser,
  getLaundryServiceBySlug,
  laundryDays,
  laundryServices,
  laundrySlots,
  laundrySteps,
  laundrySubscriptionPlanOptions,
  nextBookingNumber,
  type LaundrySubscriptionPlanOption,
} from "@/lib/data";
import { computeCashback } from "@/lib/cart/pricing";

/** Re-exported so components import the plan-option shape via `@/lib/api`, never `@/lib/data` directly. */
export type { LaundrySubscriptionPlanOption };

export async function getLaundryServices(): Promise<LaundryService[]> {
  return laundryServices;
}

export async function getLaundryService(slug: string): Promise<LaundryService | undefined> {
  return getLaundryServiceBySlug(slug);
}

export async function getLaundryDays(): Promise<LaundryDay[]> {
  return laundryDays;
}

export async function getLaundrySlots(): Promise<LaundrySlot[]> {
  return laundrySlots;
}

export async function getLaundryHowItWorks(): Promise<LaundryHowItWorksStep[]> {
  return laundrySteps;
}

export async function getLaundrySubscriptionPlanOptions(): Promise<
  LaundrySubscriptionPlanOption[]
> {
  return laundrySubscriptionPlanOptions;
}

// ---------------------------------------------------------------------------
// Booking flow mutations (M4) — in-memory mocks, called from the client
// booking component (no server boundary yet, same caveat as
// `lib/api/orders.ts`'s `createOrder`: resets on a hard reload, persists
// across client-side navigation within a session). Swap for real
// POST /api/v1/laundry/bookings + /subscriptions calls in M8 without
// touching any call site.
// ---------------------------------------------------------------------------

const bookings: LaundryBooking[] = [];
const subscriptions: LaundrySubscription[] = [];

export interface CreateBookingInput {
  serviceId: ID;
  estimatedWeightKg?: number;
  itemCount?: number;
  estimatedHours?: number;
  /** Baseline price used to compute the estimate — the selected service's `price`. */
  unitPrice: number;
  pickupSlot: { date: ISODateString; slotId: ID };
  deliverySlot: { date: ISODateString; slotId: ID };
  addressId: ID;
  photos: string[];
  specialInstructions?: string;
  subscriptionId?: ID;
  paymentMethod: PaymentMethod;
}

/**
 * Mock booking-placement mutation — computes the estimate from the
 * chosen service's quantity dimension (kg/item/hr), generates an id +
 * human-readable booking number, "persists" to an in-memory array. Every
 * new booking starts life `status: "scheduled"` (the confirmation screen's
 * basic status line starts here) — real-time pickup/delivery progress
 * updates are app-only per `lib/channel.ts`, so nothing here ever
 * transitions the status client-side.
 */
export async function createBooking(input: CreateBookingInput): Promise<LaundryBooking> {
  const qty = input.estimatedWeightKg ?? input.itemCount ?? input.estimatedHours ?? 0;
  const estimatedTotal = Math.round(input.unitPrice * qty);
  const walletCashback =
    input.paymentMethod === "wallet" ? computeCashback(estimatedTotal) : undefined;

  const booking: LaundryBooking = {
    id: `lb-${Date.now()}`,
    bookingNumber: nextBookingNumber(),
    userId: currentUser.id,
    lines: [
      {
        serviceId: input.serviceId,
        estimatedWeightKg: input.estimatedWeightKg,
        itemCount: input.itemCount,
        estimatedHours: input.estimatedHours,
        estimatedPrice: estimatedTotal,
      },
    ],
    pickupSlot: input.pickupSlot,
    deliverySlot: input.deliverySlot,
    addressId: input.addressId,
    photos: input.photos,
    specialInstructions: input.specialInstructions,
    subscriptionId: input.subscriptionId,
    paymentMethod: input.paymentMethod,
    status: "scheduled" as LaundryBookingStatus,
    estimatedTotal,
    walletCashback,
    createdAt: new Date().toISOString(),
    // M10b: real partner-assignment/dispatch (routing a new booking to
    // whichever partner covers the pickup address) is M8/M9 scope — every
    // booking placed today, live or seeded, auto-assigns to the one
    // seeded demo laundry partner (`sl2`, `lib/data/sellers.ts`) so
    // `/seller/pickups` has something real to show.
    partnerId: "sl2",
  };

  bookings.push(booking);
  return booking;
}

export interface CreateSubscriptionInput {
  serviceId: ID;
  plan: LaundrySubscriptionPlan;
  slot: { day: string; slotId: ID };
  nextPickup: ISODateString;
}

/** Mock subscription-creation mutation — same in-memory caveat as `createBooking`. */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<LaundrySubscription> {
  const subscription: LaundrySubscription = {
    id: `lsub-${Date.now()}`,
    userId: currentUser.id,
    serviceId: input.serviceId,
    plan: input.plan,
    slot: input.slot,
    active: true,
    nextPickup: input.nextPickup,
  };

  subscriptions.push(subscription);
  return subscription;
}

/**
 * Bookings placed live in this browser tab's session (M7a) — same
 * reasoning and same caveat as `lib/api/orders.ts`'s `getPlacedOrders()`:
 * read by `lib/api/history.ts`'s `getOrderHistory()` alongside the seeded
 * `lib/data/laundry.ts#seedLaundryBookings` history, only populated within
 * the client-bundle module instance a booking was actually placed in.
 */
export async function getPlacedBookings(): Promise<LaundryBooking[]> {
  return bookings;
}
