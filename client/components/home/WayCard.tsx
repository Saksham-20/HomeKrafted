import Link from "next/link";
import clsx from "clsx";
import { CalendarHeart, MessageCircle, Smartphone, UtensilsCrossed } from "lucide-react";
import type { WayToOrder } from "@/lib/data";
import styles from "./WayCard.module.css";

const ICONS = {
  bulk: CalendarHeart,
  food: UtensilsCrossed,
  whatsapp: MessageCircle,
  app: Smartphone,
} as const;

export interface WayCardProps {
  way: WayToOrder;
}

/**
 * One card in "Homemade, Your Way" — the four ways to order.
 *
 * Replaces the M19 two-card services grid, which was itself a repair job
 * after laundry was removed from a hard-coded three-card row. This one
 * renders from `waysToOrder`, so the next thing that goes away is a
 * deleted array entry rather than a hole in a grid.
 */
export function WayCard({ way }: WayCardProps) {
  const Icon = ICONS[way.id as keyof typeof ICONS] ?? UtensilsCrossed;
  // WhatsApp is an outbound chat link, not a route, so it must not go
  // through next/link's client-side navigation.
  const isExternal = way.ctaHref.startsWith("http");

  return (
    <article className={clsx(styles.card, styles[way.variant])}>
      <div className={styles.head}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={18} strokeWidth={1.6} />
        </span>
        <span className={styles.eyebrow}>
          <span className={styles.index}>{way.index}</span> · {way.eyebrow}
        </span>
      </div>

      <h3 className={styles.title}>{way.title}</h3>
      <p className={styles.description}>{way.description}</p>

      {isExternal ? (
        <a
          className={styles.cta}
          href={way.ctaHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {way.ctaLabel}
        </a>
      ) : (
        <Link className={styles.cta} href={way.ctaHref}>
          {way.ctaLabel}
        </Link>
      )}
    </article>
  );
}
