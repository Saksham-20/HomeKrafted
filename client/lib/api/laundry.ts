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
import { http, isMockMode } from "./http";

/** Re-exported so components import the plan-option shape via `@/lib/api`, never `@/lib/data` directly. */
export type { LaundrySubscriptionPlanOption };

/**
 * Laundry (M8.4a — real). Services/availability are `@Public()` reads;
 * bookings + subscriptions are owner-scoped (`docs/API.md` "Services
 * (M8.3a)"). Every booking's price is server-authoritative — the create
 * DTO has no price field — so `createBooking`'s `unitPrice` input is kept
 * only so the call site (`LaundryBookingClient`) doesn't need to change;
 * it's simply not sent to the server, which recomputes the same estimate
 * fresh from `LaundryService.price` server-side.
 */

export async function getLaundryServices(): Promise<LaundryService[]> {
  if (isMockMode()) return laundryServices;
  return http.get<LaundryService[]>("/laundry/services", { auth: false });
}

export async function getLaundryService(slug: string): Promise<LaundryService | undefined> {
  if (isMockMode()) return getLaundryServiceBySlug(slug);
  try {
    return await http.get<LaundryService>(`/laundry/services/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

export async function getLaundryDays(): Promise<LaundryDay[]> {
  if (isMockMode()) return laundryDays;
  return http.get<LaundryDay[]>("/laundry/availability/days", { auth: false });
}

export async function getLaundrySlots(): Promise<LaundrySlot[]> {
  if (isMockMode()) return laundrySlots;
  return http.get<LaundrySlot[]>("/laundry/availability/slots", { auth: false });
}

/** Static copy — stays client-side content, not an endpoint. */
export async function getLaundryHowItWorks(): Promise<LaundryHowItWorksStep[]> {
  return laundrySteps;
}

/** Static copy — stays client-side content, not an endpoint. */
export async function getLaundrySubscriptionPlanOptions(): Promise<
  LaundrySubscriptionPlanOption[]
> {
  return laundrySubscriptionPlanOptions;
}

// ---------------------------------------------------------------------------
// Mock-mode-only in-memory "table" — real mode reads/writes go straight
// through `http` to `server/`, nothing kept locally.
// ---------------------------------------------------------------------------

const bookings: LaundryBooking[] = [];
const subscriptions: LaundrySubscription[] = [];

export interface CreateBookingInput {
  serviceId: ID;
  estimatedWeightKg?: number;
  itemCount?: number;
  estimatedHours?: number;
  /** Baseline price used for the *mock* estimate only — the real endpoint recomputes this itself from `LaundryService.price` and ignores anything price-shaped in the request body. */
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
 * Mock mode: computes the estimate from the chosen service's quantity
 * dimension (kg/item/hr) and "persists" to an in-memory array. Real mode:
 * `POST /laundry/bookings` — server-priced, and (unlike the mock) a
 * `paymentMethod: "wallet"` booking debits the wallet + credits cashback
 * **atomically with the booking insert** server-side, so the caller
 * (`LaundryBookingClient`) no longer makes a separate `useWallet().pay()`/
 * `earnCashback()` call afterward — it just re-fetches the wallet balance.
 */
export async function createBooking(input: CreateBookingInput): Promise<LaundryBooking> {
  if (isMockMode()) {
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
      partnerId: "sl2",
    };

    bookings.push(booking);
    return booking;
  }

  return http.post<LaundryBooking>("/laundry/bookings", {
    serviceId: input.serviceId,
    estimatedWeightKg: input.estimatedWeightKg,
    itemCount: input.itemCount,
    estimatedHours: input.estimatedHours,
    pickupSlot: input.pickupSlot,
    deliverySlot: input.deliverySlot,
    addressId: input.addressId,
    photos: input.photos,
    specialInstructions: input.specialInstructions,
    subscriptionId: input.subscriptionId,
    paymentMethod: input.paymentMethod,
  });
}

export interface CreateSubscriptionInput {
  serviceId: ID;
  plan: LaundrySubscriptionPlan;
  slot: { day: string; slotId: ID };
  nextPickup: ISODateString;
}

/** Real mode: `POST /laundry/subscriptions` — the create DTO flattens `slot: {day, slotId}` to `slotDay`/`slotId` (`docs/API.md`'s noted seam); the response is re-nested back into the frontend's `slot` shape here so the call site never sees the flattening. */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<LaundrySubscription> {
  if (isMockMode()) {
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

  interface SubscriptionDto extends Omit<LaundrySubscription, "slot"> {
    slot?: { day: string; slotId: ID };
    slotDay?: string;
    slotId?: ID;
  }

  const dto = await http.post<SubscriptionDto>("/laundry/subscriptions", {
    serviceId: input.serviceId,
    plan: input.plan,
    slotDay: input.slot.day,
    slotId: input.slot.slotId,
    nextPickup: input.nextPickup,
  });

  return {
    ...dto,
    slot: dto.slot ?? { day: dto.slotDay ?? input.slot.day, slotId: dto.slotId ?? input.slot.slotId },
  };
}

/**
 * Real mode: `GET /laundry/bookings` — every booking of the signed-in
 * account, not just ones placed this session (unlike the pre-M8.4a mock,
 * whose in-memory array only ever held this-tab's live bookings on top of
 * `lib/data`'s seed history).
 */
export async function getPlacedBookings(): Promise<LaundryBooking[]> {
  if (isMockMode()) return bookings;
  return http.get<LaundryBooking[]>("/laundry/bookings");
}
