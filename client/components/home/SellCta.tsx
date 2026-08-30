import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./SellCta.module.css";

/**
 * The supply-side pitch (M53) — the half of a two-sided marketplace the
 * old home page only mentioned in the footer.
 *
 * **What it may and may not promise.** It says you keep your own
 * storefront (true — one `Vendor` per HomeKrafter, their reviews and
 * followers), that you set your own price, and that you can see the
 * payout before you list (`GET /seller/me` carries the commission rate
 * and every surface computes from it). It does **not** say "zero
 * commission": `commissionEnabled` is a business switch that is off
 * today and flipping it is a decision, not a bug fix, so a landing page
 * must not have promised otherwise on somebody's behalf.
 *
 * It also does not promise how long approval takes. A listing enters a
 * review queue a person works through (M22), and a number here would be
 * a service level nobody has agreed to.
 */
export function SellCta() {
  return (
    <section className={styles.band}>
      <div className={styles.body}>
        <span className={styles.eyebrow}>Cook, bake, or make things</span>
        <h2 className={styles.title}>
          Your kitchen is already a business. Give it a storefront.
        </h2>
        <p className={styles.blurb}>
          Homekrafted is where people in the tricity sell what they make at
          home. You keep your own page, your own reviews and your own prices —
          and you see exactly what lands in your wallet before you list a
          single thing.
        </p>
      </div>
      <div className={styles.actions}>
        <Link href="/sell" className={styles.cta}>
          Start selling
          <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
        </Link>
        <Link href="/about" className={styles.link}>
          How Homekrafted works
        </Link>
      </div>
    </section>
  );
}
