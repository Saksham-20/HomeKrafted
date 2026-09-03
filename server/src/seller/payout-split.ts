/**
 * The commission arithmetic, in one pure function (M37; GST on the fee
 * added 2026-09-02).
 *
 * `commissionEnabled` is a platform setting that defaults to **off**:
 * the engine exists so the numbers are honest and visible everywhere
 * before anybody flips it, and flipping it is a business decision — not
 * something a code change gets to make in passing (CLAUDE.md, "the
 * platform collects nothing"). While off, `amount` equals gross and the
 * applied rates are recorded as 0 — a disabled era must never read as "a
 * 0% rate was decided".
 *
 * **GST rides on the commission, never on the seller's earnings.** The
 * commission is Homekrafted's service fee to the HomeKrafter, and Indian
 * GST applies to that fee (`commissionGstPct`, platform setting, default
 * 18). It therefore exists only while commission does: disabled era, or
 * a 0% commission, means no fee and no tax on it. The seller's own goods
 * are their supply, not ours — nothing here touches the price a buyer
 * paid.
 *
 * Rounding is half-up to paise at each step, and `amount` is derived by
 * subtraction from the rounded deductions so the figures always
 * reconcile exactly: gross = amount + commissionAmount + gstAmount, to
 * the paisa.
 */

export interface PayoutSplit {
  /** The payable figure — what `Payout.amount` stores. */
  amount: number;
  grossAmount: number;
  commissionAmount: number;
  /** The rate *applied* (0 while disabled), not the configured rate. */
  commissionPct: number;
  /** GST charged on `commissionAmount` — the platform's tax on its own fee. */
  gstAmount: number;
  /** The GST rate *applied* (0 while commission is disabled or the fee is 0). */
  gstPct: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function computePayoutSplit(
  gross: number,
  pct: number,
  enabled: boolean,
  gstPct = 0,
): PayoutSplit {
  const grossAmount = round2(gross);
  if (!enabled) {
    return {
      amount: grossAmount,
      grossAmount,
      commissionAmount: 0,
      commissionPct: 0,
      gstAmount: 0,
      gstPct: 0,
    };
  }
  const commissionAmount = round2((grossAmount * pct) / 100);
  // No fee, no tax on the fee — and the applied GST rate records as 0 for
  // the same reason a disabled commission does: nothing was decided here.
  const appliedGstPct = commissionAmount > 0 ? gstPct : 0;
  const gstAmount = round2((commissionAmount * appliedGstPct) / 100);
  return {
    amount: round2(grossAmount - commissionAmount - gstAmount),
    grossAmount,
    commissionAmount,
    commissionPct: pct,
    gstAmount,
    gstPct: appliedGstPct,
  };
}
