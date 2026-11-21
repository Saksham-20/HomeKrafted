import Link from "next/link";
import clsx from "clsx";
import type { getHomePromoBands } from "@/lib/api";
import styles from "./Inserts.module.css";

type PromoBand = Awaited<ReturnType<typeof getHomePromoBands>>[number];

/**
 * The admin's two promo bands (hampers, meal plans) as two loose inserts:
 * one large and dark, one smaller and pale, laid across its corner at an
 * angle. Copy is the admin's own; a title's literal "\n" is its line
 * break.
 */
export function Inserts({ bands }: { bands: PromoBand[] }) {
  if (bands.length === 0) return null;
  return (
    <section className={clsx("lp-rise", styles.section)} aria-label="From the shop">
      <div className={clsx("container", styles.stack)}>
        {bands.slice(0, 2).map((band, index) => (
          <Link
            key={band.id}
            href={band.ctaHref}
            className={clsx(styles.insert, index === 0 ? styles.first : styles.second)}
          >
            <span className={styles.title}>
              {band.title.split("\n").map((line, lineIndex) => (
                <span key={lineIndex} className={styles.titleLine}>
                  {line}
                </span>
              ))}
            </span>
            <span className={styles.body}>{band.description}</span>
            <span className={styles.cta}>{band.ctaLabel}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
