import type {
  LaundryBooking,
  LaundryDay,
  LaundryHowItWorksStep,
  LaundryService,
  LaundrySlot,
  LaundrySubscriptionPlan,
} from "@/lib/types";
import { currentUser } from "./user";

/** The 4 services from the Laundry "Choose a service" picker. */
export const laundryServices: LaundryService[] = [
  {
    id: "ls1",
    slug: "wash-fold",
    name: "Wash & Fold",
    description: "Everyday laundry, per kg",
    pricingModel: "per-kg",
    price: 79,
    unitLabel: "kg",
    priceIsFrom: false,
    priceLabel: "₹79 / kg",
    iconPlaceholder: "WASHER",
  },
  {
    id: "ls2",
    slug: "dry-clean",
    name: "Dry Clean",
    description: "Delicates & formals",
    pricingModel: "per-item",
    price: 99,
    unitLabel: "item",
    priceIsFrom: true,
    priceLabel: "from ₹99",
    iconPlaceholder: "HANGER",
  },
  {
    id: "ls3",
    slug: "steam-ironing",
    name: "Steam Ironing",
    description: "Crisp & crease-free",
    pricingModel: "per-item",
    price: 15,
    unitLabel: "pc",
    priceIsFrom: false,
    priceLabel: "₹15 / pc",
    iconPlaceholder: "IRON",
  },
  {
    id: "ls4",
    slug: "home-cleaning",
    name: "Home Cleaning",
    description: "Deep clean, per room",
    pricingModel: "per-hour",
    price: 499,
    unitLabel: "hr",
    priceIsFrom: true,
    priceLabel: "from ₹499",
    iconPlaceholder: "CLEANING",
  },
];

/**
 * Pickup day tiles. Dates are ported from the prototype (19–22 Jul 2026);
 * the day-name abbreviations are corrected to match the real 2026
 * calendar (the prototype's own "Sat 19 Jul" is internally inconsistent —
 * 19 Jul 2026 actually falls on a Sunday).
 */
export const laundryDays: LaundryDay[] = [
  { id: "ld1", day: "Sun", date: "19 Jul", isoDate: "2026-07-19" },
  { id: "ld2", day: "Mon", date: "20 Jul", isoDate: "2026-07-20" },
  { id: "ld3", day: "Tue", date: "21 Jul", isoDate: "2026-07-21" },
  { id: "ld4", day: "Wed", date: "22 Jul", isoDate: "2026-07-22" },
];

/** Pickup/delivery time slots. */
export const laundrySlots: LaundrySlot[] = [
  { id: "lt1", label: "9 – 11 AM" },
  { id: "lt2", label: "1 – 3 PM" },
  { id: "lt3", label: "5 – 7 PM" },
];

/** "How it works" 4-step strip. */
export const laundrySteps: LaundryHowItWorksStep[] = [
  { n: 1, label: "We pick up at your door" },
  { n: 2, label: "Weigh, clean & finish" },
  { n: 3, label: "Track on the app" },
  { n: 4, label: "Delivered fresh in 48 hr" },
];

export function getLaundryServiceBySlug(slug: string): LaundryService | undefined {
  return laundryServices.find((s) => s.slug === slug);
}

// ---------------------------------------------------------------------------
// Booking flow (M4)
// ---------------------------------------------------------------------------

export interface LaundrySubscriptionPlanOption {
  value: LaundrySubscriptionPlan;
  label: string;
  hint: string;
}

/** Recurring-plan picker options for the booking form's subscription toggle. */
export const laundrySubscriptionPlanOptions: LaundrySubscriptionPlanOption[] = [
  { value: "weekly", label: "Weekly", hint: "Pickup every week" },
  { value: "biweekly", label: "Biweekly", hint: "Pickup every 2 weeks" },
  { value: "monthly", label: "Monthly", hint: "Pickup once a month" },
];

/**
 * In-memory booking-number sequence, mirroring `lib/data/orders.ts`'s
 * `nextOrderNumber()` — a distinct "LB" prefix keeps laundry bookings
 * visually separate from marketplace `Order.orderNumber`s ("HK...") in
 * the shared M7 order-history list. Same reset-on-reload caveat as the
 * order sequence: runs in the browser tab, not a real server sequence,
 * until M8's backend takes over.
 */
// M10b bumped this from 1042 to 1046 — two new seed bookings (LB1044,
// LB1045, see `seedLaundryBookings` below) needed real numbers above the
// old ceiling so the "all seed numbers stay below the sequence start"
// invariant a few lines down still holds.
let bookingSequence = 1046;

export function nextBookingNumber(): string {
  const n = bookingSequence;
  bookingSequence += 1;
  return `LB${n}`;
}

