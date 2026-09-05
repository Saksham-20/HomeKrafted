import Link from "next/link";
import styles from "./KitchenCrossLinks.module.css";

/**
 * The three food surfaces cross-linked to each other (M35, I3).
 *
 * On desktop, Meal plans and Snacks live in the quick-entry strip — which
 * only renders on the home page — so a visitor on `/shop` had no route to
 * either except the footer. The 1092px header had no room for more nav
 * items, so the answer was one quiet line on each food page naming its
 * siblings, not a wider nav.
 *
 * **It left `/shop` on 2026-09-05.** The header went two-row and Meal
 * plans is in it as "Subscription Plans", which left this rail one job
 * there — Snacks on WhatsApp — and the owner's "reduce the number of
 * elements" on the browse hero outweighed one link the footer also
 * carries. It still renders on `/snacks` and `/meal-plans`, whose visitors
 * arrived from a tile or a link and have no tab of their own to get back
 * to the other two. If Snacks ever reaches the nav, delete this component
 * rather than leaving a rail that repeats the tabs.
 *
 * Kept to the food trio on purpose: gifts and hampers are already one nav
 * click away on every page, and a rail that lists everything is a second
 * footer.
 */
const FOOD_SURFACES = [
  { href: "/shop", label: "Homemade food" },
  { href: "/snacks", label: "Snacks on WhatsApp" },
  { href: "/meal-plans", label: "Daily meal plans" },
] as const;

export interface KitchenCrossLinksProps {
  /** The surface being rendered — excluded from its own rail. */
  current: (typeof FOOD_SURFACES)[number]["href"];
}

export function KitchenCrossLinks({ current }: KitchenCrossLinksProps) {
  const others = FOOD_SURFACES.filter((s) => s.href !== current);
  return (
    <nav className={styles.rail} aria-label="More from home kitchens">
      <span className={styles.lead}>Also from home kitchens:</span>
      {others.map((surface, index) => (
        <span key={surface.href} className={styles.item}>
          {index > 0 && (
            <span className={styles.divider} aria-hidden="true">
              ·
            </span>
          )}
          <Link href={surface.href} className={styles.link}>
            {surface.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
