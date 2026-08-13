import Link from "next/link";
import clsx from "clsx";
import { CraftIcon, occasionArt } from "@/components/ui/icons/CraftIcon";
import type { Occasion } from "@/lib/types";
import { countdownLabel } from "@/lib/occasions";
import styles from "./OccasionCard.module.css";

export interface OccasionCardProps {
  occasion: Occasion;
  /** Days until it falls. Omitted for evergreen occasions, which have no countdown. */
  days?: number;
  className?: string;
}

/**
 * A row on the occasion hub (M16). A whole-card link rather than the
 * home page's `OccasionTile` — the hub has room for the tagline and the
 * countdown, and those are the reason to visit it.
 *
 * `days` is passed in rather than derived here: everything time-dependent
 * is computed once by the page (CLAUDE.md — a component that recomputes
 * "today" during hydration is how React #418 happened in M12).
 *
 * The mark follows `OccasionTile` (M33) so the home row and the hub don't
 * disagree about what Diwali looks like, and falls back to the initial
 * ring for the same reason: admin-created occasions have no art.
 */
export function OccasionCard({ occasion, days, className }: OccasionCardProps) {
  const soon = days !== undefined && days <= 14;
  const art = occasionArt(occasion.slug);

  return (
    <Link href={`/collections/${occasion.slug}`} className={clsx(styles.card, className)}>
      {art ? (
        <CraftIcon art={art} size={40} className={styles.icon} />
      ) : (
        <span className={styles.ring} aria-hidden="true">
          {occasion.initial}
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.head}>
          <span className={styles.name}>{occasion.name}</span>
          {days !== undefined && (
            <span className={clsx(styles.countdown, soon && styles.soon)}>
              {countdownLabel(days)}
            </span>
          )}
        </span>
        {occasion.tagline && <span className={styles.tagline}>{occasion.tagline}</span>}
      </span>
    </Link>
  );
}
