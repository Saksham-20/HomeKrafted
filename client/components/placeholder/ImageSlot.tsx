import clsx from "clsx";
import styles from "./ImageSlot.module.css";

export type ImageSlotShape = "rect" | "square" | "circle";

export interface ImageSlotProps {
  /** CSS `aspect-ratio` value, e.g. "1/1", "1.5/1", "16/5", "4/5". */
  ratio: string;
  /** What this slot will become, e.g. "hero_hamper.jpg — festive gift box". */
  label: string;
  /** Optional export-size caption, e.g. "1200×1200". */
  size?: string;
  /** "circle" for avatars/category tiles, "square" for small thumbs. */
  shape?: ImageSlotShape;
  /** Smaller, background-less label chip — for dense thumbnail grids. */
  compact?: boolean;
  className?: string;
}

/**
 * Labelled placeholder for imagery that doesn't exist yet — the
 * diagonal-hatch look from the prototype. Every future image slot in the
 * app should render through this component instead of a real `next/image`
 * until actual photography is supplied (brand rule: "Placeholders, not
 * fake art" — never generate stand-in photos).
 */
export function ImageSlot({
  ratio,
  label,
  size,
  shape = "rect",
  compact = false,
  className,
}: ImageSlotProps) {
  return (
    <div
      className={clsx(
        styles.slot,
        shape === "circle" && styles.circle,
        shape === "square" && styles.square,
        compact && styles.compact,
        className,
      )}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={label}
    >
      <span className={styles.label}>{label}</span>
      {size ? <span className={styles.size}>{size}</span> : null}
    </div>
  );
}
