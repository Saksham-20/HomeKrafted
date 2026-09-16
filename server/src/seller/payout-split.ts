/**
 * The commission arithmetic, in one pure function (M37; GST on the fee
 * added 2026-09-02).
 *
 * **Narrowed scope since the markup commission model (2026-09-16,
 * `common/pricing/commission.ts`).** A marketplace `OrderItem` now
 * records its own split at checkout — the buyer paid the fee, not the
 * maker — so `SellerPayoutsService` pays a marketplace line's
 * `sellerAmount` in full and never runs it through `computePayoutSplit`
 * again. This function's deduction still applies to the two streams that
 * were never migrated to markup pricing: laundry bookings (withdrawn,
 * M19 — only historical delivered rows remain) and WhatsApp snack orders
 * (never routed through the cart/checkout the markup model prices). Both
 * are still typed at the maker's *sticker* price with no embedded fee, so
 * the deduction is still the only place commission is realised on them.
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
  // Same gate on `commissionPct`: a zero-gross split (nothing left to pay
  // out on a stream with no earnings in it — the shape a marketplace-only
  // payout takes since the markup model) must not read as "we deducted at
  // the configured rate" when `commissionAmount` is 0.
  const appliedPct = commissionAmount > 0 ? pct : 0;
  const appliedGstPct = commissionAmount > 0 ? gstPct : 0;
  const gstAmount = round2((commissionAmount * appliedGstPct) / 100);
  return {
    amount: round2(grossAmount - commissionAmount - gstAmount),
    grossAmount,
    commissionAmount,
    commissionPct: appliedPct,
    gstAmount,
    gstPct: appliedGstPct,
  };
}

/**
 * Splits one blended "already claimed" figure — the sum of `grossAmount`
 * across every payout a seller has ever had, marketplace and legacy
 * earnings mixed together with no record of which was which — back into
 * a marketplace share and a legacy share, so each stream's still-pending
 * balance can be computed against its own claimed history
 * (`SellerPayoutsService`).
 *
 * **Attributes as much of the claimed total to marketplace as could
 * possibly be true, capped by how much marketplace gross has ever
 * existed.** No payout row older than 2026-09-16 recorded the split, so
 * this can never be exact — but capping the marketplace share at
 * `marketplaceGrossEver` guarantees it never *overstates* what
 * marketplace has claimed, which is what keeps `marketplaceGrossPending`
 * (this function's caller subtracts its result from `marketplaceGrossEver`)
 * from ever reading larger than the truth. A payout already settled
 * under the old blended model can therefore never be paid out a second
 * time under the new one — the error this cannot resolve exactly instead
 * lands on the legacy share, which is allowed to read slightly high
 * (a bounded, self-correcting overstatement that shrinks to zero within
 * one or two payout cycles, once cumulative claims exceed the
 * marketplace total) rather than the platform ever double-paying.
 *
 * Once every `Payout` row post-dates the markup model, `claimedTotalGross`
 * and `marketplaceGrossEver` stop overlapping in any ambiguous way and
 * this degenerates to an exact split — the estimate is only ever
 * approximate during the transition window.
 */
export function allocateClaimedGross(
  claimedTotalGross: number,
  marketplaceGrossEver: number,
): { marketplace: number; legacy: number } {
  const marketplace = Math.min(marketplaceGrossEver, claimedTotalGross);
  return { marketplace, legacy: Math.max(0, claimedTotalGross - marketplace) };
}
