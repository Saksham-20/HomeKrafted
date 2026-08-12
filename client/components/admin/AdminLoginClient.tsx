"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import { RETURN_TO_PARAM, returnToForRole, safeReturnTo } from "@/lib/auth/return-to";
import { SET_PASSWORD_PATH, sessionMustChangePassword } from "@/lib/auth/must-change-password";
import { ApiError } from "@/lib/api/http";
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
    // Same rule as the consumer form (M32): an issued password is
    // replaced before anything else, and the server refuses every other
    // route until it is, so this outranks `?next=`.
    if (sessionMustChangePassword()) {
      router.push(SET_PASSWORD_PATH);
      return;
    }
    // The gate sends `?next=` when it turns somebody away from a deep
    // admin URL. Validated and role-checked in `lib/auth/return-to.ts` —
    // this screen only ever signs in an admin, so anything same-origin
    // survives.
    const requested = returnToForRole(
      safeReturnTo(new URLSearchParams(window.location.search).get(RETURN_TO_PARAM)),
      "admin",
    );
    router.push(requested ?? "/admin");
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
    } catch (err) {
      // Only a **401** is actually a credential problem, and only that
      // gets the deliberately vague message — one answer for "no such
      // account" and "wrong password" alike, since a distinct one would
      // confirm which staff emails exist.
      //
      // Everything else used to be reported as "Incorrect email or
      // password" too, which is a lie that costs real time: a session the
      // API had already accepted (HTTP 200, verified in the access log)
      // presented as a rejected password, and the obvious next move —
      // retyping the password — could never have worked. Rate limiting
      // and a failed browser-storage write both land here.
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setError(
          `Signed in, but this browser couldn't start the session${
            err instanceof Error && err.message ? ` (${err.message})` : ""
          }. Try a private window, or clear this site's data.`,
        );
      }
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
