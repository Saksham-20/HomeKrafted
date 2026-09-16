import { payFor, RiderPaySettings } from '../../src/rider/rider-pay';

const DEFAULTS: RiderPaySettings = {
  basePay: 2500,
  perKm: 600,
  freeKm: 2,
  waitPerMin: 100,
  freeWaitMin: 10,
};

describe('payFor', () => {
  it('the brief\'s own worked example — 5.34 km, 13 min wait', () => {
    // (5.34 - 2) = 3.34km, rounded half-up to the nearest 0.1km -> 3.3km
    // 3.3 * 600 = 1980 distance paise. (13 - 10) = 3min * 100 = 300 wait paise.
    // 2500 + 1980 + 300 = 4780 total paise.
    const result = payFor({ distanceKm: 5.34, waitMinutes: 13, settings: DEFAULTS });
    expect(result).toEqual({ basePay: 2500, distancePay: 1980, waitPay: 300, totalPay: 4780 });
  });

  it('within the free distance and free wait allowance — only the base pay', () => {
    const result = payFor({ distanceKm: 1.5, waitMinutes: 5, settings: DEFAULTS });
    expect(result).toEqual({ basePay: 2500, distancePay: 0, waitPay: 0, totalPay: 2500 });
  });

  it('exactly at the free-km/free-wait boundary — still zero for both', () => {
    const result = payFor({ distanceKm: 2, waitMinutes: 10, settings: DEFAULTS });
    expect(result).toEqual({ basePay: 2500, distancePay: 0, waitPay: 0, totalPay: 2500 });
  });

  it('rounds the billable distance half-up to the nearest 0.1km', () => {
    // (4.25 - 2) = 2.25km -> rounds to 2.3km (half-up: 22.5 -> 23) -> 2.3 * 600 = 1380 paise.
    const result = payFor({ distanceKm: 4.25, waitMinutes: 0, settings: DEFAULTS });
    expect(result.distancePay).toBe(1380);
  });

  it('a zero-distance, zero-wait job is base pay alone', () => {
    const result = payFor({ distanceKm: 0, waitMinutes: 0, settings: DEFAULTS });
    expect(result).toEqual({ basePay: 2500, distancePay: 0, waitPay: 0, totalPay: 2500 });
  });

  it('never goes negative on distance or wait even with settings below the free allowance', () => {
    const result = payFor({ distanceKm: 1, waitMinutes: 2, settings: DEFAULTS });
    expect(result.distancePay).toBeGreaterThanOrEqual(0);
    expect(result.waitPay).toBeGreaterThanOrEqual(0);
  });
});
