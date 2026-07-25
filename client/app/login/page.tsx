import { LoginClient } from "@/components/auth/LoginClient";

/**
 * Login (M7a) — no server data to fetch (the mock auth store is entirely
 * client state, see `lib/auth/AuthContext.tsx`), but kept as a thin
 * server wrapper around the interactive client screen for consistency
 * with every other route in this app (`Header.tsx` → `HeaderClient.tsx`,
 * `WalletPage` → `WalletClient`, ...).
 */
export default function LoginPage() {
  return <LoginClient />;
}
