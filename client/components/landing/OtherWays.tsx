import Link from "next/link";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import styles from "./OtherWays.module.css";

export interface OtherWay {
  href: string;
  title: string;
  blurb?: string;
}

/**
 * The secondary routes in (hampers, meal plans, corporate, snacks on
 * WhatsApp) as notes stuck to the page — each a different stock and a
 * different tilt, and each straightens up when a pointer reaches it.
 */
export function OtherWays({ items }: { items: OtherWay[] }) {
  if (items.length === 0) return null;
  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-ways-title">
      <div className="container">
        <h2 id="lp-ways-title" className={styles.title}>
          Other ways in
        </h2>
        <ul className={styles.notes}>
          {items.map((item) => (
            <li key={item.href} className={styles.slot}>
              <Link href={item.href} className={styles.note}>
                <span className={styles.noteTitle}>{item.title}</span>
                {item.blurb && <span className={styles.noteBlurb}>{item.blurb}</span>}
                <ArrowUpRight className={styles.icon} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
