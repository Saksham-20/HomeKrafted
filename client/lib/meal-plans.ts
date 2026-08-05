/**
 * The rules behind the HomeKrafter's meal-plan form (M20).
 *
 * Pure, and here rather than in the component, for the same reason
 * `schedule.ts`, `channel.ts` and `occasions.ts` are: these decide what the
 * app is allowed to send, and a rule worth getting right is worth a test.
 * `components/seller/MealPlanForm.tsx` renders them and owns nothing else.
 *
 * The server validates every one of these again (`CreateMealPlanDto`).
 * Nothing here is a security boundary — it exists so a cook finds out
 * before submitting, not after.
 */
import type { MealDiet, MealType, SellerMealPlanInput } from "./types";

/** `slotKind` is form-only: it decides which of `mealType`/`slotLabel` gets sent. */
export interface MealPlanFormValues {
  name: string;
  description: string;
  slotKind: MealType | "other";
  slotLabel: string;
  productId: string;
  diet: MealDiet;
  pricePerMeal: string;
  servingSize: string;
  /** One menu line per row of the textarea. */
  weeklyMenu: string;
  imageSrc: string;
  maxSubscribers: string;
  isActive: boolean;
}

export const EMPTY_MEAL_PLAN_FORM: MealPlanFormValues = {
  name: "",
  description: "",
  slotKind: "lunch",
  slotLabel: "",
  productId: "",
  diet: "veg",
  pricePerMeal: "",
  servingSize: "",
  weeklyMenu: "",
  imageSrc: "",
  maxSubscribers: "",
  isActive: true,
};

/** Mirrors `@ArrayMaxSize(14)` on the DTO's `weeklyMenu`. */
export const MAX_MENU_LINES = 14;

export const SLOT_OPTIONS: { value: MealType | "other"; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "other", label: "Something else" },
];

/** Everything the DTO refuses, said before the request is made. `undefined` when valid. */
export function validateMealPlan(values: MealPlanFormValues): string | undefined {
  if (!values.name.trim()) return "Give the plan a name.";
  if (!values.description.trim()) {
    return "Add a short description — it's what a buyer reads first.";
  }
  // The whole point of the "something else" option is that the plan still
  // has a name a buyer can read. Without one the card would say
  // "Subscription", which is what `mapMealPlan` falls back to.
  if (values.slotKind === "other" && !values.slotLabel.trim()) {
    return "Name what this plan is — e.g. “Monthly pickle box”.";
  }
  const price = Number(values.pricePerMeal);
  if (!values.pricePerMeal.trim() || !Number.isFinite(price) || price < 1) {
    return "Set a price of at least ₹1.";
  }
  if (values.maxSubscribers.trim()) {
    const cap = Number(values.maxSubscribers);
    if (!Number.isInteger(cap) || cap < 1) {
      return "A subscriber limit has to be a whole number, 1 or more.";
    }
  }
  if (menuLines(values.weeklyMenu).length > MAX_MENU_LINES) {
    return `That's more than ${MAX_MENU_LINES} menu lines — trim it to a fortnight at most.`;
  }
  return undefined;
}

function menuLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Builds the request body.
 *
 * Empty optional fields are **omitted**, never sent as `""`. The DTO uses
 * `@IsOptional()`, which treats an empty string as a present value, so
 * sending one would store a blank `servingSize` rather than none — and
 * `forbidNonWhitelisted` gives no warning about a field that is allowed.
 */
export function toMealPlanInput(values: MealPlanFormValues): SellerMealPlanInput {
  const weeklyMenu = menuLines(values.weeklyMenu);

  return {
    name: values.name.trim(),
    description: values.description.trim(),
    /*
      Exactly one of these two, decided here. Sending both would leave the
      server picking, and `mapMealPlan` resolves `slotName` from `mealType`
      first — so a plan would go on calling itself "Lunch" after the cook
      renamed it to something else.
    */
    ...(values.slotKind === "other"
      ? { slotLabel: values.slotLabel.trim() }
      : { mealType: values.slotKind }),
    ...(values.productId ? { productId: values.productId } : {}),
    diet: values.diet,
    pricePerMeal: Number(values.pricePerMeal),
    ...(values.servingSize.trim() ? { servingSize: values.servingSize.trim() } : {}),
    ...(weeklyMenu.length > 0 ? { weeklyMenu } : {}),
    ...(values.imageSrc ? { imageSrc: values.imageSrc } : {}),
    ...(values.maxSubscribers.trim() ? { maxSubscribers: Number(values.maxSubscribers) } : {}),
    isActive: values.isActive,
  };
}
