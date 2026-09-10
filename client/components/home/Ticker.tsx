import styles from "./Ticker.module.css";

const PHRASES = [
  "Made in a real home kitchen",
  "Cooked freshly after you order",
  "Every maker & listing reviewed for hygiene",
  "Handcrafted gifts packed & shipped with care",
  "Fresh meals delivered right to your doorstep",
  "Independent creators keep their own storefront",
];

function SparkleIcon({ index }: { index: number }) {
  if (index % 2 === 0) {
    return (
      <svg className={styles.sparkle} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path d="M5 0L6.1 3.9L10 5L6.1 6.1L5 10L3.9 6.1L0 5L3.9 3.9Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={styles.sparkle} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M5 1L6.5 4L10 4.5L7.5 7L8 10L5 8.5L2 10L2.5 7L0 4.5L3.5 4Z" fill="currentColor" />
    </svg>
  );
}

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <div className={styles.run} aria-hidden={hidden ? "true" : undefined}>
      {PHRASES.map((phrase, i) => (
        <span className={styles.item} key={phrase}>
          <span>{phrase}</span>
          <SparkleIcon index={i} />
        </span>
      ))}
    </div>
  );
}

export function Ticker() {
  return (
    <aside className={styles.ticker} aria-label="HomeKrafted platform promises">
      <div className={styles.track}>
        <Run />
        <Run hidden />
      </div>
    </aside>
  );
}
