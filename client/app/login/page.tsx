import { LoginClient } from "@/components/auth/LoginClient";
import { getSocialConfig } from "@/lib/api/auth";

/**
 * Login (M7a) — a thin server wrapper, consistent with every other route
 * (`Header.tsx` → `HeaderClient.tsx`, `WalletPage` → `WalletClient`, ...).
 *
 * It does fetch one thing (M27): which social providers are configured.
 * Reading it here rather than from the browser keeps the sign-in page off
 * the per-IP auth throttle budget, avoids a hydration flash where the
 * buttons appear a beat late, and means a provider with no key configured
 * renders nothing at all rather than a control that can only fail.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const socialConfig = await getSocialConfig();
  return <LoginClient socialConfig={socialConfig} />;
}
