import type { MealPromo } from "@/lib/types";

/**
 * Full meals are promo-only on the web (see `lib/channel.ts` —
 * "full-meals" has no menu/cart/checkout). This is the single promo
 * record the `/app-promo` page (M5) renders.
 */
export const mealPromo: MealPromo = {
  id: "meal-promo-1",
  title: "Food Delivery",
  description:
    "Hot home-cooked meals from local kitchens with real-time order & rider tracking — available only on the Homekrafted app.",
  imagePlaceholder: "FOOD_DELIVERY_HERO",
  // Placeholder until the app ships and real store listings exist.
  appStoreUrl: "#",
  playStoreUrl: "#",
  qrCodePlaceholder: "APP_INSTALL_QR",
};
