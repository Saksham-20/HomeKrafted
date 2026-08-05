import type {
  CreateMealSubscriptionInput,
  MealPlan,
  MealSubscription,
  SellerMealDelivery,
  SellerMealPlan,
  SellerMealPlanInput,
} from "@/lib/types";
import { http, isMockMode } from "./http";

/**
 * Meal subscriptions (M19 server, M20 client).
 *
 * `GET /meal-plans` is `@Public()`; everything under `/meal-subscriptions`
 * is owner-scoped and needs a token.
 *
 * **There is no mock branch that fabricates plans.** Every other module
 * here falls back to `lib/data` when `NEXT_PUBLIC_USE_MOCK=true`, but a
 * fake meal plan would be a fake kitchen committing to cook for somebody
 * every day, and the subscribe call moves real money out of a wallet. An
 * empty list is the honest offline answer — the same reasoning M17 applied
 * to resolving the signed-in seller: anything derived from real commitments
 * fails empty rather than falling back to a fixture.
 */

export interface MealPlanFilters {
  mealType?: "breakfast" | "lunch" | "dinner";
  diet?: "veg" | "non-veg";
  q?: string;
}

/** `near` limits to kitchens whose delivery radius reaches the buyer — see `getProducts`. */
export async function getMealPlans(
  filters: MealPlanFilters = {},
  near?: { lat: number; lng: number },
): Promise<MealPlan[]> {
  if (isMockMode()) return [];
  return http.get<MealPlan[]>("/meal-plans", {
    auth: false,
    query: {
      ...(filters.mealType ? { mealType: filters.mealType } : {}),
      ...(filters.diet ? { diet: filters.diet } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      ...(near ? { lat: near.lat, lng: near.lng } : {}),
    },
  });
}

export async function getMealPlan(slug: string): Promise<MealPlan | undefined> {
  if (isMockMode()) return undefined;
  try {
    return await http.get<MealPlan>(`/meal-plans/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    // A hidden or inactive plan 404s rather than 403s — the server will not
    // confirm to an anonymous caller that a moderated plan exists.
    return undefined;
  }
}

export async function getMySubscriptions(): Promise<MealSubscription[]> {
  if (isMockMode()) return [];
  return http.get<MealSubscription[]>("/meal-subscriptions");
}

export async function getMySubscription(id: string): Promise<MealSubscription | undefined> {
  if (isMockMode()) return undefined;
  try {
    return await http.get<MealSubscription>(`/meal-subscriptions/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

/**
 * Subscribe. **This debits the wallet for the whole cycle in one go.**
 *
 * Errors are deliberately not swallowed: a `402` (balance too low), a `409`
 * (plan full) and a `400` (window the kitchen doesn't offer) all carry a
 * message the buyer needs to read. Catching them here would reproduce the
 * silent-failure class M19 spent a workstream removing from three forms.
 *
 * Pass `idempotencyKey` so a double-tap or a retry cannot charge twice.
 */
export async function createMealSubscription(
  input: CreateMealSubscriptionInput,
  idempotencyKey?: string,
): Promise<MealSubscription> {
  return http.post<MealSubscription>("/meal-subscriptions", input, { idempotencyKey });
}

export async function pauseMealSubscription(id: string): Promise<MealSubscription> {
  return http.patch<MealSubscription>(`/meal-subscriptions/${encodeURIComponent(id)}/pause`, {});
}

export async function resumeMealSubscription(id: string): Promise<MealSubscription> {
  return http.patch<MealSubscription>(`/meal-subscriptions/${encodeURIComponent(id)}/resume`, {});
}

/** Skips one meal. It is owed, not lost — the cycle grows a day at the end. */
export async function skipMealDelivery(
  subscriptionId: string,
  deliveryId: string,
): Promise<MealSubscription> {
  return http.patch<MealSubscription>(
    `/meal-subscriptions/${encodeURIComponent(subscriptionId)}/deliveries/${encodeURIComponent(deliveryId)}/skip`,
    {},
  );
}

/** Terminal, and moves no money — a refund is an admin decision. */
export async function cancelMealSubscription(id: string): Promise<MealSubscription> {
  return http.delete<MealSubscription>(`/meal-subscriptions/${encodeURIComponent(id)}`);
}

/* --------------------------------------------------------------------------
 * The HomeKrafter's side — `/seller/meal-plans` (`server/src/seller/*`).
 *
 * These live here rather than in `lib/api/seller.ts` so the `MealPlan` wire
 * contract stays in one file. Every route resolves the acting seller from
 * the caller's own JWT server-side; none of these takes a `sellerId`, which
 * is what stops a client-supplied id from ever selecting whose plans get
 * returned.
 * ------------------------------------------------------------------------ */

export async function getMyMealPlans(): Promise<SellerMealPlan[]> {
  if (isMockMode()) return [];
  return http.get<SellerMealPlan[]>("/seller/meal-plans");
}

/**
 * The cook's work queue — every meal owed in the next `days`, soonest
 * first. The server caps `days` at 60 and falls back to 14.
 */
export async function getMyMealDeliveries(days = 14): Promise<SellerMealDelivery[]> {
  if (isMockMode()) return [];
  return http.get<SellerMealDelivery[]>("/seller/meal-plans/deliveries", { query: { days } });
}

export async function createMyMealPlan(input: SellerMealPlanInput): Promise<MealPlan> {
  return http.post<MealPlan>("/seller/meal-plans", input);
}

export async function updateMyMealPlan(
  id: string,
  input: Partial<SellerMealPlanInput>,
): Promise<MealPlan> {
  return http.patch<MealPlan>(`/seller/meal-plans/${encodeURIComponent(id)}`, input);
}

/**
 * Closes a plan to new subscribers. It does **not** cancel the people
 * already on it — they prepaid for a run of meals and those cycles finish.
 * The button that calls this has to say so, or a cook will read it as
 * "delete" and think they have stopped cooking.
 */
export async function closeMyMealPlan(id: string): Promise<MealPlan> {
  return http.delete<MealPlan>(`/seller/meal-plans/${encodeURIComponent(id)}`);
}

/** Marks one meal delivered. The only thing that spends a meal from a cycle. */
export async function markMealDelivered(deliveryId: string): Promise<{ ok: true }> {
  return http.patch<{ ok: true }>(
    `/seller/meal-plans/deliveries/${encodeURIComponent(deliveryId)}/delivered`,
    {},
  );
}
