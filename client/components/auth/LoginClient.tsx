"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./LoginClient.module.css";

type Method = "phone" | "email" | "social";

/** Minimal monochrome brand glyphs for the social buttons — text-label style (not the full-colour "G"/Apple logo), consistent with how `Button`'s WhatsApp glyph and `StoreBadges`' Apple glyph are ported: inline SVG, never a third-party icon font. */
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

/**
 * Login (M7a) — phone-OTP, email, and social sign-in, all mock: there's
 * no real credential check (Auth.js lands in M8), every path just calls
 * `useAuth().signIn()` and redirects to `/account`. Account screens are
 * built assuming the demo user is signed in (per the M7a brief), so this
 * screen exists mainly to demonstrate the three UI flows the plan calls
 * for and to give `signOut()` (Profile page) somewhere to send the
 * shopper back to.
 */
export function LoginClient() {
  const router = useRouter();
  const { isSignedIn, ready, signIn, signOut } = useAuth();

  const [method, setMethod] = useState<Method>("phone");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");

  function goToAccount() {
    router.push("/account");
  }

  function handleSendOtp() {
    if (phone.trim().length < 10) return;
    setOtpSent(true);
  }

  function handleVerifyOtp() {
    if (otp.trim().length < 4) return;
    signIn("phone");
    goToAccount();
  }

  function handleEmailContinue() {
    if (!email.trim().includes("@")) return;
    signIn("email");
    goToAccount();
  }

  function handleSocial(provider: "google" | "apple") {
    signIn(provider);
    goToAccount();
  }

  function handleDemoSignIn() {
    signIn();
    goToAccount();
  }

  if (ready && isSignedIn) {
    return (
      <section className={clsx("container", styles.page)}>
        <Card className={styles.signedInCard}>
          <span className={styles.eyebrow}>Already signed in</span>
          <h1 className={styles.title}>You&rsquo;re all set</h1>
          <p className={styles.subtitle}>
            You&rsquo;re signed in as the Homekrafted demo account.
          </p>
          <div className={styles.signedInActions}>
            <Button variant="primary" onClick={goToAccount}>
              Go to my account
            </Button>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Homekrafted</span>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>
          One account for the Marketplace, Laundry and Wallet.
        </p>
      </div>

      <Card className={styles.card}>
        <div className={styles.methodTabs} role="tablist" aria-label="Sign-in method">
          <button
            type="button"
            role="tab"
            aria-selected={method === "phone"}
            className={clsx(styles.methodTab, method === "phone" && styles.methodTabActive)}
            onClick={() => setMethod("phone")}
          >
            <Phone size={15} strokeWidth={1.7} /> Phone
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === "email"}
            className={clsx(styles.methodTab, method === "email" && styles.methodTabActive)}
            onClick={() => setMethod("email")}
          >
            <Mail size={15} strokeWidth={1.7} /> Email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === "social"}
            className={clsx(styles.methodTab, method === "social" && styles.methodTabActive)}
            onClick={() => setMethod("social")}
          >
            Social
          </button>
        </div>

        {method === "phone" && (
          <div className={styles.form}>
            {!otpSent ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Mobile number</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    className={styles.input}
                    placeholder="+91 98450 12345"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>
                <Button variant="primary" onClick={handleSendOtp} disabled={phone.trim().length < 10}>
                  Send OTP
                </Button>
              </>
            ) : (
              <>
                <p className={styles.hint}>
                  We&rsquo;ve sent a code to <strong>{phone}</strong>.
                </p>
                <label className={styles.field}>
                  <span className={styles.label}>Enter OTP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className={clsx(styles.input, styles.otpInput)}
                    placeholder="••••"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <Button variant="primary" onClick={handleVerifyOtp} disabled={otp.trim().length < 4}>
                  Verify &amp; sign in
                </Button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                  }}
                >
                  Change number
                </button>
              </>
            )}
          </div>
        )}

        {method === "email" && (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>Email address</span>
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <Button
              variant="primary"
              onClick={handleEmailContinue}
              disabled={!email.trim().includes("@")}
            >
              Continue with email
            </Button>
          </div>
        )}

        {method === "social" && (
          <div className={styles.form}>
            <button type="button" className={styles.socialButton} onClick={() => handleSocial("google")}>
              <GoogleGlyph />
              Continue with Google
            </button>
            <button type="button" className={styles.socialButton} onClick={() => handleSocial("apple")}>
              <AppleGlyph />
              Continue with Apple
            </button>
          </div>
        )}
      </Card>

      <button type="button" className={styles.demoButton} onClick={handleDemoSignIn}>
        Sign in as demo user →
      </button>
      <p className={styles.footnote}>
        Real authentication (Auth.js) arrives with the M8 backend — every
        path above signs you in as the same Homekrafted demo account.
      </p>
    </section>
  );
}
