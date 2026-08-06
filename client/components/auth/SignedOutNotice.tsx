"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import styles from "./SignedOutNotice.module.css";

type Props = {
  /** Small mono eyebrow above the title — the surface being gated ("Account", "Wallet"). */
  eyebrow: string;
  /** What signing in would get them, specific to this surface. */
  children: string;
};

/**
 * The "you're signed out" card shown in place of a private surface.
 *
 * Shared rather than copied because the surfaces that need it don't share
 * a layout: `/account/*` gets it from `AccountShell`, but `/wallet` is a
 * sibling route with no shell, so it had no gate at all — the audit found
 * it rendering a full wallet, "available balance ₹0" and a working-looking
 * top-up form, to visitors with no account. They could pick an amount and
 * press the button, and only then get bounced to `/login`, losing what
 * they had typed.
 *
 * Note this is a *presentation* gate, not authorization. Every value on a
 * private screen comes from an endpoint that 401s without a token; this
 * exists so a signed-out visitor sees an honest prompt instead of an empty
 * shell full of zeroes that look like their data.
 */
export function SignedOutNotice({ eyebrow, children }: Props) {
  const router = useRouter();

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>You&rsquo;re signed out</h1>
        <p className={styles.copy}>{children}</p>
        <Button variant="primary" onClick={() => router.push("/login")}>
          Sign in
        </Button>
      </div>
    </section>
  );
}
