import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./HeroBanner.module.css";

export interface HeroBannerProps {
  /** A committed asset under `public/images/` — recorded in `docs/IMAGE-LICENSES.md` or an owner asset. */
  src: string;
  /** Which vertical's tint the wash uses — pine for food pages, gold for gifting. */
  tint: "pine" | "gold";
}

/**
 * The long banner behind a browse hero (M59c): one photograph covering
 * the band, under a wash that stays **solid tint over the copy column**
 * and only lets the photo through on the right. That is the contrast
 * story — the text sits on exactly the tint it sat on before the photo
 * existed, so nothing here re-opens the M34 audit. Decorative by
 * construction (`aria-hidden`); the page's real heading is the copy on
 * top of it.
 */
export function HeroBanner({ src, tint }: HeroBannerProps) {
  return (
    <div className={clsx(styles.banner, tint === "gold" ? styles.gold : styles.pine)} aria-hidden="true">
      <ImageSlot
        ratio="1/1"
        label=""
        alt=""
        src={src}
        sizes="100vw"
        quality={50}
        priority
        className={styles.photo}
      />
      <div className={styles.wash} />
    </div>
  );
}
