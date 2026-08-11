import { SOCIAL_CONFIG_OFF, type SocialConfig } from "@/lib/api/auth";
import { http } from "@/lib/api/http";

/**
 * `GET /auth/social/config`, cached in the web process (M31).
 *
 * `/login` and `/signup` are the two most latency-sensitive pages on the
 * site and both `await` this config before a single byte of HTML is
 * flushed — so an upstream round trip sat in front of every sign-in page
 * load, against the same 1 vCPU that is busy hashing somebody else's
 * password.
 *
 * A module-scoped cache rather than `unstable_cache`/ISR: the pages stay
 * dynamic for their own reasons, and the custom `http` client does not
 * compose with Next's fetch cache. `web` runs as a single pm2 fork, so
 * this is one cache, warm after the first request.
 *
 * **Why a short TTL is safe.** The answer is derived from server env
 * (`GOOGLE_CLIENT_ID` and friends), and changing those requires
 * restarting the API anyway — the value cannot change under us without an
 * operator present. The TTL exists so that operator doesn't *also* have
 * to restart the web process.
 *
 * **A failed read is never cached.** This calls the endpoint directly
 * rather than going through `getSocialConfig` precisely so it can tell
 * "the API says both providers are off" (a real answer, cacheable) from
 * "the API did not answer" (fail closed for this render only). Caching
 * the second would turn one blip into five minutes of missing sign-in
 * buttons.
 *
 * This module is server-only by convention — the `.server.ts` suffix and
 * the fact that nothing client-side imports it. Do not import it from a
 * `"use client"` component: the cache would be per-tab and pointless.
 */
const TTL_MS = 5 * 60 * 1000;

let cached: { value: SocialConfig; at: number } | undefined;

export async function getCachedSocialConfig(): Promise<SocialConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  try {
    const value = await http.get<SocialConfig>("/auth/social/config", { auth: false });
    cached = { value, at: Date.now() };
    return value;
  } catch {
    return SOCIAL_CONFIG_OFF;
  }
}
