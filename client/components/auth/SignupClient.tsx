"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import { RoleChoice, type AuthRole } from "./RoleChoice";
import { SocialSignIn } from "./SocialSignIn";
import type { UserRole } from "@/lib/types";
import styles from "./LoginClient.module.css";

type Method = "phone" | "email";

const SELLER_SIGNUP_STEPS = [
  "Tell us about your business — 2 minutes, no documents needed yet.",
  "Our team reviews your application (`/account/…` style approval, typically a few days).",
  "Once approved, come back here and sign in with the email you applied with — your HomeKrafter account is ready.",
];

/**
 * Create an account (M8.5) — reuses `RoleChoice` + `LoginClient.module.css`
 * so `/login`/`/signup` read as one coherent flow. **Shopper** tab is a
 * real, explicit `POST /auth/register` (`useAuth().register` — unlike
 * `LoginClient`'s login-first-then-register fallback, a duplicate email
 * here surfaces as a real error) plus the same phone-OTP/social account
 * creation `/login` offers (both already create-on-first-use server
 * side). **Seller** tab has no form at all — a real seller account is
 * only ever created by an admin approving a `/sell` application (see the
 * plan's "Seller signup → `/sell` application → admin-approved seller
 * account"), so this tab is purely informational with a CTA into that
 * flow, plus a link back to `/login?role=seller` for anyone already
 * approved.
 */
export function SignupClient() {
  const router = useRouter();
  const { isSignedIn, ready, role: currentRole, busy, requestOtp, verifyOtp, register, signInSocial, signOut } =
    useAuth();

  const [authRole, setAuthRole] = useState<AuthRole>("shopper");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time post-mount read of the ?role= query param; kept in an effect (not a lazy useState initializer / useSearchParams) precisely to avoid an SSR↔client hydration mismatch, since window.location isn't available during SSR.
    if (params.get("role") === "seller") setAuthRole("seller");
  }, []);

  const [method, setMethod] = useState<Method>("email");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function redirectForRole(resultRole: UserRole) {
    router.push(resultRole === "seller" ? "/seller" : "/account");
  }

  function friendlyError(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Something went wrong — please try again.";
  }

  async function handleSendOtp() {
    if (phone.trim().length < 10) return;
    setError(null);
    try {
      await requestOtp(phone.trim());
      setOtpSent(true);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleVerifyOtp() {
    if (otp.trim().length < 4) return;
    setError(null);
    try {
      const resultRole = await verifyOtp(phone.trim(), otp.trim(), name.trim() || undefined);
      redirectForRole(resultRole);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleCreateAccount() {
    if (!name.trim() || !email.trim().includes("@") || password.length < 8) return;
    setError(null);
    try {
      const resultRole = await register(name.trim(), email.trim(), password);
      redirectForRole(resultRole);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleSocial(provider: "google" | "apple") {
    setError(null);
    try {
      const resultRole = await signInSocial(provider);
      redirectForRole(resultRole);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (ready && isSignedIn) {
    const signedInAsSeller = currentRole === "seller";
    return (
      <section className={clsx("container", styles.page)}>
        <Card className={styles.signedInCard}>
          <span className={styles.eyebrow}>Already signed in</span>
          <h1 className={styles.title}>You&rsquo;re all set</h1>
          <p className={styles.subtitle}>
            {signedInAsSeller
              ? "You're signed in to your Homekrafted HomeKrafter account."
              : "You're signed in as the Homekrafted demo account."}
          </p>
          <div className={styles.signedInActions}>
            <Button
              variant="primary"
              onClick={() => router.push(signedInAsSeller ? "/seller" : "/account")}
            >
              {signedInAsSeller ? "Go to my dashboard" : "Go to my account"}
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
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
        <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>
          {authRole === "shopper"
            ? "One account for the shop, snacks and your wallet."
            : "Selling on Homekrafted starts with a quick application."}
        </p>
      </div>

      <RoleChoice
        value={authRole}
        onChange={(next) => {
          setAuthRole(next);
          setError(null);
        }}
        className={styles.roleChoice}
      />

      {authRole === "shopper" ? (
        <>
          <Card className={styles.card}>
            <div className={styles.methodTabs} role="tablist" aria-label="Sign-up method">
              <button
                type="button"
                role="tab"
                aria-selected={method === "email"}
                className={clsx(styles.methodTab, method === "email" && styles.methodTabActive)}
                onClick={() => {
                  setMethod("email");
                  setError(null);
                }}
              >
                <Mail size={15} strokeWidth={1.7} /> Email
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "phone"}
                className={clsx(styles.methodTab, method === "phone" && styles.methodTabActive)}
                onClick={() => {
                  setMethod("phone");
                  setError(null);
                }}
              >
                <Phone size={15} strokeWidth={1.7} /> Phone
              </button>
            </div>

            {method === "email" && (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span className={styles.label}>Full name</span>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Your name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
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
                <label className={styles.field}>
                  <span className={styles.label}>Password</span>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <Button
                  variant="primary"
                  onClick={handleCreateAccount}
                  disabled={!name.trim() || !email.trim().includes("@") || password.length < 8 || busy}
                >
                  {busy ? "Creating account…" : "Create account"}
                </Button>
              </div>
            )}

            {method === "phone" && (
              <div className={styles.form}>
                {!otpSent ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Full name (optional)</span>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="Your name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
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
                    <Button
                      variant="primary"
                      onClick={handleSendOtp}
                      disabled={phone.trim().length < 10 || busy}
                    >
                      {busy ? "Sending…" : "Send OTP"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className={styles.hint}>
                      We&rsquo;ve sent a code to <strong>{phone}</strong> — check the server
                      console (SMS delivery is stubbed until M9).
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
                    <Button variant="primary" onClick={handleVerifyOtp} disabled={otp.trim().length < 4 || busy}>
                      {busy ? "Verifying…" : "Verify & create account"}
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

            <SocialSignIn onSelect={handleSocial} disabled={busy} action="Sign up" />
          </Card>


          {error && (
            <p className={styles.hint} role="alert">
              {error}
            </p>
          )}

          <p className={styles.applyRow}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </>
      ) : (
        <>
          <Card className={styles.card}>
            <ul className={styles.sellerStepsList}>
              {SELLER_SIGNUP_STEPS.map((step) => (
                <li key={step} className={styles.sellerStep}>
                  <CheckCircle2 size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            <Button variant="primary" onClick={() => router.push("/sell")}>
              Apply to sell on Homekrafted
            </Button>
          </Card>

          <p className={styles.applyRow}>
            Already approved? <Link href="/login?role=seller">Sign in to your seller account</Link>
          </p>
          <p className={styles.footnote}>
            There&rsquo;s no self-serve HomeKrafter sign-up — every HomeKrafter
            account is set up after an application is reviewed and
            approved, so listings stay trustworthy for shoppers.
          </p>
        </>
      )}
    </section>
  );
}
