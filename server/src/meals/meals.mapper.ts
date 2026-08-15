import { MealDelivery, MealPlan, MealSubscription, Vendor } from '@prisma/client';
import { bracketsFor, formatBracketRange, MealTypeKey } from './meal-brackets';

/** `non_veg` is stored with an underscore and spoken with a hyphen — same seam as `mapSnack`. */
function mapDiet(diet: MealPlan['diet']): 'veg' | 'non-veg' {
  return diet === 'non_veg' ? 'non-veg' : 'veg';
}

export interface MapPlanOptions {
  /** The kitchen behind the plan, when the caller joined it. */
  vendor?: Pick<Vendor, 'id' | 'slug' | 'name' | 'area' | 'rating' | 'reviewCount'> | null;
  /** Kitchen hours, so the payload can carry the brackets it actually offers. */
  opensAt?: string | null;
  closesAt?: string | null;
  /** Live count of `active` + `paused` subscriptions, for the capacity line. */
  subscriberCount?: number;
}

export function mapMealPlan(plan: MealPlan, options: MapPlanOptions = {}) {
  const brackets = bracketsFor(plan.mealType as MealTypeKey | null, {
    opensAt: options.opensAt,
    closesAt: options.closesAt,
  });

  const seatsLeft =
    plan.maxSubscribers === null || options.subscriberCount === undefined
      ? null
      : Math.max(0, plan.maxSubscribers - options.subscriberCount);

  return {
    id: plan.id,
    slug: plan.slug,
    vendorId: plan.vendorId,
    sellerId: plan.sellerId,
    name: plan.name,
    description: plan.description,
    // `?? undefined` like every other optional field here, so it drops out
    // of the JSON rather than arriving as an explicit `null` the client
    // type does not declare.
    mealType: plan.mealType ?? undefined,
    slotLabel: plan.slotLabel ?? undefined,
    productId: plan.productId ?? undefined,
    /**
     * What to call this on a card, resolved server-side so no client has to
     * re-derive it and disagree. A plan is a meal, or it is whatever the
     * kitchen named it, or — failing both — just a plan.
     */
    slotName: plan.mealType
      ? plan.mealType.charAt(0).toUpperCase() + plan.mealType.slice(1)
      : (plan.slotLabel ?? 'Subscription'),
    diet: mapDiet(plan.diet),
    pricePerMeal: Number(plan.pricePerMeal),
    servingSize: plan.servingSize ?? undefined,
    weeklyMenu: plan.weeklyMenu,
    imagePlaceholder: plan.imagePlaceholder,
    imageSrc: plan.imageSrc ?? undefined,
    isActive: plan.isActive,
    /**
     * Both switches, deliberately. A buyer needs `isActive` **and**
     * `moderationStatus === 'active'` to subscribe, and collapsing them into
     * one `available` boolean is how a moderator's action gets silently
     * undone by a cook toggling their own availability.
     */
    moderationStatus: plan.moderationStatus,
    /**
     * M22 — the admin's reason, for the kitchen's own portal. It reaches a
     * buyer payload only in a state that cannot be public: every list a
     * buyer reads filters on `moderationStatus: 'active'`, and approving
     * clears the note to `null`.
     */
    moderationNote: plan.moderationNote ?? undefined,
    maxSubscribers: plan.maxSubscribers ?? undefined,
    /** `null` means uncapped, which is different from "no seats left". */
    seatsLeft,
    /** The 30-minute windows this kitchen can deliver this meal in. */
    brackets,
    vendor: options.vendor
      ? {
          id: options.vendor.id,
          slug: options.vendor.slug,
          name: options.vendor.name,
          area: options.vendor.area,
          rating: Number(options.vendor.rating),
          reviewCount: options.vendor.reviewCount,
        }
      : undefined,
  };
}

/**
 * What a delivery row can additionally say when the caller resolved the
 * plan's dated menus and the platform lock time (M37). Both are
 * server-computed: the client never derives "locked" from its own clock
 * (the M12 hydration lesson), and the dish resolution order — set day
 * menu, else the 7-line weekly rotation's weekday line — lives in one
 * place (`MealSubscriptionsService.dayContext`).
 */
export interface DeliveryDayContext {
  dishFor: (date: Date) => string | undefined;
  lockedFor: (date: Date) => boolean;
}

export function mapMealDelivery(delivery: MealDelivery, ctx?: DeliveryDayContext) {
  return {
    id: delivery.id,
    subscriptionId: delivery.subscriptionId,
    scheduledFor: delivery.scheduledFor.toISOString().slice(0, 10),
    bracketStart: delivery.bracketStart,
    bracketLabel: formatBracketRange(delivery.bracketStart),
    status: delivery.status,
    reason: delivery.reason ?? undefined,
    skippedAt: delivery.skippedAt?.toISOString(),
    deliveredAt: delivery.deliveredAt?.toISOString(),
    dish: ctx?.dishFor(delivery.scheduledFor),
    locked: ctx ? ctx.lockedFor(delivery.scheduledFor) : undefined,
  };
}

export interface MapSubscriptionOptions {
  plan?: MealPlan | null;
  deliveries?: MealDelivery[];
  vendorName?: string;
  /** M37 — lets each delivery carry its dish and lock state. */
  dayContext?: DeliveryDayContext;
}

export function mapMealSubscription(
  subscription: MealSubscription,
  options: MapSubscriptionOptions = {},
) {
  return {
    id: subscription.id,
    planId: subscription.planId,
    addressId: subscription.addressId,
    bracketStart: subscription.bracketStart,
    bracketLabel: formatBracketRange(subscription.bracketStart),
    daysOfWeek: subscription.daysOfWeek,
    status: subscription.status,
    /**
     * The price the buyer agreed to, not the plan's price today. A
     * subscription that re-read the plan would change what somebody pays for
     * tomorrow's lunch without telling them.
     */
    pricePerMeal: Number(subscription.pricePerMeal),
    amountPaid: Number(subscription.amountPaid),
    mealsTotal: subscription.mealsTotal,
    mealsRemaining: subscription.mealsRemaining,
    startDate: subscription.startDate.toISOString().slice(0, 10),
    endDate: subscription.endDate.toISOString().slice(0, 10),
    pausedAt: subscription.pausedAt?.toISOString(),
    cancelledAt: subscription.cancelledAt?.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
    plan: options.plan ? mapMealPlan(options.plan) : undefined,
    vendorName: options.vendorName,
    deliveries: options.deliveries?.map((d) => mapMealDelivery(d, options.dayContext)),
  };
}
