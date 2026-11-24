import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Blocks, Briefcase, CookingPot, Gift, Heart, House, Shirt, type LucideIcon } from "lucide-react";
import snowCap from "@/components/season/SnowCap.module.css";
import { SEASON, type SeasonRecipient } from "@/lib/season";
import styles from "./RecipientRow.module.css";

const ICONS: Record<SeasonRecipient["icon"], LucideIcon> = {
  gift: Gift,
  shirt: Shirt,
  blocks: Blocks,
  heart: Heart,
  briefcase: Briefcase,
  house: House,
};

export interface RecipientRowProps {
  title: string;
  recipients: readonly SeasonRecipient[];
  mealPlans: { title: string; cta: { label: string; href: string } };
}

/**
 * Who it is for, as six doors into `/gifts` already filtered by the
 * listing's own "Who is it for?" answer — plus the meal-plans card.
 *
 * Drawn line icons, not the mockup's rendered 3D objects: those were
 * generated pictures, and a line icon at this size says "for him" as well
 * as a photograph of a suit would.
 */
export function RecipientRow({ title, recipients, mealPlans }: RecipientRowProps) {
  return (
    <section className={clsx("container", "container-wide", styles.layout)} aria-labelledby="hp-for-title">
      <div className={styles.recipients}>
        <h2 id="hp-for-title" className={styles.title}>
          <Spark />
          {title}
          <Spark mirrored />
        </h2>
        <ul className={styles.grid}>
          {recipients.map((recipient) => {
            const Icon = ICONS[recipient.icon];
            return (
              <li key={recipient.value}>
                <Link href={`/gifts?recipient=${recipient.value}`} className={styles.door}>
                  <span className={styles.badge}>
                    <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className={styles.label}>{recipient.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <Link href={mealPlans.cta.href} className={clsx(styles.meal, SEASON.theme === "winter" && [snowCap.cap, styles.mealCapped])}>
        <span className={styles.mealTitle}>{mealPlans.title}</span>
        <span className={styles.mealCta}>
          {mealPlans.cta.label}
          <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
        </span>
        <CookingPot className={styles.mealArt} size={112} strokeWidth={1} aria-hidden="true" />
      </Link>
    </section>
  );
}

/** Three short strokes either side of the heading — the mockup's hand-drawn accent. */
function Spark({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg
      className={clsx(styles.spark, mirrored && styles.sparkMirrored)}
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 5 L10 9" />
      <path d="M3 11 H10" />
      <path d="M4 17 L10 13" />
    </svg>
  );
}
