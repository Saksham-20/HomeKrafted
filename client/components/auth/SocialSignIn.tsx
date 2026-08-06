"use client";

import styles from "./SocialSignIn.module.css";

/** Minimal monochrome brand glyphs — text-label style (not the full-colour "G"/Apple logo), consistent with how `Button`'s WhatsApp glyph and `StoreBadges`' Apple glyph are ported: inline SVG, never a third-party icon font. */
function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.68-.06-1.32-.17-1.95H12v3.9h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 3-4.32 3-7.47z"
      />
      <path
        fill="currentColor"
        opacity=".75"
        d="M12 22c2.7 0 4.96-.9 6.62-2.4l-3.23-2.5c-.9.6-2.04.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.58A10 10 0 0 0 12 22z"
      />
      <path
        fill="currentColor"
        opacity=".55"
        d="M6.4 13.94a6 6 0 0 1 0-3.87V7.5H3.05a10 10 0 0 0 0 9l3.35-2.56z"
      />
      <path
        fill="currentColor"
        opacity=".9"
        d="M12 6.05c1.47 0 2.8.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.35 2.57c.8-2.36 3-4.02 5.6-4.02z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.5c0-1.7.9-3 2.3-3.8-.8-1.1-2-1.8-3.5-1.9-1.5-.1-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.7 2.5 3 2.5 1.2-.1 1.7-.8 3.1-.8 1.5 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.4.5-.8.9-1.6 1.2-2.5-3.2-1.2-3.5-4.7-2.5-6.6z" />
    </svg>
  );
}

type Props = {
  /** Called with the chosen provider. The caller owns the error/redirect handling. */
  onSelect: (provider: "google" | "apple") => void;
  disabled?: boolean;
  /** Verb for the accessible labels — "Sign in" on `/login`, "Sign up" on `/signup`. */
  action: "Sign in" | "Sign up";
};

/**
 * Google/Apple sign-in, rendered **underneath** whichever form is active on
 * `/login` and `/signup` rather than behind a third "Social" tab.
 *
 * A tab framed social as a third thing you had to go and find, and hid it
 * from anyone who never clicked it; the convention everywhere else is that
 * social sits below the form, under a divider, always visible. It is also
 * why this is one shared component — the tab version had both glyphs and
 * both buttons copy-pasted into `LoginClient` and `SignupClient`, so the
 * two screens could drift.
 *
 * Note the server side of this is **not** real OAuth yet:
 * `POST /auth/social/:provider` trusts the browser instead of verifying a
 * Google/Apple id-token. See `docs/LAUNCH-READINESS.md` §0.4 — it must be
 * closed before the first real signup.
 */
export function SocialSignIn({ onSelect, disabled, action }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.divider}>
        <span className={styles.dividerLabel}>or continue with</span>
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => onSelect("google")}
          disabled={disabled}
          aria-label={`${action} with Google`}
        >
          <GoogleGlyph />
          Google
        </button>
        <button
          type="button"
          className={styles.socialButton}
          onClick={() => onSelect("apple")}
          disabled={disabled}
          aria-label={`${action} with Apple`}
        >
          <AppleGlyph />
          Apple
        </button>
      </div>
    </div>
  );
}
