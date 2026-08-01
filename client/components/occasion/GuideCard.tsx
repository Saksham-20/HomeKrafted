import Link from "next/link";
import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { Collection } from "@/lib/types";
import styles from "./GuideCard.module.css";

export interface GuideCardProps {
  guide: Collection;
  className?: string;
}

/**
 * A gift guide on the hub (M16). Guides became browsable in their own
 * right this milestone — before, a `Collection` only existed as the
 * curated ordering behind an occasion page, so a guide that wasn't tied
 * to an occasion had nowhere to live.
 */
export function GuideCard({ guide, className }: GuideCardProps) {
  return (
    <Link href={`/guides/${guide.slug}`} className={clsx(styles.card, className)}>
      <span className={styles.image}>
        <ImageSlot ratio="3/2" src={guide.imageSrc} label={guide.title} compact />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{guide.title}</span>
        {guide.description && <span className={styles.description}>{guide.description}</span>}
        <span className={styles.count}>
          {guide.productIds.length} pick{guide.productIds.length === 1 ? "" : "s"}
        </span>
      </span>
    </Link>
  );
}
