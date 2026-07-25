import clsx from "clsx";
import styles from "./QRTile.module.css";

export interface QRTileProps {
  /** 25-value (5×5) 0/1 module pattern. Defaults to the prototype's own decorative pattern. */
  pattern?: number[];
  size?: number;
  className?: string;
}

/** The prototype's exact decorative 5×5 pattern — ported verbatim. */
const DEFAULT_PATTERN = [
  1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1,
];

/** QR tile — 5×5 module-grid placeholder, ported from the Home "Get the app" panel. Swap for a real QR once the app ships. */
export function QRTile({ pattern = DEFAULT_PATTERN, size = 104, className }: QRTileProps) {
  return (
    <div
      className={clsx(styles.tile, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR code placeholder — scan to install the Homekrafted app"
    >
      <div className={styles.grid}>
        {pattern.map((value, index) => (
          <span
            key={index}
            className={clsx(styles.module, value && styles.filled)}
          />
        ))}
      </div>
    </div>
  );
}
