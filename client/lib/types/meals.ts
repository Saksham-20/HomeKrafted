/**
 * Meal subscriptions (M19/M20) — the platform's recurring product.
 *
 * These mirror `server/src/meals/meals.mapper.ts` exactly. If you change a
 * field here, change it there: this is the wire contract, and `server/` is
 * shared with the native apps, so a shape that drifts breaks more than the
 * web.
 */
import type { ID, ISODateString } from "./shared";

export type MealType = "breakfast" | "lunch" | "dinner";

export type MealDiet = "veg" | "non-veg";

export type MealSubscriptionStatus = "active" | "paused" | "cancelled" | "expired";

/**
 * `skipped` is the buyer's doing; `unavailable` is the kitchen's. Both
 * return the meal to the cycle, but a kitchen's reliability must not be
 * readable off a field that conflates them.
 */
export type MealDeliveryStatus =
  | "scheduled"
  | "skipped"
  | "unavailable"
  | "delivered"
  | "cancelled";

export interface MealPlanVendor {
  id: ID;
  slug: string;
  name: string;
  area: string;
  rating: number;
  reviewCount: number;
}

export interface MealPlan {
  id: ID;
  slug: string;
  vendorId: ID;
  sellerId: ID;
  name: string;
  description: string;
  /**
   * Optional as of M20 — a plan no longer has to be one of three meals.
   * When absent the plan is some other cadence and `slotLabel` names it.
   * **Render `slotName`, not this**: the server already resolved which of
   * the two applies, and re-deriving it client-side is how the two
   * disagree.
   */
  mealType?: MealType;
  /** "Monthly pickle box" — free text, used when `mealType` is absent. */
  slotLabel?: string;
  /** What to call this plan on a card. Always present. */
  slotName: string;
  /** Set when the plan is backed by one of the kitchen's existing listings. */
  productId?: string;
  diet: MealDiet;
  pricePerMeal: number;
  servingSize?: string;
  weeklyMenu: string[];
  imagePlaceholder: string;
  imageSrc?: string;
  /** The kitchen's switch: "am I taking subscribers". */
  isActive: boolean;
  /** The admin's switch. A buyer needs this AND `isActive` to pass. */
  moderationStatus: "active" | "hidden" | "flagged";
  maxSubscribers?: number;
  /** `null` means uncapped — which is not the same as no seats left. */
  seatsLeft: number | null;
  /** The 30-minute windows this kitchen delivers this meal in, e.g. `["12:00", "12:30"]`. */
  brackets: string[];
  vendor?: MealPlanVendor;
  /** Present only when the request carried buyer coordinates. */
  distanceKm?: number;
  distanceLabel?: string;
}

export interface MealDelivery {
  id: ID;
  subscriptionId: ID;
  /** `YYYY-MM-DD`. */
  scheduledFor: string;
  bracketStart: string;
  /** Already formatted by the server, e.g. `"12:30–13:00"`. */
  bracketLabel: string;
  status: MealDeliveryStatus;
  reason?: string;
  skippedAt?: ISODateString;
  deliveredAt?: ISODateString;
}

export interface MealSubscription {
  id: ID;
  planId: ID;
  addressId: ID;
  bracketStart: string;
  bracketLabel: string;
  /** 0 = Sunday. */
  daysOfWeek: number[];
  status: MealSubscriptionStatus;
  /**
   * The price agreed at subscribe time, **not** the plan's price today.
   * Never re-read this from `plan.pricePerMeal` when rendering — that would
   * show somebody a number they never agreed to.
   */
  pricePerMeal: number;
  amountPaid: number;
  mealsTotal: number;
  mealsRemaining: number;
  startDate: string;
  endDate: string;
  pausedAt?: ISODateString;
  cancelledAt?: ISODateString;
  createdAt: ISODateString;
  plan?: MealPlan;
  vendorName?: string;
  deliveries?: MealDelivery[];
}

/** The cycle lengths the server accepts — mirror of `MEAL_COUNTS`. */
export const MEAL_COUNTS = [6, 12, 24, 30] as const;

export interface CreateMealSubscriptionInput {
  planId: ID;
  addressId: ID;
  bracketStart: string;
  daysOfWeek: number[];
  mealCount: number;
}
