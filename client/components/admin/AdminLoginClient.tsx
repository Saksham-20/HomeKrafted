"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./AdminLoginClient.module.css";

/**
 * `/admin/login` (M11a) — internal staff sign-in, separate from both the
 * consumer `/login` and `/seller/login`. Deliberately **no public
 * sign-up affordance anywhere on this screen** (unlike `/seller/login`'s
 * "Apply to sell" link) — the admin surface is staff-only, provisioned
 * out-of-band, not something a visitor requests. The email/password form
 * is a mock (no real credential check, no account lookup — Auth.js +
 * real staff accounts land in M8); "continue as demo admin" is the only
 * path that actually works today, mirroring `SellerLoginClient`'s
 * "continue as demo ___" buttons. `middleware.ts` is what actually
 * redirects a signed-out visitor here; this component never redirects
 * *to* `/admin` without the user acting.
 */
export function AdminLoginClient() {
  const router = useRouter();
  const { isSignedIn, ready, role, user, signInAsAdmin, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function goToDashboard() {
    router.push("/admin");
  }

  function handleSignIn() {
    if (!email.trim().includes("@") || password.trim().length < 4) return;
    // Mock: no real credential check yet — signs in as the demo admin,
    // same as `SellerLoginClient`'s email/phone forms. See file header.
    signInAsAdmin();
    goToDashboard();
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
              disabled={!email.trim().includes("@") || password.trim().length < 4}
            >
              Sign in
            </Button>
          </div>

          <div className={styles.divider}>or</div>

          <button type="button" className={styles.demoButton} onClick={() => { signInAsAdmin(); goToDashboard(); }}>
            Continue as demo admin →
          </button>
        </Card>

        <p className={styles.footnote}>
          Real staff authentication (Auth.js sessions + role-based access
          control, audit-logged) arrives with the M8 backend — the form
          above is a mock and the &ldquo;continue as&rdquo; button signs
          you in as the one demo admin account.
        </p>
      </div>
    </div>
  );
}
