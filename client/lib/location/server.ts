import { cookies } from "next/headers";

/**
 * The buyer's coordinates as seen by a Server Component.
 *
 * `/shop` and `/snacks` render on the server, so they can't read the
 * `localStorage` copy `LocationContext` owns — they read the `hk_loc`
 * cookie mirror instead (written by `writeLocationCookie`).
 *
 * Returns `undefined` when the visitor has no location set, which is a
 * normal state, not an error: they declined the prompt or haven't answered
 * it. Callers pass `undefined` straight through to `getProducts`/
 * `getSnacks`, which then return the full catalogue.
 */
export async function getBuyerCoords(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const raw = (await cookies()).get("hk_loc")?.value;
    if (!raw) return undefined;
    const [lat, lng] = decodeURIComponent(raw).split(",").map(Number);
    // A malformed cookie (hand-edited, truncated) must not break the page —
    // fall back to "location unknown" and show everything.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { lat, lng };
  } catch {
    return undefined;
  }
}
