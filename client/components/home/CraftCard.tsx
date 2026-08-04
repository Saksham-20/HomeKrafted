import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { MessageCircle, UtensilsCrossed } from "lucide-react";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StoreBadges } from "@/components/ui/StoreBadges";
import type { ChannelKey } from "@/lib/channel";
import styles from "./CraftCard.module.css";

export interface CraftCardProps {
  variant: "food" | "snacks";
  channel: ChannelKey;
  title: ReactNode;
  description: string;
  className?: string;
}

const ICONS = {
  food: UtensilsCrossed,
  snacks: MessageCircle,
} as const;

const CTA = {
  snacks: { label: "Browse snacks →", href: "/snacks" },
} as const;

/**
 * "One home, three crafts" service card — ported from the Home page's
 * Laundry (pine-tint, book-online) and Food Delivery (dark, app-only)
 * cards, plus the Snacks split-band card (whatsapp-tint). Channel badge +
 * label always come from `lib/channel.ts` via `<ChannelBadge>`, never
 * hardcoded per card, so the web-vs-app-vs-WhatsApp story stays correct if
 * the rules ever change.
 */
export function CraftCard({ variant, channel, title, description, className }: CraftCardProps) {
  const Icon = ICONS[variant];
  const cta = variant !== "food" ? CTA[variant] : undefined;

  return (
    <div className={clsx(styles.card, styles[variant], className)}>
      <ChannelBadge channel={channel} className={styles.badge} />
      <div className={styles.head}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={26} strokeWidth={1.6} />
        </span>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <p className={styles.description}>{description}</p>
      {cta && (
        <Link href={cta.href} className={styles.cta}>
          {cta.label}
        </Link>
      )}
      {variant === "food" && (
        <>
          <StoreBadges variant="outline" className={styles.storeBadges} />
          <p className={styles.notify}>Notify me when it launches →</p>
        </>
      )}
    </div>
  );
}
