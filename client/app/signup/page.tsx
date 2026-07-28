import { SignupClient } from "@/components/auth/SignupClient";

/**
 * Sign up (M8.5) — mirrors `/login`'s thin server-wrapper pattern
 * (`Header.tsx` → `HeaderClient.tsx`, `WalletPage` → `WalletClient`, ...).
 * All the interactive state lives in `SignupClient`.
 */
export default function SignupPage() {
  return <SignupClient />;
}
