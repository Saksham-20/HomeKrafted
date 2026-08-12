"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import styles from "./PasswordResetClient.module.css";

/** Matches the server's `ChangePasswordDto` floor. Stated up front, not on rejection. */
const MIN_LENGTH = 8;

/**
 * `/set-password` — replace a password somebody else chose for you (M32).
 *
 * This is where a newly approved HomeKrafter lands after signing in with
 * the temporary password an admin read out to them. It is **not** the
 * emailed-link flow (`ResetPasswordClient`): there is no token here, the
 * visitor is already signed in, and the thing being proved is that they
 * know the credential they were given.
 *
 * The server will not answer any other route while `mustChangePassword`
 * is set, so this screen is not a suggestion — it is the only door. It
 * says so plainly rather than pretending the visitor has a choice, and it
 * explains *why*, because "you must change your password" with no reason
 * is the shape of a scam.
 *
 * On success the server revokes every other session — including one the
 * admin might have opened with the temporary password — and returns a
 * fresh pair, which `changePassword` in `AuthContext` swaps in. So this
 * screen continues into the portal rather than bouncing back to sign-in,
 * which the token flow has to do.
 */
export function SetPasswordClient() {
  const router = useRouter();
  const { ready, isSignedIn, role, user, changePassword } = useAuth();

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mustChange = user?.mustChangePassword === true;

  // Somebody who does not owe us a password has no business here — most
  // often it is the person who just set one and pressed Back. Sent on
  // rather than shown a form that would refuse them.
  useEffect(() => {
    if (!ready) return;
    if (!isSignedIn) {
      router.replace("/login");
      return;
    }
    if (!mustChange) {
      router.replace(role === "seller" ? "/seller" : role === "admin" ? "/admin" : "/account");
    }
  }, [ready, isSignedIn, mustChange, role, router]);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password === confirm;
  const different = password !== current;
  const valid = current.length > 0 && longEnough && matches && different;

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextRole = await changePassword(current, password);
      router.replace(
        nextRole === "seller" ? "/seller" : nextRole === "admin" ? "/admin" : "/account",
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't set that password. Check the one you were given and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !isSignedIn || !mustChange) {
    return (
      <section className={styles.wrap}>
        <p className={styles.lead}>One moment…</p>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Choose your password</h1>

      <Card className={styles.card}>
        <p className={styles.lead}>
          The password you signed in with was created for you, and someone at
          Homekrafted has seen it. Choose one only you know — everything else
          stays locked until you do.
        </p>

        <label className={styles.field}>
          <span className={styles.label}>The password you were given</span>
          <input
            type="password"
            className={styles.input}
            placeholder="From the email, message or phone call"
            value={current}
            autoComplete="current-password"
            onChange={(event) => setCurrent(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Your new password</span>
          <input
            type="password"
            className={styles.input}
            placeholder={`At least ${MIN_LENGTH} characters`}
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Confirm your new password</span>
          <input
            type="password"
            className={styles.input}
            placeholder="Type it again"
            value={confirm}
            autoComplete="new-password"
            onChange={(event) => setConfirm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSubmit();
            }}
          />
        </label>

        <p className={styles.rule}>
          {!longEnough
            ? `At least ${MIN_LENGTH} characters.`
            : !different
              ? "Choose something different from the one you were given."
              : matches || confirm.length === 0
                ? "Long enough."
                : "The two passwords don't match yet."}
        </p>

        <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}
