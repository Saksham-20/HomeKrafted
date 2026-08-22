import { computePayoutSplit } from '../../src/seller/payout-split';

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe('computePayoutSplit', () => {
  it('disabled: amount equals gross and the applied rate records as 0', () => {
    expect(computePayoutSplit(4500, 10, false)).toEqual({
      amount: 4500,
      grossAmount: 4500,
      commissionAmount: 0,
      commissionPct: 0,
    });
  });

  it('enabled: 10% of ₹4500 is ₹450, leaving ₹4050', () => {
    expect(computePayoutSplit(4500, 10, true)).toEqual({
      amount: 4050,
      grossAmount: 4500,
      commissionAmount: 450,
      commissionPct: 10,
    });
  });

  it('paise reconcile exactly: gross = amount + commission, to the paisa', () => {
    // 12.5% of ₹333.33 = ₹41.66625 → ₹41.67; amount = 333.33 − 41.67.
    const split = computePayoutSplit(333.33, 12.5, true);
    expect(split.commissionAmount).toBe(41.67);
    expect(split.amount).toBe(291.66);
    // `toBeCloseTo`: the stored figures are exact 2dp; only the JS
    // re-addition in this assertion drifts (291.66 + 41.67 in binary).
    expect(split.amount + split.commissionAmount).toBeCloseTo(split.grossAmount, 2);
  });

  it('a 0% rate while enabled deducts nothing but records the decision', () => {
    expect(computePayoutSplit(1000, 0, true)).toEqual({
      amount: 1000,
      grossAmount: 1000,
      commissionAmount: 0,
      commissionPct: 0,
    });
  });

  it('rounds a drifting float gross before splitting', () => {
    // 0.1 + 0.2 style inputs must not leak 17 decimal places into money.
    const split = computePayoutSplit(100.005, 10, true);
    expect(split.grossAmount).toBe(100.01);
    expect(split.commissionAmount).toBe(10);
    expect(split.amount).toBe(90.01);
  });
});
