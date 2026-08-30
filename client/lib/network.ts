/**
 * Has the visitor asked for less data?
 *
 * Read before starting anything that downloads on its own — the reels
 * rail's muted previews are the case this exists for (M52). Three signals,
 * any one of which answers yes: the `prefers-reduced-data` media query
 * (where a browser implements it), the Save-Data client hint
 * (`navigator.connection.saveData`, Chrome's data-saver switch), and a
 * measured 2G-class connection (`effectiveType`). None of them is
 * available during SSR, and a Server Component must never decide this —
 * the answer is per device, so the server's guess would be wrong for
 * half the visitors and React would throw on the mismatch (#418, the M12
 * lesson). Call it from an effect.
 *
 * Fails **closed** when it cannot tell — in a non-browser context the
 * answer is "yes, reduce" — because the thing being gated is a
 * convenience (a moving thumbnail) and the cost of a wrong "no" is a
 * phone on a metered plan downloading video it did not ask for.
 */
export function prefersReducedData(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  if (window.matchMedia?.("(prefers-reduced-data: reduce)").matches) return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}
