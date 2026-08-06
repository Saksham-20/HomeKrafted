/**
 * Meal subscriptions (M19/M20) — the platform's recurring product.
 *
 * These mirror `server/src/meals/meals.mapper.ts` exactly. If you change a
 * field here, change it there: this is the wire contract, and `server/` is
 * shared with the native apps, so a shape that drifts breaks more than the
 * web.
 */
import type { ID, ISODateString } from "./shared";
import type { ProductModerationStatus } from "./marketplace";

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
  moderationStatus: ProductModerationStatus;
  /** The admin's reason, shown to the kitchen in the portal, never to a buyer. */
  moderationNote?: string;
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

/**
 * A plan as its own kitchen sees it. The extra field is deliberately not on
 * `MealPlan`: `seatsLeft` is `null` on an uncapped plan, so putting the raw
 * count on the public payload would publish every kitchen's subscriber
 * numbers to anyone who can read `GET /meal-plans`.
 */
export interface SellerMealPlan extends MealPlan {
  subscriberCount: number;
}

/**
 * One meal a kitchen owes, as the *cook* sees it — mirror of
 * `SellerMealPlansService.deliveries`.
 *
 * Deliberately not `MealDelivery`: that is the buyer's view of their own
 * schedule and carries no customer identity. This one carries a name, a
 * phone and an address because somebody has to actually take food to a
 * door, and it carries no `status` because the queue only ever contains
 * `scheduled` rows.
 */
export interface SellerMealDelivery {
  id: ID;
  /** `YYYY-MM-DD`. */
  scheduledFor: string;
  bracketStart: string;
  planName: string;
  customerName: string;
  customerPhone?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
  };
}

/** What a HomeKrafter fills in — mirror of `CreateMealPlanDto`. */
export interface SellerMealPlanInput {
  name: string;
  description: string;
  /** Omitted for any cadence that is not one of the three meals. */
  mealType?: MealType;
  /** "Monthly pickle box" — names the plan when `mealType` is absent. */
  slotLabel?: string;
  productId?: string;
  diet: MealDiet;
  pricePerMeal: number;
  servingSize?: string;
  weeklyMenu?: string[];
  imageSrc?: string;
  /** Omitted means uncapped — a choice, not a default nobody saw. */
  maxSubscribers?: number;
  isActive?: boolean;
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
