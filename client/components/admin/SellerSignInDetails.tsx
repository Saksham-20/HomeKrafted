"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/http";
import { issueSellerTemporaryPassword } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { SellerSignInState } from "@/lib/types";
import styles from "./SellerSignInDetails.module.css";

export interface SellerSignInDetailsProps {
  sellerId: string;
  signIn: SellerSignInState;
}

/**
 * The sign-in details for one approved HomeKrafter, shown until they use
 * them (M32).
 *
 * This exists because the invite email reaches nobody: SendGrid and
 * Twilio are unset in production, so the welcome link degrades to a line
 * in the server log and the only working onboarding channel is an admin
 * with a phone. A 200-character link cannot be read down a phone; four
 * groups of four characters can.
 *
 * **Why the password is still on screen days later.** It is stored in the
 * clear precisely so it can be read out again — the onboarding call
 * rarely happens the moment approval does. The exception is bounded by
 * the account's own progress rather than by a timer: the server clears
 * the column the instant its owner sets a password of their own, so this
 * panel stops showing one at exactly the moment it stops being true.
 * That is also what makes the `onboarded` state trustworthy — it is not a
 * flag somebody remembered to set, it is the absence of a credential.
 */
export function SellerSignInDetails({ sellerId, signIn }: SellerSignInDetailsProps) {
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The freshly issued one wins: this component does not refetch, so
  // after "Create another" the row's copy is a render behind.
  const password = issued ?? signIn.temporaryPassword;
  const onboarded = signIn.status === "onboarded" && !issued;

  async function reissue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const details = await issueSellerTemporaryPassword(sellerId);
      setIssued(details.temporaryPassword);
    } catch (err) {
      // A refusal is informative, not noise: "suspended" is something the
      // admin can act on.
      setError(
        err instanceof ApiError ? err.message : "Couldn't create sign-in details. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(
        `Homekrafted sign-in\n` +
          `Username: ${signIn.username ?? ""}\n` +
          `Temporary password: ${password}\n` +
          `You'll be asked to choose your own password when you sign in.`,
      );
      setCopied(true);
    } catch {
      // Clipboard access can be refused (permissions, insecure origin).
      // The password is on screen and selectable, so this is a
      // convenience that failed rather than a failure.
      setCopied(false);
    }
  }

  if (onboarded) {
    return (
      <div className={styles.panel}>
        <p className={styles.lead}>
          <strong>Signed in and set up.</strong> They chose their own password
          {signIn.claimedAt ? ` on ${formatDate(signIn.claimedAt)}` : ""}, so the
          temporary one is gone — we no longer hold anything that opens this
          account.
        </p>
        <p className={styles.note}>
          If they are locked out, create new sign-in details below. That replaces
          their password, so only do it when they have asked.
        </p>
        <Button variant="ghost-gold" size="sm" onClick={reissue} disabled={busy}>
          {busy ? "Creating…" : "Create new sign-in details"}
        </Button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.credentials} role="status">
        <p className={styles.lead}>
          Read these out to them. They stay here until they sign in and choose
          their own password.
        </p>
        <dl className={styles.list}>
          <div className={styles.pair}>
            <dt className={styles.key}>Username</dt>
            <dd className={styles.value}>{signIn.username ?? "—"}</dd>
          </div>
          <div className={styles.pair}>
            <dt className={styles.key}>Password</dt>
            <dd className={styles.secret}>{password ?? "—"}</dd>
          </div>
        </dl>
        <p className={styles.note}>
          They will be asked to choose their own password the moment they sign
          in, and nothing else on the site works until they do.
          {signIn.issuedAt ? ` Issued ${formatDate(signIn.issuedAt)}.` : ""}
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={copy} disabled={!password}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost-gold" size="sm" onClick={reissue} disabled={busy}>
            {busy ? "Creating…" : "Create another"}
          </Button>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
