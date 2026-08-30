import styles from "./Ticker.module.css";

/**
 * The strip under the hero — a marquee of what the platform actually is
 * (M53).
 *
 * **Every phrase is a fact the product enforces somewhere**, not a
 * slogan: listings are reviewed before they are public (M22), a kitchen
 * cooks after the order (nothing is held ready), the gifting half posts
 * India-wide while food travels the tricity (M36), and a cook keeps
 * their own storefront. Nothing here is a number, because there is no
 * number on this site anybody can substantiate yet.
 *
 * The second copy of the list is `aria-hidden` — it exists only so the
 * loop has something to slide into. The whole strip is CSS: no timer, no
 * client bundle, and it holds still under `prefers-reduced-motion`,
 * where a scrolling band of text is exactly the thing being asked about.
 */
const PHRASES = [
  "Made in a home kitchen",
  "Cooked after you order",
  "Every listing reviewed before it goes live",
  "Gifts posted anywhere in India",
  "Food delivered across the tricity",
  "The cook keeps their own storefront",
];

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <div className={styles.run} aria-hidden={hidden ? "true" : undefined}>
      {PHRASES.map((phrase) => (
        <span className={styles.item} key={phrase}>
          {phrase}
          <span className={styles.dot} aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

export function Ticker() {
  return (
    <div className={styles.ticker}>
      <div className={styles.track}>
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
