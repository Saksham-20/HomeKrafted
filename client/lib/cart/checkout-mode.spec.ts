import { checkoutModeOf } from "./checkout-mode";

describe("checkoutModeOf", () => {
  it("gives a basket of food the food checkout", () => {
    expect(checkoutModeOf([{ kind: "food" }, { kind: "food" }])).toBe("food");
  });

  it("gives a basket of crafts the gift checkout", () => {
    expect(checkoutModeOf([{ kind: "craft" }])).toBe("gift");
  });

  it("lets any food line decide a mixed basket", () => {
    expect(checkoutModeOf([{ kind: "craft" }, { kind: "food" }])).toBe("food");
  });

  it("falls back to the gift layout when no line says what it is", () => {
    expect(checkoutModeOf([{}, {}])).toBe("gift");
    expect(checkoutModeOf([])).toBe("gift");
  });
});
