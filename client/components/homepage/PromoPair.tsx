import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { SeasonPromo } from "@/lib/season";
import styles from "./PromoPair.module.css";

export interface PromoPairProps {
  promos: readonly SeasonPromo[];
}

/**
 * The two doors that say what the place is — food from someone's home,
 * gifts that feel like a hug. A picture and a short sentence each; the
 * first speaks in a solid label, the second in an outlined one, so the
 * pair reads as two voices rather than one card printed twice.
 */
export function PromoPair({ promos }: PromoPairProps) {
  return (
    <section className={clsx("container", "container-wide", styles.pair)} aria-label="Ways in">
      {promos.map((promo, index) => (
        <article key={promo.title} className={styles.card}>
          {/* Positioned so the words set the card's height and the picture
              fills it, rather than its own ratio stretching the card. */}
          <div className={styles.photoCell}>
            <ImageSlot
              ratio="4/5"
              src={promo.image}
              label={promo.eyebrow}
              alt=""
              sizes="(max-width: 560px) 100vw, (max-width: 1100px) 45vw, 300px"
              className={styles.photo}
            />
          </div>
          <div className={styles.copy}>
            <p className={clsx(styles.eyebrow, index === 1 && styles.eyebrowOutline)}>{promo.eyebrow}</p>
            <h2 className={styles.title}>{promo.title}</h2>
            <p className={styles.body}>{promo.body}</p>
            <Link href={promo.cta.href} className={styles.cta}>
              {promo.cta.label}
              <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
