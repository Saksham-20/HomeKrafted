"use client";

import { useEffect, useRef, useState } from "react";
import type { SocialConfig } from "@/lib/api/auth";
import styles from "./SocialSignIn.module.css";

const GIS_SRC = "https://accounts.google.com/gsi/client";

type GoogleCredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize: (opts: {
    client_id: string;
    callback: (res: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** Load the Google Identity Services script once per page, shared across mounts. */
let gisLoader: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gis-load-failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis-load-failed"));
    document.head.appendChild(script);
  }).catch((err) => {
    // Let a later mount retry rather than caching the failure forever —
    // the usual cause is a transient network blip or an ad blocker the
    // visitor may turn off.
    gisLoader = null;
    throw err;
  });

  return gisLoader;
}

type Props = {
  /** Which providers the API says are usable, with their public client ids (read server-side). */
  config: SocialConfig;
  /** Called with a provider-signed id-token. The caller owns error handling and redirects. */
  onCredential: (
    provider: "google" | "apple",
    credential: { idToken: string; nonce?: string },
  ) => void;
  disabled?: boolean;
  /** Verb for the accessible labels. */
  action: "Sign in" | "Sign up" | "Continue";
  /** The "or continue with phone or email" rule under the button — off on the profile's Connect Google card. */
  showDivider?: boolean;
};

/**
 * Google sign-in, under the form with a divider. Google only hands out an
 * id-token through its own rendered button, so it is Google's button, never
 * restyled. Renders nothing until the API reports a Google client id
 * (`docs/LAUNCH-READINESS.md` §0.4) — no button that can only fail, and no
 * placeholder-token fallback (the server verifier refuses those). Apple is
 * not offered: it needs its own redirect flow.
 */
export function SocialSignIn({ config, onCredential, disabled, action, showDivider = true }: Props) {
  const googleSlot = useRef<HTMLDivElement | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);

  // A ref, so the parent's `busy` flips never re-run the GIS effect and
  // drop the button mid-click.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  const googleClientId = config.google.enabled ? config.google.clientId : null;

  useEffect(() => {
    if (!googleClientId || !googleSlot.current) return;
    let cancelled = false;

    // One nonce per mount, echoed inside the signed token and re-checked
    // by the server, so a token captured in flight cannot be replayed
    // against a later attempt.
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    loadGis()
      .then(() => {
        const api = window.google?.accounts?.id;
        if (cancelled || !api || !googleSlot.current) return;

        api.initialize({
          client_id: googleClientId,
          nonce,
          // No One Tap: an overlay that appears unasked on a page the
          // visitor deliberately opened is a surprise, not a shortcut.
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (res) => {
            if (!res.credential) return;
            onCredentialRef.current("google", { idToken: res.credential, nonce });
          },
        });

        googleSlot.current.replaceChildren();
        api.renderButton(googleSlot.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: action === "Sign up" ? "signup_with" : "continue_with",
          logo_alignment: "center",
        });
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [googleClientId, action]);

  if (!googleClientId || googleFailed) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        <div className={styles.googleSlot} ref={googleSlot} aria-busy={disabled || undefined} />
      </div>
      {showDivider && (
        <div className={styles.divider}>
          <span className={styles.dividerLabel}>or continue with phone or email</span>
        </div>
      )}
    </div>
  );
}
