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
  const brackets = bracketsFor(plan.mealType as MealTypeKey, {
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
    mealType: plan.mealType,
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

export function mapMealDelivery(delivery: MealDelivery) {
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
  };
}

export interface MapSubscriptionOptions {
  plan?: MealPlan | null;
  deliveries?: MealDelivery[];
  vendorName?: string;
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
    deliveries: options.deliveries?.map(mapMealDelivery),
  };
}
