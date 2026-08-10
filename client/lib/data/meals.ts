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
  imageSrc: "/images/site/food-delivery.jpg",
  // Left unset until the app ships and real store listings exist. These
  // were `"#"`, which rendered as two links that did nothing — set the
  // real URLs here and the badges become links again with no code change.
  qrCodePlaceholder: "APP_INSTALL_QR",
};
