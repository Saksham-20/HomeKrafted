"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SocialConfig } from "@/lib/api/auth";
import styles from "./SocialSignIn.module.css";

/** Minimal monochrome Apple glyph — inline SVG, never a third-party icon font, matching `StoreBadges`. */
function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.5c0-1.7.9-3 2.3-3.8-.8-1.1-2-1.8-3.5-1.9-1.5-.1-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.7 2.5 3 2.5 1.2-.1 1.7-.8 3.1-.8 1.5 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.4.5-.8.9-1.6 1.2-2.5-3.2-1.2-3.5-4.7-2.5-6.6z" />
    </svg>
  );
}

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
  /**
   * Which providers the API says are usable, with their public client ids.
   * Read server-side and passed down — see `lib/api/auth.ts#getSocialConfig`.
   */
  config: SocialConfig;
  /** Called with a verified-by-the-provider credential. The caller owns error handling and redirects. */
  onCredential: (
    provider: "google" | "apple",
    credential: { idToken: string; nonce?: string },
  ) => void;
  disabled?: boolean;
  /**
   * Verb for the accessible labels.
   *
   * `"Continue"` since M25, because the one form is both — the button
   * cannot honestly say "Sign in" when it may be about to create an
   * account.
   */
  action: "Sign in" | "Sign up" | "Continue";
};

/**
 * Google/Apple sign-in, rendered **underneath** whichever form is active on
 * `/login` and `/signup` rather than behind a third "Social" tab.
 *
 * A tab framed social as a third thing you had to go and find; the
 * convention everywhere else is that social sits below the form, under a
 * divider, always visible. It is also why this is one shared component.
 *
 * **The two buttons are deliberately not twins, and that asymmetry is not
 * a bug to fix (M27).** Google Identity Services only hands out an
 * id-token through *its own* rendered button or the One Tap overlay —
 * there is no supported way to trigger the credential flow from our
 * markup. So Google gets Google's button, sized to sit level with ours
 * and never restyled, on the same footing as the App Store and Play marks
 * in `StoreBadges`. Apple's flow is a redirect and works from a real
 * button, so Apple keeps ours. Making them match again means either
 * breaking Google's brand terms or dropping to an OAuth code flow, which
 * is a different server contract.
 *
 * **Nothing renders for a provider the API reports as off.** Config is
 * read server-side and fails closed, so an unreachable API shows no
 * social buttons rather than buttons that cannot work.
 */
export function SocialSignIn({ config, onCredential, disabled, action }: Props) {
  const googleSlot = useRef<HTMLDivElement | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const nonceRef = useRef<string>("");
  const reactId = useId();

  // Held in a ref so re-renders (the parent's `busy` flips on submit)
  // never re-run the GIS initialise effect, which would re-render the
  // button and drop the one the user is mid-click on.
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
    nonceRef.current = nonce;

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

  const handleApple = useCallback(() => {
    // Apple's redirect flow returns the id-token to a callback URL rather
    // than to a JS callback. Wiring it needs a Services ID that does not
    // exist yet, so the button stays hidden by config until it does —
    // this is here so the shape is obvious when that key lands.
    onCredentialRef.current("apple", { idToken: "", nonce: nonceRef.current });
  }, []);

  const showGoogle = Boolean(googleClientId) && !googleFailed;
  const showApple = config.apple.enabled;
  if (!showGoogle && !showApple) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.divider}>
        <span className={styles.dividerLabel}>or continue with</span>
      </div>
      <div className={styles.buttons}>
        {showGoogle && (
          <div
            className={styles.googleSlot}
            ref={googleSlot}
            id={`google-signin-${reactId}`}
            // Google's iframe owns its own accessible name; ours would
            // double-announce. `aria-busy` is the honest state while the
            // parent form is mid-submit, since we cannot disable theirs.
            aria-busy={disabled || undefined}
          />
        )}
        {showApple && (
          <button
            type="button"
            className={styles.socialButton}
            onClick={handleApple}
            disabled={disabled}
            aria-label={`${action} with Apple`}
          >
            <AppleGlyph />
            Apple
          </button>
        )}
      </div>
    </div>
  );
}
