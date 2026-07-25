import clsx from "clsx";
import styles from "./ChannelBadge.module.css";
import { getChannelBadge, type ChannelKey } from "@/lib/channel";

export interface ChannelBadgeProps {
  channel: ChannelKey;
  className?: string;
}

const VARIANT_CLASS = {
  pine: styles.pine,
  "gold-dark": styles.goldDark,
  whatsapp: styles.whatsapp,
} as const;

/**
 * Channel badge — label + visual variant are sourced from
 * `getChannelBadge(channel)` (lib/channel.ts), never hardcoded per screen.
 * Three variants ported from the prototype: pine "Book online now"
 * (Marketplace/Laundry), translucent gold-on-dark "On the app · Coming
 * soon" (full meals), WhatsApp-green "Order on WhatsApp" (Snacks).
 */
export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
  const { label, variant } = getChannelBadge(channel);
  return (
    <span className={clsx(styles.badge, VARIANT_CLASS[variant], className)}>
      {label}
    </span>
  );
}
