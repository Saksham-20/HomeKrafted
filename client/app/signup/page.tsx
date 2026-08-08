import { LoginClient } from "@/components/auth/LoginClient";

/**
 * Sign up — the same screen as `/login` since M25.
 *
 * There is one form now: it takes an identifier and a password and
 * decides for itself whether that is a sign-in or a sign-up, because the
 * visitor cannot reliably answer that question and shouldn't have to. The
 * route is kept rather than redirected — "create an account" links exist
 * in the wild, and a 200 on the form they expected is better than a
 * bounce.
 */
export default function SignupPage() {
  return <LoginClient />;
}
