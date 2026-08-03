"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requestPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";
import styles from "./PasswordResetClient.module.css";

/**
 * "Forgot password" (M18) — the first half of the only route back into an
 * account whose password is gone.
 *
 * **The screen never says whether the address is registered**, and that is
 * the whole design. The API answers identically either way (see
 * `AuthController.forgotPassword`), so a UI that showed "no account with
 * that email" would hand back exactly the account-existence oracle the
 * endpoint refuses to be. The confirmation is therefore phrased as a
 * conditional — "if an account exists" — and it is shown on success for a
 * typo just as readily as for a real address.
 */
export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = email.trim().includes("@");

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      // Only genuine transport/rate-limit failures reach here — a
      // non-existent account is a 200. Rate limiting is the realistic
      // case, so it gets said plainly rather than hidden behind "try
      // again".
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "We couldn't send that just now. Please try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Reset your password</h1>

      {sent ? (
        <Card className={styles.card}>
          <p className={styles.lead}>
            If an account exists for <strong>{email.trim()}</strong>, a reset
            link is on its way. It works once, and expires in an hour.
          </p>
          <p className={styles.hint}>
            Nothing arrived? Check spam, then{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setSent(false);
                setError(null);
              }}
            >
              try a different email
            </button>
            .
          </p>
          <p className={styles.hint}>
            If your account was created when your HomeKrafter application was
            approved, you may never have set a password — sign in with your
            phone number instead.
          </p>
          <Link href="/login" className={styles.backLink}>
            Back to sign in
          </Link>
        </Card>
      ) : (
        <Card className={styles.card}>
          <p className={styles.lead}>
            Enter the email on your account and we&rsquo;ll send you a link to
            set a new password.
          </p>
          <label className={styles.field}>
            <span className={styles.label}>Email address</span>
            <input
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSubmit();
              }}
            />
          </label>
          <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Link href="/login" className={styles.backLink}>
            Back to sign in
          </Link>
        </Card>
      )}
    </section>
  );
}
