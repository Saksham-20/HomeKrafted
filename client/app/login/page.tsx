import { LoginClient } from "@/components/auth/LoginClient";
import { getCachedSocialConfig } from "@/lib/auth/social-config.server";

/**
 * Login (M7a) — a thin server wrapper, consistent with every other route
 * (`Header.tsx` → `HeaderClient.tsx`, `WalletPage` → `WalletClient`, ...).
 *
 * It does fetch one thing (M27): which social providers are configured.
 * Reading it here rather than from the browser keeps the sign-in page off
 * the per-IP auth throttle budget, avoids a hydration flash where the
 * buttons appear a beat late, and means a provider with no key configured
 * renders nothing at all rather than a control that can only fail.
 *
 * That read is process-cached (M31) — it was an upstream round trip in
 * front of the first byte of the most latency-sensitive page on the site.
 * See `lib/auth/social-config.server.ts`.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const socialConfig = await getCachedSocialConfig();
  return <LoginClient socialConfig={socialConfig} />;
}