// ---------------------------------------------------------------------------
// Booking history seed (M7a) — same reasoning as `lib/data/orders.ts`'s
// `seedOrders`: `/account/orders`'s unified list needs real past bookings,
// not just whatever gets placed live this session (`lib/api/laundry.ts`'s
// in-memory `bookings` array starts empty every reload). All booking
// numbers stay below 1046 (`bookingSequence`'s starting value) so a
// freshly-placed live booking can never collide with a seeded one.
// Statuses spread across the full `LaundryBookingStatus` range (delivered/
// out-for-delivery/cancelled) so the unified history and its detail
// `StatusTimeline` have something to show at every stage.
// ---------------------------------------------------------------------------

// `partnerId: "sl2"` (M10b) assigns every seed booking to the one seeded
// demo laundry partner (`lib/data/sellers.ts`) — real partner-assignment
// logic (routing by service area/availability) is M8/M9 scope, so today
// every booking, seeded or live, resolves to that same partner. See
// `lib/api/laundry.ts#createBooking` for the live-booking side of this.
export const seedLaundryBookings: LaundryBooking[] = [
  {
    id: "lb-seed-1020",
    bookingNumber: "LB1020",
    userId: currentUser.id,
    lines: [{ serviceId: "ls1", estimatedWeightKg: 5, estimatedPrice: 395 }],
    pickupSlot: { date: "2026-07-06", slotId: "lt1" },
    deliverySlot: { date: "2026-07-07", slotId: "lt2" },
    addressId: "addr-demo-1",
    photos: [],
    paymentMethod: "wallet",
    status: "delivered",
    estimatedTotal: 395,
    walletCashback: 20,
    createdAt: "2026-07-05T08:00:00+05:30",
    partnerId: "sl2",
  },
  {
    id: "lb-seed-1028",
    bookingNumber: "LB1028",
    userId: currentUser.id,
    lines: [{ serviceId: "ls3", itemCount: 12, estimatedPrice: 180 }],
    pickupSlot: { date: "2026-07-13", slotId: "lt1" },
    deliverySlot: { date: "2026-07-14", slotId: "lt3" },
    addressId: "addr-demo-2",
    photos: [],
    paymentMethod: "cod",
    status: "delivered",
    estimatedTotal: 180,
    createdAt: "2026-07-12T09:30:00+05:30",
    partnerId: "sl2",
  },
  {
    id: "lb-seed-1035",
    bookingNumber: "LB1035",
    userId: currentUser.id,
    lines: [{ serviceId: "ls4", estimatedHours: 3, estimatedPrice: 1497 }],
    pickupSlot: { date: "2026-07-20", slotId: "lt2" },
    deliverySlot: { date: "2026-07-21", slotId: "lt3" },
    addressId: "addr-demo-1",
    photos: [],
    paymentMethod: "wallet",
    status: "out-for-delivery",
    estimatedTotal: 1497,
    walletCashback: 75,
    createdAt: "2026-07-19T07:45:00+05:30",
    partnerId: "sl2",
  },
  {
    id: "lb-seed-1041",
    bookingNumber: "LB1041",
    userId: currentUser.id,
    lines: [{ serviceId: "ls2", itemCount: 4, estimatedPrice: 396 }],
    pickupSlot: { date: "2026-07-22", slotId: "lt1" },
    deliverySlot: { date: "2026-07-23", slotId: "lt2" },
    addressId: "addr-demo-3",
    photos: [],
    paymentMethod: "razorpay",
    status: "cancelled",
    estimatedTotal: 396,
    createdAt: "2026-07-21T12:00:00+05:30",
    partnerId: "sl2",
  },
  {
    id: "lb-seed-1044",
    bookingNumber: "LB1044",
    userId: currentUser.id,
    lines: [{ serviceId: "ls1", estimatedWeightKg: 6, estimatedPrice: 474 }],
    pickupSlot: { date: "2026-07-25", slotId: "lt1" },
    deliverySlot: { date: "2026-07-26", slotId: "lt2" },
    addressId: "addr-demo-1",
    photos: [],
    paymentMethod: "wallet",
    status: "scheduled",
    estimatedTotal: 474,
    walletCashback: 24,
    createdAt: "2026-07-24T10:15:00+05:30",
    partnerId: "sl2",
  },
  {
    id: "lb-seed-1045",
    bookingNumber: "LB1045",
    userId: currentUser.id,
    lines: [{ serviceId: "ls3", itemCount: 8, estimatedPrice: 120 }],
    pickupSlot: { date: "2026-07-26", slotId: "lt1" },
    deliverySlot: { date: "2026-07-27", slotId: "lt2" },
    addressId: "addr-demo-2",
    photos: [],
    paymentMethod: "cod",
    status: "picked-up",
    estimatedTotal: 120,
    createdAt: "2026-07-25T09:00:00+05:30",
    partnerId: "sl2",
  },
];
