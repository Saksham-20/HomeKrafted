import {
  TOPUP_BONUS_RATE,
  TOPUP_BONUS_THRESHOLD,
  TOPUP_OPTIONS,
  parseTopupAmount,
  topupBonus,
} from "@/lib/wallet/topup";

/**
 * The bonus is the server's rule, applied at webhook capture. Everything
 * here is about the sentence shown *before* somebody pays — a number on a
 * money screen that turns out to be wrong is worse than no number.
 */
describe("topupBonus", () => {
  it("is strictly above the threshold, which is what the copy says", () => {
    // A tile of exactly ₹2,000 earns nothing, and "₹2,000 or more" beside
    // that tile would be a lie about the button next to it.
    expect(topupBonus(TOPUP_BONUS_THRESHOLD)).toBe(0);
    expect(topupBonus(TOPUP_BONUS_THRESHOLD + 1)).toBe(Math.round((TOPUP_BONUS_THRESHOLD + 1) * TOPUP_BONUS_RATE));
  });

  it("gives 3% on a bonus-earning amount", () => {
    // Computed by hand: 5000 × 0.03.
    expect(topupBonus(5000)).toBe(150);
  });

  it("answers zero rather than NaN for anything unusable", () => {
    for (const amount of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(topupBonus(amount)).toBe(0);
    }
  });

  it("has a tile on both sides of the threshold, so the rule is discoverable", () => {
    expect(TOPUP_OPTIONS.some((a) => a <= TOPUP_BONUS_THRESHOLD)).toBe(true);
    expect(TOPUP_OPTIONS.some((a) => a > TOPUP_BONUS_THRESHOLD)).toBe(true);
  });
});

describe("parseTopupAmount", () => {
  it("reads a plain rupee amount", () => {
    expect(parseTopupAmount(" 750 ")).toBe(750);
  });

  it("refuses anything that is not a positive whole number of rupees", () => {
    // Razorpay charges in paise and the server converts, so ₹10.005 is an
    // amount nobody can actually be charged.
    for (const raw of ["", "  ", "0", "-50", "abc", "1e3x", "10.5", "NaN", "Infinity"]) {
      expect(parseTopupAmount(raw)).toBeUndefined();
    }
  });

  it("accepts an exponent that is still a whole number", () => {
    // `Number("1e3")` is 1000. Refusing it would be a shape rule dressed
    // up as a value rule, and the server takes the number either way.
    expect(parseTopupAmount("1e3")).toBe(1000);
  });
});
