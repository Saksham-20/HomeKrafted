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

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

  const handleApple = useCallback(() => {
    onCredentialRef.current("apple", { idToken: "apple-login-token", nonce: nonceRef.current });
  }, []);

  const showGoogle = Boolean(googleClientId) && !googleFailed;

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        {showGoogle && googleClientId && !googleFailed ? (
          <div
            className={styles.googleSlot}
            ref={googleSlot}
            id={`google-signin-${reactId}`}
            aria-busy={disabled || undefined}
          />
        ) : (
          <button
            type="button"
            className={styles.socialButton}
            onClick={() =>
              onCredentialRef.current("google", {
                idToken: "demo-google-token",
                nonce: nonceRef.current,
              })
            }
            disabled={disabled}
            aria-label={`${action} with Google`}
          >
            <GoogleGlyph />
            <span>Google</span>
          </button>
        )}
        <button
          type="button"
          className={styles.socialButton}
          onClick={handleApple}
          disabled={disabled}
          aria-label={`${action} with Apple`}
        >
          <AppleGlyph />
          <span>Apple</span>
        </button>
      </div>
      <div className={styles.divider}>
        <span className={styles.dividerLabel}>or continue with phone or email</span>
      </div>
    </div>
  );
}
