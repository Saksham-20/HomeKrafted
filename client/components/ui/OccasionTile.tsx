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
}

export function OccasionTile({
  occasion,
  href,
  onClick,
  className,
  showTagline = false,
}: OccasionTileProps) {
  const art = occasionArt(occasion.slug);

  const inner = (
    <>
      <div className={styles.topRow}>
        {art ? (
          <CraftIcon art={art} size={36} className={styles.icon} />
        ) : (
          <span className={styles.ring} aria-hidden="true">
            {occasion.initial}
          </span>
        )}
        <span className={styles.arrow} aria-hidden="true">
          <ArrowUpRight size={13} />
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

  if (href) {
    return (
      <Link href={href} className={clsx(styles.tile, className)}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={clsx(styles.tile, className)} onClick={onClick}>
      {inner}
    </button>
  );
}
