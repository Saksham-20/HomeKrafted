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
 * The sign-in details panel for one approved HomeKrafter (M32; show-once
 * since M37).
 *
 * This exists because the invite email reaches nobody: SendGrid and
 * Twilio are unset in production, so the welcome link degrades to a line
 * in the server log and the only working onboarding channel is an admin
 * with a phone. A 200-character link cannot be read down a phone; four
 * groups of four characters can.
 *
 * **The password is shown exactly once — in the response of the call that
 * created it.** Nothing stores the plaintext, so this panel can only ever
 * show a password it just minted (`issued` state below). A password that
 * wasn't written down is not recoverable; "Re-issue" mints a fresh one and
 * kills the old, which is the intended remedy, not a workaround.
 *
 * **It is never rendered for a HomeKrafter who has signed in.** The row
 * drops the control at that point, so there is no "create a new password
 * for an account already in use" path here at all — a locked-out kitchen
 * is helped with "Resend invite", which sends a link to them instead of
 * handing a working credential to whoever is looking at the screen.
 */
export function SellerSignInDetails({ sellerId, signIn }: SellerSignInDetailsProps) {
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Only a password this session just minted is ever displayable — the
  // server stores a hash and nothing else (M37).
  const password = issued;
  const noCredentials = signIn.status === "no_credentials" && !issued;

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

  if (noCredentials) {
    return (
      <div className={styles.panel}>
        <p className={styles.lead}>
          <strong>No way in yet.</strong> This account has no password, so
          nothing an admin can read out will open it. Every HomeKrafter
          approved before sign-in details existed is in this state — they were
          approved, and then nobody could hand them anything.
        </p>
        <p className={styles.note}>
          Creating details below gives them a temporary password to use once.
          They choose their own the moment they sign in.
        </p>
        <Button variant="ghost-gold" size="sm" onClick={reissue} disabled={busy}>
          {busy ? "Creating…" : "Create sign-in details"}
        </Button>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!password) {
    // Awaiting, and the plaintext is gone with the response that minted
    // it. The row can say when it was issued, never what it was.
    return (
      <div className={styles.panel}>
        <p className={styles.lead}>
          <strong>
            Issued{signIn.issuedAt ? ` ${formatDate(signIn.issuedAt)}` : ""}, not
            yet used.
          </strong>{" "}
          The password was shown once, when it was created. If it wasn&apos;t
          written down, re-issue — the old one stops working the moment a new
          one exists.
        </p>
        <Button variant="ghost-gold" size="sm" onClick={reissue} disabled={busy}>
          {busy ? "Creating…" : "Re-issue sign-in details"}
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
          Read these out to them now — the password is shown only this once.
        </p>
        <dl className={styles.list}>
          <div className={styles.pair}>
            <dt className={styles.key}>Username</dt>
            <dd className={styles.value}>{signIn.username ?? "—"}</dd>
          </div>
          <div className={styles.pair}>
            <dt className={styles.key}>Password</dt>
            <dd className={styles.secret}>{password}</dd>
          </div>
        </dl>
        <p className={styles.note}>
          They will be asked to choose their own password the moment they sign
          in, and nothing else on the site works until they do. Leaving this
          page loses the password; re-issuing mints a fresh one.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={copy} disabled={!password}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost-gold" size="sm" onClick={reissue} disabled={busy}>
            {busy ? "Creating…" : "Re-issue"}
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
