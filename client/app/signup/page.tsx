import { LoginClient } from "@/components/auth/LoginClient";
import { getSocialConfig } from "@/lib/api/auth";

/**
 * Sign up — the same screen as `/login` since M25.
 *
 * There is one form now: it takes an identifier and a password and
 * decides for itself whether that is a sign-in or a sign-up, because the
 * visitor cannot reliably answer that question and shouldn't have to. The
 * route is kept rather than redirected — "create an account" links exist
 * in the wild, and a 200 on the form they expected is better than a
 * bounce.
 *
 * Social config is read server-side for the same reasons as `/login`.
 */
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const socialConfig = await getSocialConfig();
  return <LoginClient socialConfig={socialConfig} />;
}
