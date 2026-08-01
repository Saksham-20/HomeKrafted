import Link from "next/link";
import clsx from "clsx";
import { CalendarDays } from "lucide-react";
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

/**
 * The home page's seasonal hook (M16, H8).
 *
 * Rendered only when the nearest dated occasion is inside
 * `SEASONAL_BANNER_DAYS` — a band that is always on screen is furniture,
 * and nobody reads furniture. `days` arrives already computed from the
 * page, so nothing here reads the clock (CLAUDE.md's rule about
 * time-dependent values and hydration).
 *
 * The link goes to the occasion's edit rather than `/shop?occasion=`,
 * because the point of a countdown is "here is what to send", not "here
 * is a filter you can now apply yourself".
 */
export function SeasonalBand({ occasion, days, guide, className }: SeasonalBandProps) {
  const href = guide ? `/guides/${guide.slug}` : `/collections/${occasion.slug}`;

  return (
    <Link href={href} className={clsx(styles.band, className)}>
      <span className={styles.icon} aria-hidden="true">
        <CalendarDays size={18} />
      </span>
      <span className={styles.body}>
        <span className={styles.head}>
          {occasion.name} {countdownLabel(days).toLowerCase()}
        </span>
        <span className={styles.detail}>
          {occasion.tagline ??
            "Home kitchens need notice for festival orders — worth choosing early."}
        </span>
      </span>
      <span className={styles.cta} aria-hidden="true">
        {guide ? guide.title : `Shop ${occasion.name}`} →
      </span>
    </Link>
  );
}
