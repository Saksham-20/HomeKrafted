import { allocateClaimedGross, computePayoutSplit } from '../../src/seller/payout-split';

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe('computePayoutSplit', () => {
  it('disabled: amount equals gross and the applied rates record as 0', () => {
    expect(computePayoutSplit(4500, 10, false, 18)).toEqual({
      amount: 4500,
      grossAmount: 4500,
      commissionAmount: 0,
      commissionPct: 0,
      gstAmount: 0,
      gstPct: 0,
    });
  });

  it('enabled, no GST configured: 10% of ₹4500 is ₹450, leaving ₹4050', () => {
    expect(computePayoutSplit(4500, 10, true)).toEqual({
      amount: 4050,
      grossAmount: 4500,
      commissionAmount: 450,
      commissionPct: 10,
      gstAmount: 0,
      gstPct: 0,
    });
  });

  it('enabled with GST: 18% of the ₹450 fee is ₹81, leaving ₹3969', () => {
    expect(computePayoutSplit(4500, 10, true, 18)).toEqual({
      amount: 3969,
      grossAmount: 4500,
      commissionAmount: 450,
      commissionPct: 10,
      gstAmount: 81,
      gstPct: 18,
    });
  });

  it('GST rides on the fee, never the gross: 0% commission means ₹0 GST and an applied GST rate of 0', () => {
    expect(computePayoutSplit(1000, 0, true, 18)).toEqual({
      amount: 1000,
      grossAmount: 1000,
      commissionAmount: 0,
      commissionPct: 0,
      gstAmount: 0,
      gstPct: 0,
    });
  });

  it('paise reconcile exactly: gross = amount + commission + gst, to the paisa', () => {
    // 12.5% of ₹333.33 = ₹41.66625 → ₹41.67; 18% of ₹41.67 = ₹7.5006 →
    // ₹7.50; amount = 333.33 − 41.67 − 7.50.
    const split = computePayoutSplit(333.33, 12.5, true, 18);
    expect(split.commissionAmount).toBe(41.67);
    expect(split.gstAmount).toBe(7.5);
    expect(split.amount).toBe(284.16);
    // `toBeCloseTo`: the stored figures are exact 2dp; only the JS
    // re-addition in this assertion drifts (binary floats).
    expect(split.amount + split.commissionAmount + split.gstAmount).toBeCloseTo(
      split.grossAmount,
      2,
    );
  });

  it('rounds a drifting float gross before splitting', () => {
    // 0.1 + 0.2 style inputs must not leak 17 decimal places into money.
    const split = computePayoutSplit(100.005, 10, true);
    expect(split.grossAmount).toBe(100.01);
    expect(split.commissionAmount).toBe(10);
    expect(split.amount).toBe(90.01);
  });

  it('enabled but nothing to pay out: the applied rate records as 0, same as a disabled era — never "we deducted at 10% and it came to nothing"', () => {
    expect(computePayoutSplit(0, 10, true, 18)).toEqual({
      amount: 0,
      grossAmount: 0,
      commissionAmount: 0,
      commissionPct: 0,
      gstAmount: 0,
      gstPct: 0,
    });
  });
});

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe('allocateClaimedGross', () => {
  it('a fresh seller (nothing claimed yet) attributes nothing to either stream', () => {
    expect(allocateClaimedGross(0, 5000)).toEqual({ marketplace: 0, legacy: 0 });
  });

  it('claimed total fits entirely inside marketplace gross ever earned: all of it is attributed to marketplace', () => {
    // The conservative direction — assume as much of what was already
    // paid out as could possibly be true was marketplace, so a
    // marketplace line already settled under the old blended model can
    // never be paid out a second time.
    expect(allocateClaimedGross(3000, 5000)).toEqual({ marketplace: 3000, legacy: 0 });
  });

  it('claimed total exceeds marketplace gross ever earned: the excess is attributed to legacy', () => {
    expect(allocateClaimedGross(8000, 5000)).toEqual({ marketplace: 5000, legacy: 3000 });
  });

  it('no marketplace gross has ever existed: the whole claimed total is legacy', () => {
    expect(allocateClaimedGross(1200, 0)).toEqual({ marketplace: 0, legacy: 1200 });
  });
});
