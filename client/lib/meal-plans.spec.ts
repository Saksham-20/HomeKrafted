import {
  EMPTY_MEAL_PLAN_FORM,
  MAX_MENU_LINES,
  toMealPlanInput,
  validateMealPlan,
  type MealPlanFormValues,
} from "./meal-plans";

/** A form filled in enough to pass, so each case varies exactly one thing. */
function valid(overrides: Partial<MealPlanFormValues> = {}): MealPlanFormValues {
  return {
    ...EMPTY_MEAL_PLAN_FORM,
    name: "Everyday Punjabi Thali",
    description: "Rotis, dal, sabzi, salad and achaar, cooked fresh each morning.",
    pricePerMeal: "120",
    ...overrides,
  };
}

describe("validateMealPlan", () => {
  it("accepts a filled-in meal plan", () => {
    expect(validateMealPlan(valid())).toBeUndefined();
  });

  it("refuses a plan with no name or no description", () => {
    expect(validateMealPlan(valid({ name: "   " }))).toMatch(/name/i);
    expect(validateMealPlan(valid({ description: "" }))).toMatch(/description/i);
  });

  describe("the price", () => {
    it("refuses nothing, zero and negatives", () => {
      // Blank must not read as 0: `Number("")` is 0, which is finite and
      // would sail past a bare `Number.isFinite` check.
      expect(validateMealPlan(valid({ pricePerMeal: "" }))).toMatch(/price/i);
      expect(validateMealPlan(valid({ pricePerMeal: "0" }))).toMatch(/price/i);
      expect(validateMealPlan(valid({ pricePerMeal: "-5" }))).toMatch(/price/i);
    });

    it("refuses text, and accepts the DTO's floor of 1", () => {
      expect(validateMealPlan(valid({ pricePerMeal: "cheap" }))).toMatch(/price/i);
      expect(validateMealPlan(valid({ pricePerMeal: "1" }))).toBeUndefined();
    });
  });

  describe("the subscriber limit", () => {
    it("treats blank as uncapped rather than invalid", () => {
      // No ceiling is a real choice a kitchen makes, not a missing field.
      expect(validateMealPlan(valid({ maxSubscribers: "" }))).toBeUndefined();
    });

    it("refuses zero and fractions", () => {
      expect(validateMealPlan(valid({ maxSubscribers: "0" }))).toMatch(/limit/i);
      expect(validateMealPlan(valid({ maxSubscribers: "2.5" }))).toMatch(/limit/i);
      expect(validateMealPlan(valid({ maxSubscribers: "1" }))).toBeUndefined();
    });
  });

  describe("a plan that is not one of the three meals", () => {
    it("refuses 'something else' with no label", () => {
      // Without a label `mapMealPlan` falls back to "Subscription", so the
      // card would name nothing the cook chose.
      expect(validateMealPlan(valid({ slotKind: "other", slotLabel: "  " }))).toMatch(/name/i);
    });

    it("accepts it once it is named", () => {
      expect(
        validateMealPlan(valid({ slotKind: "other", slotLabel: "Monthly pickle box" })),
      ).toBeUndefined();
    });
  });

  describe("the rotation", () => {
    it("accepts exactly the DTO's maximum", () => {
      const lines = Array.from({ length: MAX_MENU_LINES }, (_, i) => `Day ${i + 1}`).join("\n");
      expect(validateMealPlan(valid({ weeklyMenu: lines }))).toBeUndefined();
    });

    it("refuses one more than the maximum", () => {
      const lines = Array.from({ length: MAX_MENU_LINES + 1 }, (_, i) => `Day ${i + 1}`).join("\n");
      expect(validateMealPlan(valid({ weeklyMenu: lines }))).toMatch(/menu lines/i);
    });

    it("does not count blank lines toward the limit", () => {
      // Trailing newlines are what a textarea produces; they are not menu.
      const lines = `${Array.from({ length: MAX_MENU_LINES }, (_, i) => `Day ${i + 1}`).join("\n")}\n\n\n`;
      expect(validateMealPlan(valid({ weeklyMenu: lines }))).toBeUndefined();
    });
  });
});

describe("toMealPlanInput", () => {
  it("sends mealType and no slotLabel for one of the three meals", () => {
    const input = toMealPlanInput(valid({ slotKind: "dinner", slotLabel: "leftover text" }));
    expect(input.mealType).toBe("dinner");
    // The stale label must not ride along: `mapMealPlan` prefers `mealType`
    // when resolving `slotName`, so a plan carrying both would render as
    // "Dinner" while storing a contradicting label.
    expect(input.slotLabel).toBeUndefined();
  });

  it("sends slotLabel and no mealType for anything else", () => {
    const input = toMealPlanInput(
      valid({ slotKind: "other", slotLabel: "  Monthly pickle box  " }),
    );
    expect(input.mealType).toBeUndefined();
    expect(input.slotLabel).toBe("Monthly pickle box");
  });

  it("omits empty optional fields rather than sending empty strings", () => {
    const input = toMealPlanInput(valid());
    // `@IsOptional()` treats "" as present, so a blank string would store a
    // blank serving size rather than none.
    expect("servingSize" in input).toBe(false);
    expect("weeklyMenu" in input).toBe(false);
    expect("imageSrc" in input).toBe(false);
    expect("maxSubscribers" in input).toBe(false);
    expect("productId" in input).toBe(false);
  });

  it("trims the rotation into lines and drops the blanks", () => {
    const input = toMealPlanInput(
      valid({ weeklyMenu: "  Mon — Rajma  \n\n  Tue — Kadhi\n   \n" }),
    );
    expect(input.weeklyMenu).toEqual(["Mon — Rajma", "Tue — Kadhi"]);
  });

  it("sends numbers as numbers, not the strings the inputs hold", () => {
    const input = toMealPlanInput(valid({ pricePerMeal: "149.50", maxSubscribers: "12" }));
    expect(input.pricePerMeal).toBe(149.5);
    expect(input.maxSubscribers).toBe(12);
  });

  it("carries the kitchen's own availability switch through", () => {
    expect(toMealPlanInput(valid({ isActive: false })).isActive).toBe(false);
    expect(toMealPlanInput(valid({ isActive: true })).isActive).toBe(true);
  });
});
