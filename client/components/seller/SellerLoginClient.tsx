"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import styles from "./SellerLoginClient.module.css";

type Method = "phone" | "email";

/**
 * `/seller/login` (M10a, extended M10b) — the seller portal's own
 * sign-in, separate from the consumer `/login`. Same phone-OTP/email UI
 * shape as the consumer screen for familiarity, but the phone/email form
 * always resolves to the demo maker, and the three "continue as demo
 * ___" buttons call `signInAsSeller("maker"|"laundry"|"snack")` to pick
 * a specific one of the 3 seeded demo sellers (`lib/data/sellers.ts`) —
 * there's no real credential check or multi-seller directory yet, Auth.js
 * + real seller accounts land in M8. `middleware.ts` is what actually
 * redirects a signed-out visitor to this page; this component itself
 * never redirects *to* a gated route without the user acting (mirrors
 * `LoginClient`).
 */
export function SellerLoginClient() {
  const router = useRouter();
  const { isSignedIn, ready, role, seller, signInAsSeller, signOut } = useAuth();

  const [method, setMethod] = useState<Method>("phone");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");

  function goToDashboard() {
    router.push("/seller");
  }

  function handleSendOtp() {
    if (phone.trim().length < 10) return;
    setOtpSent(true);
  }

  function handleVerifyOtp() {
    if (otp.trim().length < 4) return;
    signInAsSeller("maker");
    goToDashboard();
  }

  function handleEmailContinue() {
    if (!email.trim().includes("@")) return;
    signInAsSeller("maker");
    goToDashboard();
  }

  function handleDemoSignIn(type: "maker" | "laundry" | "snack") {
    signInAsSeller(type);
    goToDashboard();
  }

  if (ready && isSignedIn && role === "seller" && seller) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <Card className={styles.signedInCard}>
            <span className={styles.eyebrow}>Already signed in</span>
            <h1 className={styles.title}>You&rsquo;re all set</h1>
            <p className={styles.subtitle}>
              Signed in as {seller.displayName}&rsquo;s seller account.
            </p>
            <div className={styles.signedInActions}>
              <Button variant="primary" onClick={goToDashboard}>
                Go to dashboard
              </Button>
              <Button variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.wordmark}>
            Home<span className={styles.krafted}>krafted</span>
          </span>
          <span className={styles.eyebrow}>Seller portal</span>
          <h1 className={styles.title}>Sign in to sell</h1>
          <p className={styles.subtitle}>
            Manage your listings, orders, storefront and payouts.
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
                      placeholder="+91 98765 43210"
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

          <div className={styles.divider}>or</div>

          <button
            type="button"
            className={styles.demoButton}
            onClick={() => handleDemoSignIn("maker")}
          >
            Continue as demo maker →
          </button>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => handleDemoSignIn("laundry")}
          >
            Continue as demo laundry partner →
          </button>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => handleDemoSignIn("snack")}
          >
            Continue as demo snack seller →
          </button>
        </Card>

        <p className={styles.applyRow}>
          Not a seller yet? <Link href="/sell">Apply to sell on Homekrafted</Link>
        </p>

        <p className={styles.footnote}>
          Real seller authentication (apply → admin-approved → Auth.js
          sign-in) arrives with the M8 backend — the phone/email form
          above signs you in as the demo maker account; the three
          &ldquo;continue as&rdquo; buttons pick a specific demo seller
          type (maker, laundry partner, snack seller).
        </p>
      </div>
    </div>
  );
}
