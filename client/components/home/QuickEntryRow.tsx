import Link from "next/link";
import { ArrowRight, Briefcase, Gift, MessageCircle, UtensilsCrossed } from "lucide-react";
import type { NavLink } from "@/lib/data";
import styles from "./QuickEntryRow.module.css";

export interface QuickEntryRowProps {
  items: NavLink[];
  detail: Record<string, { title: string; blurb: string }>;
}

const ICONS: Record<string, typeof Gift> = {
  "/hamper": Gift,
  "/meal-plans": UtensilsCrossed,
  "/corporate": Briefcase,
  "/snacks": MessageCircle,
};

const THEME_CLASSES: Record<string, string> = {
  "/hamper": styles.themeHamper,
  "/meal-plans": styles.themeMealPlans,
  "/corporate": styles.themeCorporate,
  "/snacks": styles.themeSnacks,
};

interface CapsuleMeta {
  tag: string;
  title: string;
  blurb: string;
  isLive?: boolean;
}

const CAPSULE_META: Record<string, CapsuleMeta> = {
  "/hamper": {
    tag: "Curated Boxes",
    title: "Gift Hampers",
    blurb: "Hand-packed by one kitchen",
  },
  "/meal-plans": {
    tag: "Daily Tiffin",
    title: "Meal Plans",
    blurb: "Fresh home lunch every day",
  },
  "/corporate": {
    tag: "Bulk & Events",
    title: "Corporate Orders",
    blurb: "Bespoke quotes by a person",
  },
  "/snacks": {
    tag: "Direct Chat",
    title: "Snacks on WhatsApp",
    blurb: "Order today's menu in 1 tap",
    isLive: true,
  },
};

export function QuickEntryRow({ items }: QuickEntryRowProps) {
  return (
    <nav className={styles.row} aria-label="Curated ways to order">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Gift;
        const themeClass = THEME_CLASSES[item.href] ?? "";
        const meta = CAPSULE_META[item.href] ?? {
          tag: "Specialty",
          title: item.label,
          blurb: "Explore collection",
        };

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.buttonCard} ${themeClass}`}
          >
            {/* Left: Sculpted Icon Medallion */}
            <div className={styles.medallion}>
              <Icon className={styles.icon} aria-hidden="true" />
            </div>

            {/* Center: Typographic Content */}
            <div className={styles.content}>
              <div className={styles.tagLine}>
                {meta.isLive && <span className={styles.liveDot} aria-hidden="true" />}
                <span className={styles.tagText}>{meta.tag}</span>
              </div>
              <h3 className={styles.title}>{meta.title}</h3>
              <p className={styles.blurb}>{meta.blurb}</p>
            </div>

            {/* Right: Tactile Arrow Pill */}
            <div className={styles.actionArrow} aria-hidden="true">
              <ArrowRight className={styles.arrowIcon} />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
