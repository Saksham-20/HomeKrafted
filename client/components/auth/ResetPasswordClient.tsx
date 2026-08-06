"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";
import styles from "./PasswordResetClient.module.css";

/** Matches the server's `ResetPasswordDto` floor. Stated up front, not on rejection. */
const MIN_LENGTH = 8;

/**
 * "Set a new password" (M18) — the second half, reached from the emailed
 * link, which carries the token in `?token=`.
 *
 * Nothing here is signed in: the token *is* the credential, which is why
 * it is single-use and expires in an hour server-side. On success every
 * existing session is revoked (someone resetting a password is often
 * someone who thinks the account is compromised), so this screen sends
 * them to `/login` rather than pretending they are now signed in.
 */
export function ResetPasswordClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  // Set by the approval invite (`SellerInviteService`). A HomeKrafter
  // approved five minutes ago has never had a password, so "reset yours"
  // describes something that did not happen — and copy referring to a
  // credential you do not recognise is what a phishing email looks like.
  const welcome = params.get("welcome") === "1";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password === confirm;
  const valid = Boolean(token) && longEnough && matches;

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      // The server gives one message for expired / already-used / never
      // existed, on purpose — so this shows it rather than guessing which
      // of the three it was.
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't set that password. Request a new link and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <section className={styles.wrap}>
        <h1 className={styles.title}>Reset link incomplete</h1>
        <Card className={styles.card}>
          <p className={styles.lead}>
            This page needs the link from your reset email. Open that link
            directly, or request a new one.
          </p>
          <Link href="/forgot-password" className={styles.backLink}>
            Request a new link
          </Link>
        </Card>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>
        {welcome ? "Set your password" : "Set a new password"}
      </h1>

      {done ? (
        <Card className={styles.card}>
          <p className={styles.lead}>
            {welcome
              ? "Your password is set. Sign in and add your first items from the Listings tab — they go to us for approval before they appear in the shop."
              : "Your password has been updated. For safety, we signed out every device that was using the old one."}
          </p>
          <Button variant="primary" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </Card>
      ) : (
        <Card className={styles.card}>
          <label className={styles.field}>
            <span className={styles.label}>New password</span>
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
            <span className={styles.label}>Confirm new password</span>
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
            {longEnough
              ? matches || confirm.length === 0
                ? "Long enough."
                : "The two passwords don't match yet."
              : `At least ${MIN_LENGTH} characters.`}
          </p>

          <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy}>
            {busy ? "Saving…" : "Set new password"}
          </Button>

          {error && (
            <p className={styles.error} role="alert">
              {error}{" "}
              <Link href="/forgot-password" className={styles.linkButton}>
                Request a new link
              </Link>
            </p>
          )}
        </Card>
      )}
    </section>
  );
}
