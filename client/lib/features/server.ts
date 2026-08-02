import { API_BASE_URL } from "@/lib/api/http";
import { DEFAULT_FEATURES, type Features } from "@/lib/features";

/**
 * Server-side flag read (M17). Called once by the root layout, which then
 * hands the result to `<FeaturesProvider>` for every Client Component and
 * makes it available to any Server Component that awaits this directly.
 *
 * Deliberately **not** routed through `lib/api/http.ts`: that client
 * attaches the caller's access token and handles 401 refresh, neither of
 * which applies to an unauthenticated, per-deployment value. Going
 * straight to `fetch` is also what lets this opt into Next's data cache,
 * so a flag read does not become a round trip on every page render.
 */
export async function getFeatures(): Promise<Features> {
  try {
    const res = await fetch(`${API_BASE_URL}/settings/public`, {
      // Sixty seconds: a flip reaches visitors within a minute, and a
      // busy minute costs one request rather than thousands.
      next: { revalidate: 60 },
    });
    if (!res.ok) return DEFAULT_FEATURES;

    const body: { hamperBuilderEnabled?: unknown } = await res.json();
    return {
      // `=== true`, not a truthy check: a malformed payload must not
      // enable anything. Same reason the server parses the stored value
      // strictly.
      hamperBuilder: body.hamperBuilderEnabled === true,
    };
  } catch {
    // The API being down must not take the whole site with it. Every
    // held feature stays held, which is the safe direction — and the
    // rest of the page renders.
    return DEFAULT_FEATURES;
  }
}
