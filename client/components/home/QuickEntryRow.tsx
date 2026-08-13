import Link from "next/link";
import { ArrowUpRight, Briefcase, CalendarHeart, MessageCircle, UtensilsCrossed } from "lucide-react";
import type { NavLink } from "@/lib/data";
import styles from "./QuickEntryRow.module.css";

export interface QuickEntryRowProps {
  items: NavLink[];
  /** Title + one-line "who it's for" per href — `quickEntryDetail` in `lib/data/site.ts`. */
  detail: Record<string, { title: string; blurb: string }>;
}

/**
 * The home page's quick-entry strip (M34) — the four ways in that are not
 * a catalogue, sitting directly under the hero.
 *
 * **This exists because the desktop nav gave three of them up.** Six nav
 * links plus search plus a wallet chip plus three icons is nine targets
 * in a 1092px row, and the field that lost the fight was search, which
 * rendered as a ~32px stub on production. The three that left
 * (Occasions, Meal plans, Corporate & bulk) did not go to the footer —
 * they came here, joined by Snacks on WhatsApp, which had never been in
 * the nav at all. A tile in the first screenful that says who a thing is
 * for beats a 90px nav link that only names it, which is the shape every
 * marketplace this size converges on.
 *
 * Rules if you touch it:
 *
 * - **Four is the width.** Five wraps to a second row on desktop and
 *   turns a glance into a menu. If a fifth way in appears, something
 *   here has to earn its place against it.
 * - **The icon set is keyed by href**, so a route rename that misses this
 *   map degrades to the generic mark rather than crashing. Don't switch
 *   it to index-based.
 * - **Every tile is a link, not a `role="button"` div** — same rule as
 *   `ProductCard`: React's `onClick` on a div never fires for Enter or
 *   Space, and a link buys open-in-new-tab for free.
 */
const ICONS: Record<string, typeof CalendarHeart> = {
  "/collections": CalendarHeart,
  "/meal-plans": UtensilsCrossed,
  "/corporate": Briefcase,
  "/snacks": MessageCircle,
};

export function QuickEntryRow({ items, detail }: QuickEntryRowProps) {
  // "Ways to order" rather than "More ways to order": the drawer's second
  // group uses that name, and two landmarks sharing one accessible name
  // is a landmark list a screen-reader user cannot tell apart.
  return (
    <nav className={styles.row} aria-label="Ways to order">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? ArrowUpRight;
        const copy = detail[item.href];
        return (
          <Link key={item.href} href={item.href} className={styles.tile}>
            <span className={styles.iconWrap}>
              <Icon className={styles.icon} aria-hidden="true" />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{copy?.title ?? item.label}</span>
              {copy ? <span className={styles.blurb}>{copy.blurb}</span> : null}
            </span>
            <ArrowUpRight className={styles.arrow} aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
