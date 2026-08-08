"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import { RETURN_TO_PARAM, returnToForRole, safeReturnTo } from "@/lib/auth/return-to";
import { RoleChoice, type AuthRole } from "./RoleChoice";
import { SocialSignIn } from "./SocialSignIn";
import type { UserRole } from "@/lib/types";
import styles from "./LoginClient.module.css";

type Method = "phone" | "email";

/**
 * Sign in (M8.4a real auth, reworked M8.5 to lead with a role choice).
 *
 * Both `/login` and `/signup` open on the same "I'm a shopper / I'm a
 * seller" choice (`RoleChoice`) — admin is never offered here, staying a
 * separate internal-only `/admin/login`. The **shopper** tab is unchanged
 * from M8.4a: phone-OTP, email, and social sign-in against the live
 * `server/` (`useAuth()`'s `requestOtp`/`verifyOtp`/`signInWithEmail`/
 * `signInSocial`, `lib/api/auth.ts`). The **HomeKrafter** tab is
 * new: email/password only (real accounts are approval-provisioned, not
 * self-serve — no phone-OTP/social account creation for sellers) plus
 * "continue as demo maker/laundry/snack", all now real `POST /auth/login`
 * calls rather than a local state flip, and a
 * link into the `/sell` application flow for anyone without a seller
 * account yet. `/seller/login` (M10a) now just redirects to
 * `/login?role=seller` — this screen is the single entry point for both
 * roles. Whichever account actually signs in decides the redirect
 * (`/seller` vs `/account`), not which tab was selected — see
 * `redirectForRole`.
 */
