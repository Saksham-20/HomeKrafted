"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./AdminLoginClient.module.css";

/**
 * `/admin/login` (M11a; real auth M8.4b) — internal staff sign-in, separate
 * from both the consumer `/login` and `/seller/login`. Deliberately **no
 * public sign-up affordance anywhere on this screen** (unlike
 * `/seller/login`'s "Apply to sell" link) — the admin surface is
 * staff-only, provisioned out-of-band, not something a visitor requests.
 * Both the email/password form and "continue as demo admin" now sign in
 * for real (`POST /auth/login`, `useAuth().signInAsAdmin`) against the one
 * seeded admin account (`server/prisma/seed.ts`) — the typed email/
 * password still isn't checked against a real per-staff credential (there's
 * only the one seeded account), same "continue as demo ___" framing
 * `SellerLoginClient` uses. `middleware.ts` is what actually redirects a
 * signed-out visitor here; this component never redirects *to* `/admin`
 * without the user acting.
 */
export function AdminLoginClient() {
  const router = useRouter();
  const { isSignedIn, ready, busy, role, user, signInAsAdmin, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function goToDashboard() {
    router.push("/admin");
  }

  async function handleSignIn() {
    if (!email.trim().includes("@") || password.trim().length < 4) return;
    // Still no real credential check against the typed email/password —
    // every "sign in" on this screen (form or demo button) signs in as the
    // one seeded demo admin account, same as `SellerLoginClient`'s "demo
    // ___" buttons. What changed in M8.4b: this is now a real `POST
    // /auth/login` (see `signInAsAdmin`'s doc comment), not a local flip.
    setError(undefined);
    try {
      await signInAsAdmin();
      goToDashboard();
    } catch {
      setError("Couldn't sign in — check the demo admin account still exists.");
    }
  }

  async function handleDemoSignIn() {
    setError(undefined);
    try {
      await signInAsAdmin();
      goToDashboard();
    } catch {
      setError("Couldn't sign in — check the demo admin account still exists.");
    }
  }

  if (ready && isSignedIn && role === "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <Card className={styles.signedInCard}>
            <span className={styles.eyebrow}>Already signed in</span>
            <h1 className={styles.title}>You&rsquo;re all set</h1>
            <p className={styles.subtitle}>Signed in as {user?.name ?? "staff"}.</p>
            <div className={styles.signedInActions}>
              <Button variant="primary" onClick={goToDashboard}>
                Go to dashboard
              </Button>
              <Button variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.wordmark}>
            Home<span className={styles.krafted}>krafted</span>
          </span>
          <span className={styles.eyebrow}>Admin panel — staff only</span>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>
            Internal access for the Homekrafted team. No public sign-up —
            contact an existing admin if you need an account.
          </p>
        </div>

        <Card className={styles.card}>
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>Work email</span>
              <input
                type="email"
                className={styles.input}
                placeholder="you@homekrafted.example"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <input
                type="password"
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button
              variant="primary"
              onClick={handleSignIn}
              disabled={!email.trim().includes("@") || password.trim().length < 4 || busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>

          <div className={styles.divider}>or</div>

          <button type="button" className={styles.demoButton} onClick={handleDemoSignIn} disabled={busy}>
            Continue as demo admin →
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </Card>

        <p className={styles.footnote}>
          Internal staff accounts are provisioned out-of-band (no public
          sign-up) — the form above still doesn&rsquo;t check the typed
          password against a real per-staff credential, so every sign-in
          here (form or &ldquo;continue as&rdquo;) authenticates as the one
          seeded demo admin account.
        </p>
      </div>
    </div>
  );
}
