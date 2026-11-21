import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CraftIcon, occasionArt } from "@/components/ui/icons/CraftIcon";
import type { Occasion } from "@/lib/types";
import styles from "./OccasionTile.module.css";

export interface OccasionTileProps {
  occasion: Occasion;
  href?: string;
  onClick?: () => void;
  className?: string;
  showTagline?: boolean;
  /**
   * The one oversized tile in a band — DESIGN.md's "editorial scale
   * contrast" rule ("one oversized hero card/tile per band; never a
   * uniform grid wall"), applied to the occasion grid (2026-09-22). Bigger
   * mark, bigger label; the caller also spans it across more grid cells.
   */
  featured?: boolean;
}

export function OccasionTile({
  occasion,
  href,
  onClick,
  className,
  showTagline = false,
  featured = false,
}: OccasionTileProps) {
  const art = occasionArt(occasion.slug);

  const inner = (
    <>
      <div className={styles.topRow}>
        {art ? (
          <CraftIcon art={art} size={featured ? 60 : 36} className={styles.icon} />
        ) : (
          <span className={clsx(styles.ring, featured && styles.ringFeatured)} aria-hidden="true">
            {occasion.initial}
          </span>
        )}
        <span className={styles.arrow} aria-hidden="true">
          <ArrowUpRight size={featured ? 16 : 13} />
        </span>
      </div>
      <div className={styles.meta}>
        <span className={styles.label}>{occasion.name}</span>
        {showTagline && occasion.tagline && (
          <span className={styles.tagline}>{occasion.tagline}</span>
        )}
      </div>
    </>
  );

  const tileClassName = clsx(styles.tile, featured && styles.featured, className);

  if (href) {
    return (
      <Link href={href} className={tileClassName}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={tileClassName} onClick={onClick}>
      {inner}
    </button>
  );
}