export function LoginClient() {
  const router = useRouter();
  const {
    isSignedIn,
    ready,
    role: currentRole,
    busy,
    requestOtp,
    verifyOtp,
    signInWithEmail,
    signInSocial,
    signInWithPassword,
    signOut,
  } = useAuth();

  const [authRole, setAuthRole] = useState<AuthRole>("shopper");
  // Read `?role=seller` (the old `/seller/login`'s redirect target) after
  // mount only — deciding this during the initial render would disagree
  // with the server-rendered "shopper" default and trip a hydration
  // mismatch, since `window` isn't available during SSR.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time post-mount read of the ?role= query param; kept in an effect (not a lazy useState initializer / useSearchParams) precisely to avoid an SSR↔client hydration mismatch, since window.location isn't available during SSR.
    if (params.get("role") === "seller") setAuthRole("seller");
  }, []);

  const [method, setMethod] = useState<Method>("phone");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * The signed-in account's own `role` decides where to land — not which
   * tab was used to sign in (a seller email entered while the shopper tab
   * happened to be open still lands on `/seller`, and vice versa).
   *
   * All three roles are handled explicitly. `admin` used to fall into the
   * `/account` default alongside `consumer`, which dropped an admin
   * signing in through this page onto the ordinary shopper account screen
   * instead of the admin panel.
   */
  function redirectForRole(resultRole: UserRole) {
    // `?next=` is set by the edge gate and by a session expiring
    // mid-request. It is validated (same-origin relative path only) and
    // then checked against the role — returning a shopper to a
    // `/seller/*` page would bounce off the gate and read as the sign-in
    // having failed. See `lib/auth/return-to.ts`.
    const requested = returnToForRole(
      safeReturnTo(new URLSearchParams(window.location.search).get(RETURN_TO_PARAM)),
      resultRole,
    );
    if (requested) return router.push(requested);
    if (resultRole === "seller") return router.push("/seller");
    if (resultRole === "admin") return router.push("/admin");
    return router.push("/account");
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
      const resultRole = await verifyOtp(phone.trim(), otp.trim());
      redirectForRole(resultRole);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  /**
   * The HomeKrafter tab's email path.
   *
   * Deliberately **not** `signInWithEmail`, which falls back to creating
   * a consumer account when the login fails — on this tab that turns
   * "wrong password" into an attempt to register an email that already
   * exists, and the 409 that comes back explains nothing. A HomeKrafter
   * who has never set a password gets told to use the phone tab instead,
   * which is the path their account was actually provisioned with.
   */
  async function handleSellerEmailSignIn() {
    if (!email.trim().includes("@") || password.length < 8) return;
    setError(null);
    try {
      const resultRole = await signInWithPassword(email.trim(), password);
      redirectForRole(resultRole);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(
          "We couldn't sign you in with that email and password. If your account was created when your application was approved, you don't have a password yet — sign in with your phone number instead.",
        );
        return;
      }
      setError(friendlyError(err));
    }
  }

  async function handleEmailContinue() {
    if (!email.trim().includes("@") || password.length < 8) return;
    setError(null);
    try {
      const resultRole = await signInWithEmail(email.trim(), password);
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
    const signedInAsAdmin = currentRole === "admin";
    const homeHref = signedInAsSeller ? "/seller" : signedInAsAdmin ? "/admin" : "/account";
    const homeLabel = signedInAsSeller
      ? "Go to my dashboard"
      : signedInAsAdmin
        ? "Go to the admin panel"
        : "Go to my account";

    // `?role=seller` was ignored here entirely. Somebody who followed a
    // "HomeKrafter sign in" link while a shopper account was signed in —
    // a shared computer, a HomeKrafter who also buys — was told "you're
    // all set" and offered their *shopper* account, with the surface they
    // actually asked for never mentioned and no obvious way to reach it.
    const wantsSeller = authRole === "seller";
    const wrongAccount = wantsSeller && !signedInAsSeller;

    return (
      <section className={clsx("container", styles.page)}>
        <Card className={styles.signedInCard}>
          <span className={styles.eyebrow}>Already signed in</span>
          <h1 className={styles.title}>
            {wrongAccount ? "That's a different account" : "You’re all set"}
          </h1>
          <p className={styles.subtitle}>
            {wrongAccount
              ? "You're signed in as a shopper. Sign out to use a HomeKrafter account."
              : signedInAsSeller
                ? "You're signed in to your Homekrafted HomeKrafter account."
                : signedInAsAdmin
                  ? "You're signed in to your Homekrafted admin account."
                  : // Was "the Homekrafted demo account" — shown to every real
                    // customer who ever landed here signed in. A leftover from
                    // the mock era that survived because nobody signs in twice.
                    "You're signed in to your Homekrafted account."}
          </p>
          <div className={styles.signedInActions}>
            {wrongAccount ? (
              <>
                <Button variant="primary" onClick={signOut}>
                  Sign out
                </Button>
                <Button variant="secondary" onClick={() => router.push(homeHref)}>
                  {homeLabel}
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={() => router.push(homeHref)}>
                  {homeLabel}
                </Button>
                <Button variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              </>
            )}
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
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>
          {authRole === "shopper"
            ? "One account for the shop, snacks and your wallet."
            : "Manage your listings, orders, storefront and payouts."}
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
            <div className={styles.methodTabs} role="tablist" aria-label="Sign-in method">
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
                      {busy ? "Verifying…" : "Verify & sign in"}
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
                  onClick={handleEmailContinue}
                  disabled={!email.trim().includes("@") || password.length < 8 || busy}
                >
                  {busy ? "Signing in…" : "Continue with email"}
                </Button>
                <p className={styles.forgotRow}>
                  <Link href="/forgot-password">Forgot your password?</Link>
                </p>
              </div>
            )}

            <SocialSignIn onSelect={handleSocial} disabled={busy} action="Sign in" />
          </Card>

          {error && (
            <p className={styles.hint} role="alert">
              {error}
            </p>
          )}
          <p className={styles.applyRow}>
            New here? <Link href="/signup">Create an account</Link>
          </p>
          {/* The old copy here told every visitor that social sign-in "trusts
              the browser instead of verifying a real Google/Apple token",
              which is a working exploit written on the sign-in page. The gap
              is real and tracked in `docs/LAUNCH-READINESS.md` §0.4 and in
              `SocialSignIn`'s doc comment — it does not also need publishing
              to the people best placed to use it. */}
          <p className={styles.footnote}>
            One Homekrafted account works across the shop, snacks, your wallet
            and your orders.
          </p>
        </>
      ) : (
        <>
          <Card className={styles.card}>
            <div className={styles.methodTabs} role="tablist" aria-label="Sign-in method">
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
            </div>

            {method === "phone" ? (
              <div className={styles.form}>
                <p className={styles.hint}>
                  Use the mobile number on your application. This is how an
                  approved HomeKrafter signs in for the first time.
                </p>
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
                    <Button
                      variant="primary"
                      onClick={handleVerifyOtp}
                      disabled={otp.trim().length < 4 || busy}
                    >
                      {busy ? "Verifying…" : "Verify & sign in"}
                    </Button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        setOtpSent(false);
                        setOtp("");
                        setError(null);
                      }}
                    >
                      Use a different number
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.form}>
                <p className={styles.hint}>
                  Only if you&rsquo;ve set a password. An account created by
                  approving your application doesn&rsquo;t have one yet — sign
                  in with your phone above.
                </p>
                <label className={styles.field}>
                  <span className={styles.label}>Email address</span>
                  <input
                    type="email"
                    className={styles.input}
                    placeholder="you@yourbusiness.example"
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
                  onClick={handleSellerEmailSignIn}
                  disabled={!email.trim().includes("@") || password.length < 8 || busy}
                >
                  {busy ? "Signing in…" : "Sign in to sell"}
                </Button>
                <p className={styles.forgotRow}>
                  <Link href="/forgot-password">Forgot your password?</Link>
                </p>
              </div>
            )}
          </Card>

          {error && (
            <p className={styles.hint} role="alert">
              {error}
            </p>
          )}

          <p className={styles.applyRow}>
            Not a seller yet? <Link href="/sell">Apply to sell on Homekrafted</Link>
          </p>
          <p className={styles.footnote}>
            HomeKrafter sign-in goes through the same account system as
            shoppers — there&rsquo;s no separate HomeKrafter sign-up here.
            Apply above, and once approved you&rsquo;ll sign in right on
            this page.
          </p>
        </>
      )}
    </section>
  );
}
