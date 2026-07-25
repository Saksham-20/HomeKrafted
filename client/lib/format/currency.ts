/**
 * INR currency formatting. Uses Intl so Indian digit grouping
 * (lakhs/crores — e.g. ₹1,00,000) falls out for free at larger amounts.
 */

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface FormatCurrencyOptions {
  /** Prefix a "+ " / "− " sign, e.g. for wallet ledger rows. */
  sign?: boolean;
}

/**
 * Formats a rupee amount as "₹1,250". Pass `{ sign: true }` to render
 * ledger-style signed amounts ("+ ₹1,000" / "− ₹560") — the sign is taken
 * from the value of `amount` itself.
 */
export function formatCurrency(
  amount: number,
  options: FormatCurrencyOptions = {},
): string {
  const formatted = inrFormatter.format(Math.abs(amount));
  if (!options.sign) return formatted;
  return amount < 0 ? `− ${formatted}` : `+ ${formatted}`;
}
