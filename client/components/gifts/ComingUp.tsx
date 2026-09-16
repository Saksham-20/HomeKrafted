import Link from "next/link";
import styles from "./ComingUp.module.css";

export interface ComingUpItem {
  id: string;
  slug: string;
  name: string;
  /** Whole days from today, computed on the server. */
  days: number;
}

export interface ComingUpProps {
  items: ComingUpItem[];
}

/**
 * The occasions close enough to shop for (G3 §5.1.4).
 *
 * **A Server Component, and the countdown is a string by the time it gets
 * here.** `lib/occasions.ts` never reads the clock — every function takes
 * `now` — so the page computes "in 14 days" once during its own render and
 * ships it as text. Deriving it in the browser instead is React #418: the
 * server's "today" and the browser's can differ by a day at a boundary,
 * and the page is `force-dynamic` precisely so "now" is the request rather
 * than the build.
 *
 * **Past festivals simply are not here.** `Occasion.celebratedOn` is an
 * absolute date, not a recurrence rule — Diwali and Rakhi land on a
 * different Gregorian date every year — so a passed one drops off until an
 * admin rolls it forward. Nothing here invents next year's date.
 */
export function ComingUp({ items }: ComingUpProps) {
  if (items.length === 0) return null;

  return (
    <section className={styles.strip} aria-labelledby="hk-coming-up">
      <h2 id="hk-coming-up" className={styles.heading}>
        Coming up
      </h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/collections/${item.slug}`} className={styles.item}>
              {/*
                No mark: `Occasion` has no icon column, and the hand-drawn
                occasion art is keyed on slug — which covers the festivals
                somebody drew and silently falls back for every occasion an
                admin adds afterwards. A name and a countdown are both real.
              */}
              <span className={styles.name}>{item.name}</span>
              <span className={styles.days}>
                {item.days === 0 ? "today" : item.days === 1 ? "tomorrow" : `in ${item.days} days`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
