import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Collection, Occasion } from "@/lib/types";
import { countdownLabel } from "@/lib/occasions";
import styles from "./SeasonalBand.module.css";

export interface SeasonalBandProps {
  occasion: Occasion;
  days: number;
  /** The guide to send people to, when one exists for this occasion. */
  guide?: Collection;
  className?: string;
}

export function SeasonalBand({ occasion, days, guide, className }: SeasonalBandProps) {
  const href = guide ? `/guides/${guide.slug}` : `/collections/${occasion.slug}`;

  return (
    <Link href={href} className={clsx(styles.band, className)}>
      <div className={styles.numberWrap} aria-hidden="true">
        <span className={styles.bigNumber}>{days}</span>
        <span className={styles.daysLabel}>days</span>
      </div>

      <div className={styles.body}>
        <div className={styles.topBadge}>
          <Sparkles size={12} className={styles.badgeSparkle} aria-hidden="true" />
          <span>Upcoming Celebration</span>
        </div>
        <h3 className={styles.head}>
          {occasion.name} {countdownLabel(days).toLowerCase()}
        </h3>
        <p className={styles.detail}>
          {occasion.tagline ??
            "Home kitchens and artisans need notice for festival orders — choose early."}
        </p>
      </div>

      <div className={styles.ctaWrap} aria-hidden="true">
        <span className={styles.ctaLabel}>
          {guide ? guide.title : `Shop ${occasion.name}`}
        </span>
        <div className={styles.ctaCircle}>
          <ArrowRight size={15} />
        </div>
      </div>
    </Link>
  );
}
