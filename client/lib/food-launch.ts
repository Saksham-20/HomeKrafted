/**
 * Homemade food is "coming soon" (2026-09-15, owner): the food side of the
 * site stays browsable, but food can't be bought while the platform
 * setting `foodOrdersOpen` is off — the launch is gifting-first.
 *
 * The server is the gate (`server/src/common/food-orders.ts`); the web
 * hides the buttons and says why. Both halves read one switch, flipped on
 * `/admin/settings`, so reopening food is a toggle and not a deploy.
 *
 * The code and the sentence mirror the server's exactly, the
 * `CART_OTHER_MAKER` pattern: a screen branches on the code, and mock mode
 * refuses with the same words so the two modes cannot be told apart.
 */
export const FOOD_COMING_SOON = "FOOD_COMING_SOON";

export const FOOD_COMING_SOON_MESSAGE =
  "Homemade food is coming soon. You're welcome to browse our kitchens, but food orders aren't open yet — for now we're focused on handcrafted gifts.";

/** The banner on food pages. */
export const FOOD_BANNER = {
  title: "Homemade food is coming soon",
  body: "You're welcome to browse what our kitchens are cooking. For now, we're focused on handcrafted gifts.",
  cta: "Shop gifts",
  href: "/gifts",
} as const;

/** Label on a food button that can't be pressed yet. */
export const FOOD_BUTTON_LABEL = "Coming soon";

export function isFoodComingSoonError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === FOOD_COMING_SOON
  );
}

/**
 * Mock mode's stand-in for the server setting. Closed unless
 * `NEXT_PUBLIC_FOOD_ORDERS_OPEN=true`, so offline development shows what
 * production shows while food is coming soon.
 */
export function mockFoodOrdersOpen(env: string | undefined): boolean {
  return env === "true";
}
