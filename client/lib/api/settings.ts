import { http, isMockMode } from "./http";
import { mockFoodOrdersOpen } from "@/lib/food-launch";
import { DEFAULT_DELIVERY_RULE, type DeliveryRule } from "@/lib/cart/pricing";

export interface PublicSettings extends DeliveryRule {
  /** Off = homemade food is "coming soon": browsable, not buyable (`lib/food-launch.ts`). */
  foodOrdersOpen: boolean;
}

/**
 * `GET /settings/public` — the platform settings a signed-out visitor may
 * know. Throws on failure rather than guessing: a caller that cannot tell
 * shows nothing extra, and the server still refuses what it refuses.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  if (isMockMode()) {
    return { foodOrdersOpen: mockFoodOrdersOpen(process.env.NEXT_PUBLIC_FOOD_ORDERS_OPEN), ...DEFAULT_DELIVERY_RULE };
  }
  const settings = await http.get<Partial<PublicSettings>>("/settings/public", { auth: false });
  // An older server answers `{}`; absence has always meant food is on sale.
  return {
    foodOrdersOpen: settings.foodOrdersOpen !== false,
    deliveryFee: typeof settings.deliveryFee === "number" ? settings.deliveryFee : DEFAULT_DELIVERY_RULE.deliveryFee,
    freeDeliveryThreshold:
      typeof settings.freeDeliveryThreshold === "number"
        ? settings.freeDeliveryThreshold
        : DEFAULT_DELIVERY_RULE.freeDeliveryThreshold,
  };
}
