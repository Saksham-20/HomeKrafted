"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import { RETURN_TO_PARAM, returnToForRole, safeReturnTo } from "@/lib/auth/return-to";
import { SET_PASSWORD_PATH, sessionMustChangePassword } from "@/lib/auth/must-change-password";
import { guessIdentifierKind, type IdentifierKind } from "@/lib/auth/identifier";
import { SocialSignIn } from "./SocialSignIn";
import type { SocialConfig } from "@/lib/api/auth";
import type { UserRole } from "@/lib/types";
import styles from "./LoginClient.module.css";

/**
 * Sign in and sign up, in one form (M25).
 *
 * **What this replaced.** Until M25 this screen was a 2×2 grid of tabs:
 * Shopper/HomeKrafter across the top, Phone/Email inside each. Four
 * screens, and the visitor had to classify themselves twice before
 * typing anything — including on the *role* axis, which they cannot
 * always answer (a HomeKrafter who also buys is both) and which the
 * server has to re-decide anyway, since the account's own `role` is what
 * picks the landing page. Now there is one box, one password, and one
 * button.
 *
 * **The field decides what it is.** `guessIdentifierKind` watches what is
 * typed and switches the label and hint between phone and email; the
 * server re-parses it properly (`server/src/auth/identifier.util.ts`) and
 * is the only thing that actually decides. The client copy is looser on
 * purpose — see its doc comment.
 *
 * **Three steps, and only one is ever shown at a time:**
 *
 * - `password` — the normal one. Identifier + password → in.
 * - `name` — reached only when the identifier is new. The server asks;
 *   the client does not guess, because guessing needs an "does this
 *   account exist" probe.
 * - `code` — the OTP route. Reached deliberately ("Use a code instead"),
 *   by a 409 (an account with no password — every approved HomeKrafter,
 *   on their first ever visit), or straight after a sign-up to confirm
 *   the contact.
 *
 * **The code route is not decoration and must not be removed.** Approval
 * mints a HomeKrafter's account without a credential, so for a real
 * kitchen signing in for the first time this is the only door — see the
 * "Auth & identity (M17)" rules in `CLAUDE.md`. What M25 changed is that
 * it is one link rather than a tab everybody has to read past.
 */

type Step = "password" | "name" | "code";

type LoginClientProps = {
  /**
   * Which social providers are usable, resolved on the server by the
   * route wrapper. Passed in rather than fetched here so the sign-in page
   * does not spend the per-IP auth throttle budget on every render — an
   * office behind one NAT would exhaust it and the only symptom would be
   * buttons that sometimes aren't there.
   */
  socialConfig: SocialConfig;
};

