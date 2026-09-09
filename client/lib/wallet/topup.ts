/**
 * Adding money to the wallet — the amounts offered and the bonus rule.
 *
 * Split out on 2026-09-06 for the same reason `gift-intent-shape.ts` was:
 * both packages need these and neither of the places they lived is
 * importable by the app. `topupOptions` sat in `lib/data/wallet.ts`, which
 * Metro stubs outright (it is mock data, and these tiles are not); the two
 * bonus constants sat in `lib/wallet/WalletContext.tsx`, which imports
 * React and is web-only by construction.
 *
 * **Nothing here credits anything.** The server applies the identical
 * bonus rule when Razorpay's `payment.captured` webhook lands
 * (`server/src/payments/`), and that is the only writer. `topupBonus` is
 * for the sentence *before* somebody pays — "₹2,000 or more earns 3%
 * extra" — and must never be used to report what a wallet now holds. The
 * balance after a top-up is read back from `GET /wallet`, or it is a
 * client-invented number on a money screen.
 */

/** Add-money amount picker tiles. */
export const TOPUP_OPTIONS: readonly number[] = [500, 1000, 2000, 5000];

/**
 * Top-ups **above** this amount earn a bonus credit. Strictly above, and
 * the copy says "above" for that reason — a tile of exactly ₹2,000 earns
 * nothing, and a screen saying "₹2,000 or more" would be lying about the
 * tile it is sitting next to.
 */
export const TOPUP_BONUS_THRESHOLD = 2000;

/** 3%, matching the server's own rule at capture. */
export const TOPUP_BONUS_RATE = 0.03;

/** What the bonus *will* be, for copy shown before paying. Never a balance. */
export function topupBonus(amount: number): number {
  if (!Number.isFinite(amount) || amount <= TOPUP_BONUS_THRESHOLD) return 0;
  return Math.round(amount * TOPUP_BONUS_RATE);
}

/**
 * A typed amount → rupees, or `undefined`.
 *
 * Total, because it reads a free-text field on a money screen. Rejects
 * anything that is not a positive finite number, and rejects a fractional
 * rupee: Razorpay charges in paise and the server converts, so ₹10.005
 * is an amount nobody can be charged.
 */
export function parseTopupAmount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (!Number.isInteger(value)) return undefined;
  return value;
}
