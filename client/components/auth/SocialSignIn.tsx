"use client";

import type { SocialConfig } from "@/lib/api/auth";

type Props = {
  /**
   * Which providers the API says are usable, with their public client ids.
   * Read server-side and passed down — see `lib/api/auth.ts#getSocialConfig`.
   */
  config: SocialConfig;
  /** Called with a verified-by-the-provider credential. The caller owns error handling and redirects. */
  onCredential: (
    provider: "google" | "apple",
    credential: { idToken: string; nonce?: string },
  ) => void;
  disabled?: boolean;
  /** Verb for the accessible labels. */
  action: "Sign in" | "Sign up" | "Continue";
};

/**
 * Social sign-in (Google & Apple) is switched off until OAuth client ids are
 * configured (`docs/LAUNCH-READINESS.md` §0.4), so nothing renders — no
 * buttons and no divider.
 *
 * The GIS implementation lives in git history: `git show b8d3ee3:client/components/auth/SocialSignIn.tsx`.
 * When restoring it, drop its fallback buttons that post placeholder tokens
 * (`"demo-google-token"`, `"apple-login-token"`) — the server verifier refuses
 * them, so they are buttons that cannot work. Apple needs a real
 * Sign in with Apple JS flow before its button returns.
 */
export function SocialSignIn(_props: Props) {
  void _props;
  return null;
}
