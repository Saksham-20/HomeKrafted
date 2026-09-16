/**
 * The rider's own earnings for one job, in paise — deliberately not
 * `Prisma.Decimal`. This is a pure function (no clock, no DB), so it
 * takes plain numbers and returns plain numbers; the caller converts to
 * rupees (`/100`) only at the point it writes one of `DeliveryJob`'s
 * `Decimal(12,2)` pay columns, per the R1–R4 brief's cross-cutting money
 * rule ("code that computes pay does so in integer paise internally
 * before it is ever written to one of these columns" — `docs/DATA-MODEL.md`).
 */
export interface RiderPaySettings {
  /** Paise. `PlatformSetting` key `rider.basePay`, default 2500 (₹25). */
  basePay: number;
  /** Paise per km, billed beyond `freeKm`. `rider.perKm`, default 600 (₹6/km). */
  perKm: number;
  /** Km included in `basePay` before distance pay starts. `rider.freeKm`, default 2. */
  freeKm: number;
  /** Paise per minute, billed beyond `freeWaitMin`. `rider.waitPerMin`, default 100 (₹1/min). */
  waitPerMin: number;
  /** Minutes of wait included before wait pay starts. `rider.freeWaitMin`, default 10. */
  freeWaitMin: number;
}

export interface RiderPayBreakdown {
  basePay: number;
  distancePay: number;
  waitPay: number;
  /** `basePay + distancePay + waitPay`. Excludes `incentivePay` — that column is admin-set, not computed here. */
  totalPay: number;
}

/**
 * Billable distance, in whole 0.1 km, rounded half-up — the brief's exact
 * rule. `Math.round` is already round-half-up for a non-negative input
 * (JS rounds `.5` toward `+Infinity`), so no special-casing is needed.
 */
function billableKm(distanceKm: number, freeKm: number): number {
  const over = Math.max(0, distanceKm - freeKm);
  return Math.round(over * 10) / 10;
}

/**
 * Billable wait, in whole minutes. Real elapsed time between two
 * timestamps is rarely an integer, so the caller's fractional minutes are
 * rounded to the nearest whole minute *before* the free allowance is
 * subtracted — the brief's own worked example (13 min wait) is already a
 * whole number and gives no rounding direction beyond that, so this
 * follows the same half-up rule as distance rather than inventing a
 * second one.
 */
function billableWaitMinutes(waitMinutes: number, freeWaitMin: number): number {
  const rounded = Math.round(waitMinutes);
  return Math.max(0, rounded - freeWaitMin);
}

/**
 * `payFor({ distanceKm: 5.34, waitMinutes: 13, settings: DEFAULTS })` →
 * `{ basePay: 2500, distancePay: 1980, waitPay: 300, totalPay: 4780 }` —
 * the brief's own hand-computed example: `(5.34 − 2) → 3.3km × 600 =
 * 1980`, `(13 − 10) = 3min × 100 = 300`.
 */
export function payFor(input: { distanceKm: number; waitMinutes: number; settings: RiderPaySettings }): RiderPayBreakdown {
  const { settings } = input;
  const km = billableKm(input.distanceKm, settings.freeKm);
  const waitMin = billableWaitMinutes(input.waitMinutes, settings.freeWaitMin);

  const basePay = settings.basePay;
  const distancePay = Math.round(km * settings.perKm);
  const waitPay = waitMin * settings.waitPerMin;
  const totalPay = basePay + distancePay + waitPay;

  return { basePay, distancePay, waitPay, totalPay };
}
