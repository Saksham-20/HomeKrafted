import Link from "next/link";
import clsx from "clsx";
import { CalendarHeart } from "lucide-react";
import styles from "./OccasionList.module.css";

export interface OccasionRow {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  /** "in 12 days", "Tomorrow" — computed once on the server, never here. */
  when?: string;
  /** The nearest dated occasion inside the seasonal window. */
  soon: boolean;
  /** "NOV" and "14", split from the stored ISO date — no clock, no zone. */
  month?: string;
  day?: string;
}

/**
 * Occasions as wall-calendar pages: a ringed header carrying the month, the
 * day in large figures, the occasion's name, its one-line tagline and its
 * countdown — no photographs, the dates carry the page. An evergreen occasion has no date, so it shows a drawn calendar mark
 * under "Any day" rather than inventing one. Pointing at a page lifts it
 * and curls its corner. A plain list of links; countdown text arrives from
 * the server as a string, so nothing recomputes "today" during hydration
 * (the M12 lesson).
 */
export function OccasionList({ rows }: { rows: OccasionRow[] }) {
  return (
    <ul className={styles.wall}>
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/collections/${row.slug}`} className={styles.page}>
            <span className={styles.head}>
              <span className={styles.ring} aria-hidden="true" />
              <span className={styles.ring} aria-hidden="true" />
              <span className={styles.month}>{row.month ?? "Any day"}</span>
            </span>
            <span className={styles.body}>
              {/* An evergreen occasion has no day to print; a big initial
                  read as alphabet blocks, so it gets a drawn mark instead. */}
              {row.day ? (
                <span className={styles.day}>
                  {row.day}
                </span>
              ) : (
                <CalendarHeart className={styles.evergreen} aria-hidden="true" />
              )}
              <span className={styles.name}>{row.name}</span>
              {row.tagline ? <span className={styles.tag}>{row.tagline}</span> : null}
              <span className={clsx(styles.when, row.soon && styles.whenSoon)}>
                {row.day ? (row.when ?? "") : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
