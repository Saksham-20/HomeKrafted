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
 * **The typed credentials are checked (M17).** Before that, this handler
 * called `signInAsAdmin()` and threw the form values away, so any email
 * and any four characters granted full admin on a publicly routable
 * page. It now runs a real `POST /auth/login` and verifies the role the
 * server returns. `middleware.ts` is what redirects a signed-out visitor
 * here; this component never redirects *to* `/admin` without the user
 * acting.
 */
export function AdminLoginClient() {
  const router = useRouter();
  const { isSignedIn, ready, busy, role, user, signInWithPassword, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function goToDashboard() {
    router.push("/admin");
  }

  /**
   * A real credential check (M17).
   *
   * Until now this screen **ignored what was typed**: any email and any
   * four characters signed the visitor in as the one seeded admin
   * account, because the handler called `signInAsAdmin()` and discarded
   * the form values. `/admin/login` is publicly routable, so that was
   * full administrative access — settling payouts, granting verification
   * badges, suspending users — to anyone who found the URL.
   *
   * It now signs in with the typed credentials and then checks the role
   * the server came back with. A non-admin who signs in here is signed
   * straight back out rather than being left holding a valid consumer
   * session on the admin login screen.
   */
  async function handleSignIn() {
    if (!email.trim().includes("@") || password.length < 8) return;
    setError(undefined);
    try {
      const resultRole = await signInWithPassword(email.trim(), password);
      if (resultRole !== "admin") {
        signOut();
        setError("That account doesn't have admin access.");
        return;
      }
      goToDashboard();
    } catch {
      // One message for "no such account" and "wrong password" alike —
      // a distinct answer would confirm which staff emails exist.
      setError("Incorrect email or password.");
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
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
          <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
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
              disabled={!email.trim().includes("@") || password.length < 8 || busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </Card>

        <p className={styles.footnote}>
          Internal staff accounts are provisioned out-of-band — there is no
          public sign-up here, and no password reset. Ask another admin.
        </p>
      </div>
    </div>
  );
}
