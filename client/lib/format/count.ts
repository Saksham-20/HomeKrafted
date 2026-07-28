/**
 * Compact social counts — "18.4k", "1.2M", "980". Used by the reels rail
 * for view/like chips, where the exact number never matters and the space
 * is one line of mono type.
 */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands >= 100 ? Math.round(thousands) : trimZero(thousands.toFixed(1))}k`;
  }
  const millions = value / 1_000_000;
  return `${millions >= 100 ? Math.round(millions) : trimZero(millions.toFixed(1))}M`;
}

function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
