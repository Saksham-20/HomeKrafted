/**
 * Splits one order's collectible cash across several `DeliveryJob`s —
 * one per (vendor, address) group on a COD order — proportionally to
 * each group's own line subtotal, rounded to the rupee.
 *
 * Pure so the rounding rule is testable without a database. Rounding
 * every share independently would drift from the order's real total by a
 * few paise in either direction; instead every group but the last is
 * rounded normally and **the last group absorbs whatever is left**, so
 * `Σ shares === totalCod` exactly (to the rupee) every time. The caller
 * decides "last" by the order it hands groups in — sort by a stable key
 * (vendorId, then addressId) before calling this, or the "last" group
 * changes from run to run.
 */
export function allocateCodAmount(groups: { key: string; subtotal: number }[], totalCod: number): Map<string, number> {
  const result = new Map<string, number>();
  if (groups.length === 0 || totalCod <= 0) {
    for (const g of groups) result.set(g.key, 0);
    return result;
  }

  const orderSubtotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  if (orderSubtotal <= 0) {
    // No basis to split on — the last group takes it all rather than
    // silently losing the money to rounding-to-zero everywhere.
    groups.forEach((g, i) => result.set(g.key, i === groups.length - 1 ? Math.round(totalCod) : 0));
    return result;
  }

  let allocated = 0;
  groups.forEach((g, i) => {
    const isLast = i === groups.length - 1;
    const share = isLast ? Math.round(totalCod) - allocated : Math.round((g.subtotal / orderSubtotal) * totalCod);
    result.set(g.key, share);
    allocated += share;
  });

  return result;
}
