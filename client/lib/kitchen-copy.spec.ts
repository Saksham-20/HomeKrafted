import {
  CHECKOUT_LOADING,
  GENERAL_LOADING,
  MAKER_LOADING,
  ORDER_STAGE_LABEL,
  kitchenLoading,
} from "./kitchen-copy";

/**
 * The point of these is not the wording — copy changes. It is that the
 * picker is a **pure function of its key**.
 *
 * A random pick would render one line on the server and a different one
 * in the browser, which is React #418: the hydration mismatch `CLAUDE.md`
 * records from M12 and the reason `lib/occasions.ts` never reads the
 * clock. That failure is invisible in development until it isn't, so the
 * determinism is pinned here rather than trusted.
 */
describe("kitchenLoading", () => {
  it("returns the same line for the same key, every call", () => {
    const first = kitchenLoading("shop");
    for (let i = 0; i < 50; i += 1) {
      expect(kitchenLoading("shop")).toBe(first);
    }
  });

  it("always returns a line from the requested set", () => {
    for (const key of ["shop", "search", "snacks", "a", "", "seller/portal"]) {
      expect(GENERAL_LOADING).toContain(kitchenLoading(key));
      expect(CHECKOUT_LOADING).toContain(kitchenLoading(key, CHECKOUT_LOADING));
      expect(MAKER_LOADING).toContain(kitchenLoading(key, MAKER_LOADING));
    }
  });

  it("spreads different keys across the set rather than clumping", () => {
    // Not a distribution guarantee — just that the hash is doing something.
    // `key.length % n` would put every four-letter route on one line.
    const keys = ["shop", "cart", "help", "meal", "gift", "shop/all", "search"];
    const chosen = new Set(keys.map((key) => kitchenLoading(key)));
    expect(chosen.size).toBeGreaterThan(1);
  });

  it("falls back rather than returning undefined on an empty set", () => {
    expect(kitchenLoading("shop", [])).toBe("Loading…");
  });
});

describe("ORDER_STAGE_LABEL", () => {
  /**
   * The stages carry food *and* craft orders through the same pipeline
   * (M20), so a label that only makes sense in a kitchen is a bug on half
   * the catalogue — "on the stove now" would read as broken to someone who
   * ordered a candle. This guards the specific words that were rejected
   * for that reason.
   */
  it("uses no wording that is false for a non-food order", () => {
    const foodOnly = [/stove/i, /simmer/i, /cook/i, /oven/i, /fry/i, /bake/i];
    for (const label of Object.values(ORDER_STAGE_LABEL)) {
      for (const pattern of foodOnly) {
        expect(label).not.toMatch(pattern);
      }
    }
  });

  it("covers every stage the buyer's stepper renders", () => {
    expect(Object.keys(ORDER_STAGE_LABEL)).toEqual([
      "placed",
      "confirmed",
      "packed",
      "shipped",
      "delivered",
    ]);
  });
});
