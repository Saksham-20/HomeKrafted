import { FOOD_COMING_SOON, isFoodComingSoonError, mockFoodOrdersOpen } from "./food-launch";

describe("food coming soon", () => {
  it("recognises the server's refusal by its code, not its sentence", () => {
    expect(isFoodComingSoonError({ code: FOOD_COMING_SOON, message: "anything" })).toBe(true);
    expect(isFoodComingSoonError({ code: "CART_OTHER_MAKER" })).toBe(false);
    expect(isFoodComingSoonError(new Error("Homemade food is coming soon"))).toBe(false);
    expect(isFoodComingSoonError(null)).toBe(false);
  });

  it("keeps mock mode closed unless explicitly opened", () => {
    expect(mockFoodOrdersOpen(undefined)).toBe(false);
    expect(mockFoodOrdersOpen("false")).toBe(false);
    expect(mockFoodOrdersOpen("true")).toBe(true);
  });
});
