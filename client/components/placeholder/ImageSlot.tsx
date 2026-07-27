import clsx from "clsx";
import styles from "./ImageSlot.module.css";

export type ImageSlotShape = "rect" | "square" | "circle";

export interface ImageSlotProps {
  /** CSS `aspect-ratio` value, e.g. "1/1", "1.5/1", "16/5", "4/5". */
  ratio: string;
  /** Fallback/alt label, e.g. "Mango Thokku Pickle product photo". */
  label: string;
  /** Optional export-size caption, e.g. "1200×1200". */
  size?: string;
  /** "circle" for avatars/category tiles, "square" for small thumbs. */
  shape?: ImageSlotShape;
  /** Smaller, background-less label chip — for dense thumbnail grids. */
  compact?: boolean;
  /** Real project asset path, e.g. "/images/products/mango-thokku-pickle.png". */
  src?: string;
  className?: string;
}

export function ImageSlot({
  ratio,
  label,
  size,
  shape = "rect",
  compact = false,
  src,
  className,
}: ImageSlotProps) {
  return (
    <div
      className={clsx(
        styles.slot,
        src && styles.withImage,
        shape === "circle" && styles.circle,
        shape === "square" && styles.square,
        compact && styles.compact,
        className,
      )}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={label}
    >
      {src ? (
        <img className={styles.image} src={src} alt="" aria-hidden="true" />
      ) : (
        <>
          <span className={styles.label}>{label}</span>
          {size ? <span className={styles.size}>{size}</span> : null}
        </>
      )}
    </div>
  );
}
