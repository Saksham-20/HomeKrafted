import { LOYALTY_TIERS, referralHowItWorks } from "./loyalty-copy";

describe("loyalty copy after order cashback was removed (2026-09-19)", () => {
  it("promises no cashback on any tier or in any how-it-works step", () => {
    // Every tier perk used to open with "+0.5% extra cashback" and so on —
    // a rate no server code ever honoured, on top of a base cashback that no
    // longer exists. The perks are display copy that shows on the account
    // screen and in the native app, so this is the one place both are held.
    const words = [
      ...LOYALTY_TIERS.map((t) => t.perk),
      ...referralHowItWorks.flatMap((s) => [s.title, s.description]),
    ];
    for (const text of words) expect(text).not.toMatch(/cashback|% back|% extra/i);
  });

  it("keeps the ladder ordered, with a perk line on every tier", () => {
    expect(LOYALTY_TIERS.map((t) => t.tier)).toEqual(["bronze", "silver", "gold", "platinum"]);
    const thresholds = LOYALTY_TIERS.map((t) => t.threshold);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    for (const t of LOYALTY_TIERS) expect(t.perk.trim().length).toBeGreaterThan(0);
  });
});