export function LoginClient({ socialConfig }: LoginClientProps) {
  const router = useRouter();
  const {
    isSignedIn,
    ready,
    role: currentRole,
    busy,
    continueWithPassword,
    requestOtp,
    verifyOtp,
    signInSocial,
    signOut,
  } = useAuth();

  const [step, setStep] = useState<Step>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set once a sign-up has landed, so the code step reads as "confirm" rather than "sign in". */
  const [justCreated, setJustCreated] = useState(false);

  // `?role=seller` is a copy hint only now. It used to select a whole tab;
  // keeping it as a subtitle means an old "HomeKrafter sign in" link still
  // lands somewhere that looks right, without the form behaving
  // differently — which it never should, since the account decides.
  const [sellerContext, setSellerContext] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read of ?role=; window.location isn't available during SSR, and reading it in a lazy initializer would trip a hydration mismatch.
    if (params.get("role") === "seller") setSellerContext(true);
  }, []);

  const kind: IdentifierKind | null = useMemo(
    () => guessIdentifierKind(identifier),
    [identifier],
  );

  const identifierLabel =
    kind === "email" ? "Email address" : kind === "phone" ? "Mobile number" : "Mobile number or email";

  function friendlyError(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Something went wrong — please try again.";
  }

  const [navigating, setNavigating] = useState(false);
  /** Busy for the user's purposes: a call in flight, or a navigation that has not painted yet. */
  const working = busy || navigating;

  /*
   * Pull the destination bundles down while somebody is still typing.
   *
   * Measured on the production build: after `POST /auth/continue` came
   * back in ~50ms, **~310ms of the seller sign-in was the `/seller` route
   * chunk downloading** — nothing on the network before it, nothing to do
   * but wait, and every millisecond of it inside the critical path. On
   * 4G it is worse. This screen already knows the only two places it can
   * send anybody, so it fetches both up front; by the time the password
   * is submitted the chunk is usually in cache and the navigation is a
   * render rather than a download.
   *
   * Only the sign-in screens do this. Prefetching two route trees from
   * every page would spend a visitor's bandwidth on somewhere they are
   * probably not going.
   */
  useEffect(() => {
    router.prefetch("/account");
    router.prefetch("/seller");
  }, [router]);

  /**
   * The signed-in account's own `role` decides where to land — never
   * anything the form was told. `?next=` is set by the edge gate and by a
   * session expiring mid-request; it is validated (same-origin relative
   * path only) and then checked against the role, because returning a
   * shopper to a `/seller/*` page would bounce off the gate and read as
   * the sign-in having failed. See `lib/auth/return-to.ts`.
   *
   * Once a redirect is under way the form must stay busy until the new
   * route paints. `busy` alone is not enough: it belongs to AuthContext
   * and is reset in a `finally`, which runs when the sign-in call
   * resolves — i.e. *before* the `router.push` below has committed. The
   * button therefore re-enabled itself for the frames between the
   * response landing and the next page appearing, which is both a visible
   * flicker and a real second-submit window on the slowest connections,
   * where those frames are longest. Set here rather than at each call
   * site so every route out of this screen is covered; the component
   * unmounts with the navigation, so nothing has to reset it.
   */
  function redirectForRole(resultRole: UserRole) {
    setNavigating(true);
    // A password an admin issued has to be replaced before anything else
    // (M32), and that outranks even an explicit `?next=`: the server
    // answers 403 on every other route, so honouring the return-to here
    // would land somebody on a page that cannot load. `/set-password`
    // sends them on afterwards.
    if (sessionMustChangePassword()) return router.push(SET_PASSWORD_PATH);
    const requested = returnToForRole(
      safeReturnTo(new URLSearchParams(window.location.search).get(RETURN_TO_PARAM)),
      resultRole,
    );
    if (requested) return router.push(requested);
    if (resultRole === "seller") return router.push("/seller");
    if (resultRole === "admin") return router.push("/admin");
    return router.push("/account");
  }

  const canSubmitPassword = kind !== null && password.length >= 8 && !working;

  async function handleContinue(withName?: string) {
    if (kind === null || password.length < 8) return;
    setError(null);
    setNotice(null);
    try {
      const { role, created } = await continueWithPassword({
        identifier: identifier.trim(),
        password,
        name: withName?.trim() || undefined,
      });

      if (created) {
        // Signed in already — the account is real. This step confirms the
        // contact, and says so; it is not a gate, which is why "I'll do
        // this later" is a peer of the verify button rather than fine
        // print. Verification cannot be delivered at all until the SMS and
        // email providers have keys, so blocking on it would block every
        // sign-up (`docs/LAUNCH-READINESS.md`).
        setJustCreated(true);
        setStep("code");
        setNotice(
          kind === "email"
            ? `Welcome. We've emailed a code to ${identifier.trim()} — confirming it now means we can reach you about your orders.`
            : `Welcome. We've texted a code to ${identifier.trim()} — confirming it now means we can reach you about your orders.`,
        );
        return;
      }

      redirectForRole(role);
    } catch (err) {
      if (err instanceof ApiError) {
        // The server asks for a name only when it has established the
        // identifier is new. Matched on the message prefix because the
        // error envelope derives `code` from the HTTP status alone, so
        // every 400 arrives as `BAD_REQUEST`.
        if (err.status === 400 && err.message.startsWith("NAME_REQUIRED")) {
          setStep("name");
          setNotice("Looks like you're new here — what should we call you?");
          return;
        }
        // 409: the account exists but has no password. An approved
        // HomeKrafter's first visit is exactly this.
        if (err.status === 409) {
          setStep("code");
          setJustCreated(false);
          setNotice(err.message);
          void sendCode();
          return;
        }
      }
      setError(friendlyError(err));
    }
  }

  async function sendCode() {
    if (kind === null) return;
    setError(null);
    try {
      await requestOtp(identifier.trim());
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleUseCodeInstead() {
    if (kind === null) return;
    setStep("code");
    setJustCreated(false);
    setNotice(
      kind === "email"
        ? `We'll email a code to ${identifier.trim()}.`
        : `We'll text a code to ${identifier.trim()}.`,
    );
    await sendCode();
  }

  async function handleVerify() {
    if (code.trim().length < 4) return;
    setError(null);
    try {
      const resultRole = await verifyOtp(identifier.trim(), code.trim(), name.trim() || undefined);
      redirectForRole(resultRole);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function handleSocial(
    provider: "google" | "apple",
    credential: { idToken: string; nonce?: string },
  ) {
    setError(null);
    try {
      redirectForRole(await signInSocial(provider, credential));
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function backToPassword() {
    setStep("password");
    setNotice(null);
    setError(null);
    setCode("");
  }

  /**
   * The "you're already signed in" card, shown to somebody who lands here
   * with a live session.
   *
   * **`!justCreated` is load-bearing.** A sign-up signs you in — that is
   * the point — so without it this branch fires the instant the account
   * exists and returns before the `code` step below can ever render,
   * making the whole confirm-your-contact step unreachable. Caught in
   * production testing, not by a type or a unit test, because both halves
   * are individually correct.
   */
  if (ready && isSignedIn && !justCreated) {
    const signedInAsSeller = currentRole === "seller";
    const signedInAsAdmin = currentRole === "admin";
    // **The return half of the M39 loop was here.** `redirectForRole`
    // checks this before sending anybody anywhere; this card did not, and
    // this card is the one a HomeKrafter reaches by reload, bookmark,
    // Back, or by following the sign-in wall's own button. So the guarded
    // door worked and the unguarded one next to it cycled forever.
    const owesPassword = sessionMustChangePassword();
    const homeHref = owesPassword
      ? SET_PASSWORD_PATH
      : signedInAsSeller
        ? "/seller"
        : signedInAsAdmin
          ? "/admin"
          : "/account";
    const homeLabel = owesPassword
      ? "Set my password"
      : signedInAsSeller
        ? "Go to my dashboard"
        : signedInAsAdmin
          ? "Go to the admin panel"
          : "Go to my account";

    // Somebody who followed a "HomeKrafter sign in" link while a shopper
    // account is signed in — a shared computer, a HomeKrafter who also
    // buys — used to be told "you're all set" and offered their *shopper*
    // account, with no route to the one they asked for.
    const wrongAccount = sellerContext && !signedInAsSeller;

    return (
      <section className={clsx("container", styles.page)}>
        <Card className={styles.signedInCard}>
          <span className={styles.eyebrow}>Already signed in</span>
          <h1 className={styles.title}>
            {wrongAccount
              ? "That's a different account"
              : owesPassword
                ? "One thing left"
                : "You’re all set"}
          </h1>
          <p className={styles.subtitle}>
            {wrongAccount
              ? "You're signed in as a shopper. Sign out to use a HomeKrafter account."
              : owesPassword
                ? // "You're all set" was actively false for this person: the
                  // portal refuses every request until they replace the
                  // password someone else chose for them.
                  "Choose a password of your own, and your dashboard is ready."
                : signedInAsSeller
                  ? "You're signed in to your Homekrafted HomeKrafter account."
                  : signedInAsAdmin
                    ? "You're signed in to your Homekrafted admin account."
                    : "You're signed in to your Homekrafted account."}
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
        <h1 className={styles.title}>Sign in or create an account</h1>
        <p className={styles.subtitle}>
          {sellerContext
            ? "Manage your listings, orders, storefront and payouts."
            : "One account for the shop, snacks and your wallet."}
        </p>
      </div>

      <Card className={styles.card}>
        {step === "code" ? (
          <div className={styles.form}>
            {notice && <p className={styles.hint}>{notice}</p>}
            <label className={styles.field}>
              <span className={styles.label}>Enter the code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                className={clsx(styles.input, styles.otpInput)}
                placeholder="••••••"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <Button
              variant="primary"
              onClick={handleVerify}
              disabled={code.trim().length < 4 || working}
            >
              {working ? "Checking…" : justCreated ? "Confirm" : "Verify & sign in"}
            </Button>
            <p className={styles.forgotRow}>
              <button type="button" className={styles.linkButton} onClick={sendCode} disabled={working}>
                Send it again
              </button>
            </p>
            {justCreated ? (
              // Already signed in at this point — the account exists and
              // works. Leaving is a normal thing to do, not an escape
              // hatch, so it is a plain action rather than a warning.
              <p className={styles.forgotRow}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => redirectForRole(currentRole ?? "consumer")}
                >
                  I&rsquo;ll do this later
                </button>
              </p>
            ) : (
              <p className={styles.forgotRow}>
                <button type="button" className={styles.linkButton} onClick={backToPassword}>
                  Use a password instead
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className={styles.form}>
            {notice && <p className={styles.hint}>{notice}</p>}

            <label className={styles.field}>
              <span className={styles.label}>{identifierLabel}</span>
              <input
                type="text"
                // `email` rather than `tel`: the field takes both, and
                // `tel` puts a numeric keypad in front of somebody about
                // to type an address. `email` keeps a full keyboard and
                // still offers the digits.
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className={styles.input}
                placeholder="98450 12345 or you@example.com"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setError(null);
                }}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                className={styles.input}
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
            </label>

            {step === "name" && (
              <label className={styles.field}>
                <span className={styles.label}>Your name</span>
                <input
                  type="text"
                  autoComplete="name"
                  autoFocus
                  className={styles.input}
                  placeholder="Priya Sharma"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
              </label>
            )}

            <Button
              variant="primary"
              onClick={() => handleContinue(step === "name" ? name : undefined)}
              disabled={!canSubmitPassword || (step === "name" && name.trim().length === 0)}
            >
              {working ? "One moment…" : step === "name" ? "Create my account" : "Continue"}
            </Button>

            <p className={styles.forgotRow}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleUseCodeInstead}
                disabled={kind === null || working}
              >
                Use a code instead
              </button>
            </p>
            <p className={styles.forgotRow}>
              <Link href="/forgot-password">Forgot your password?</Link>
            </p>
          </div>
        )}

        <SocialSignIn
          config={socialConfig}
          onCredential={handleSocial}
          disabled={working}
          action="Continue"
        />
      </Card>

      {error && (
        <p className={styles.hint} role="alert">
          {error}
        </p>
      )}

      <p className={styles.applyRow}>
        Want to sell your own? <Link href="/sell">Apply to become a HomeKrafter</Link>
      </p>
      <p className={styles.footnote}>
        One Homekrafted account works across the shop, snacks, your wallet and your
        orders. If you&rsquo;ve been approved to sell, sign in here with the number or
        email on your application.
      </p>
    </section>
  );
}
