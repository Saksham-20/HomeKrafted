import Link from "next/link";
import { Card } from "@/components/ui/Card";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** What is not here, said plainly. "No orders in this status." */
  title: string;
  /** Why that might be, or what happens next. One or two sentences. */
  body: string;
  /**
   * The one thing worth doing about it.
   *
   * **Optional, and deliberately so.** A HomeKrafter looking at an empty
   * payouts queue can do nothing about it — earnings arrive when orders
   * are delivered — and a button there would be decoration pretending to
   * be an affordance. Where no honest action exists, the pattern is two
   * parts, not three with a filler.
   */
  action?: { href: string; label: string };
}

/**
 * The shared "there is nothing here yet" state.
 *
 * Five HomeKrafter screens each rendered a single sentence in a card —
 * `No orders in this status.`, `No reviews yet.`, `No payouts yet.` —
 * which tells somebody the screen loaded and nothing else. The version
 * `/search` has had since M15 is the one worth copying: what is missing,
 * why, and the next move.
 *
 * An empty state is the first thing a newly approved HomeKrafter sees on
 * most of these screens, so it is the platform's first chance to say what
 * happens next rather than looking broken.
 */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <Card className={styles.card}>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {action && (
        <Link href={action.href} className={styles.cta}>
          {action.label}
        </Link>
      )}
    </Card>
  );
}
