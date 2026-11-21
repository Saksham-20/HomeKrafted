"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { apiErrorMessage } from "@/lib/api";
import { getSocialLinks, linkSocial, unlinkSocial, type SocialConfig } from "@/lib/api/auth";
import styles from "./ConnectedAccounts.module.css";

/**
 * "Connect Google" on the profile (2026-11-21).
 *
 * The door for an existing account that Google sign-in cannot find on its
 * own — a phone-only account, or a Gmail different from the address on
 * file. Connecting needs the live session *and* a fresh Google token, so
 * the server joins the two only when both halves are present.
 *
 * Renders nothing unless the API reports a Google client id, the same rule
 * as the sign-in page. A failed read shows Try again, never "Not
 * connected": that would offer to connect an account that may already be.
 * Disconnect is an inline two-step, the sentence before the button.
 */
export function ConnectedAccounts({ socialConfig }: { socialConfig: SocialConfig }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enabled = socialConfig.google.enabled;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getSocialLinks()
      .then((links) => {
        if (cancelled) return;
        setConnected(links.providers.includes("google"));
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  if (!enabled) return null;

  async function handleCredential(_provider: "google" | "apple", credential: { idToken: string; nonce?: string }) {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const links = await linkSocial("google", credential);
      setConnected(links.providers.includes("google"));
      setNotice("Google connected. You can now sign in with it.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't connect Google. Try again."));
    } finally {
      setWorking(false);
    }
  }

  async function handleDisconnect() {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const links = await unlinkSocial("google");
      setConnected(links.providers.includes("google"));
      setConfirming(false);
      setNotice("Google disconnected.");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't disconnect Google. Try again."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>Sign-in methods</h2>
        <p className={styles.lead}>Connect Google to sign in with one tap, alongside your phone or email.</p>
      </div>

      {loadFailed ? (
        <div className={styles.row} role="alert">
          <span className={styles.meta}>We couldn&rsquo;t check your connected accounts.</span>
          <Button variant="secondary" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : connected === null ? (
        <p className={styles.meta} role="status">
          Checking…
        </p>
      ) : connected ? (
        <div className={styles.row}>
          <span className={styles.provider}>
            Google <span className={styles.status}>Connected</span>
          </span>
          {confirming ? (
            <span className={styles.confirm}>
              <span className={styles.meta}>You won&rsquo;t be able to sign in with Google until you connect it again.</span>
              <Button variant="secondary" size="sm" onClick={handleDisconnect} disabled={working}>
                Disconnect Google
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={working}>
                Keep it
              </Button>
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          )}
        </div>
      ) : (
        <SocialSignIn
          config={socialConfig}
          onCredential={handleCredential}
          disabled={working}
          action="Continue"
          showDivider={false}
        />
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </Card>
  );
}
