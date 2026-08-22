/**
 * The commission arithmetic, in one pure function (M37).
 *
 * `commissionEnabled` is a platform setting that defaults to **off**:
 * the engine exists so the numbers are honest and visible everywhere
 * before anybody flips it, and flipping it is a business decision — not
 * something a code change gets to make in passing (CLAUDE.md, "the
 * platform collects nothing"). While off, `amount` equals gross and the
 * applied rate is recorded as 0 — a disabled era must never read as "a
 * 0% rate was decided".
 *
 * Rounding is half-up to paise at each step, and `amount` is derived by
 * subtraction from the rounded commission so the three figures always
 * reconcile exactly: gross = amount + commissionAmount, to the paisa.
 */

export interface PayoutSplit {
  /** The payable figure — what `Payout.amount` stores. */
  amount: number;
  grossAmount: number;
  commissionAmount: number;
  /** The rate *applied* (0 while disabled), not the configured rate. */
  commissionPct: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function computePayoutSplit(gross: number, pct: number, enabled: boolean): PayoutSplit {
  const grossAmount = round2(gross);
  if (!enabled) {
    return { amount: grossAmount, grossAmount, commissionAmount: 0, commissionPct: 0 };
  }
  const commissionAmount = round2((grossAmount * pct) / 100);
  return {
    amount: round2(grossAmount - commissionAmount),
    grossAmount,
    commissionAmount,
    commissionPct: pct,
  };
}
