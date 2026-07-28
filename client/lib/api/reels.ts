import type { Reel } from "@/lib/types";
import { reels } from "@/lib/data";
import { ApiError, http, isMockMode } from "./http";

function seedReels(): Reel[] {
  return [...reels].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * `GET /reels` — newest first, for the Home page rail. Kept in its own
 * module (rather than folded into `site.ts`) because reels are a real
 * owned entity in M8, not site chrome/copy.
 *
 * **Ahead of the backend**: `server/` has no `reels` module yet, so the
 * endpoint 404s. Reels are static presentational content, and Home
 * prerenders at build time — letting that 404 propagate fails the whole
 * page's static export. Until the server module lands, a `404` (and only
 * a `404`) falls back to the bundled seed data; every other status still
 * throws so real API faults stay visible. Delete this fallback once
 * `GET /reels` exists server-side.
 */
export async function getReels(): Promise<Reel[]> {
  if (isMockMode()) {
    return seedReels();
  }
  try {
    return await http.get<Reel[]>("/reels", { auth: false });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return seedReels();
    }
    throw error;
  }
}
