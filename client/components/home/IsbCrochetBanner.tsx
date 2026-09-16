import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./IsbCrochetBanner.module.css";

/**
 * ISB Mohali crochet pre-order campaign hero (owner, 2026-09-16).
 *
 * Replaces the food/gifts split hero entirely, on the owner's call — no
 * second thing competing with it for the first screenful, just this
 * banner as one clickable button into the crochet catalogue.
 * `SplitPanels` (`components/home/SplitPanels.tsx`) goes back to being
 * unused rather than deleted, the same state it was in before this
 * campaign, so reverting once the pop-up push ends is a `page.tsx` edit,
 * not a rewrite.
 *
 * The banner is the owner's own artwork (not stock, not AI-generated)
 * and already carries its own "Shop Crochet" button baked into the
 * image — so the whole graphic is one link rather than a second overlaid
 * button fighting the art for attention.
 *
 * `id="hk-hero-section"` is load-bearing: `HeaderClient`'s scroll-reveal
 * (the landing header's transparent-over-hero → solid-on-scroll flip,
 * M52/M56, `Header.module.css`'s `.landing` rules) watches for this id
 * specifically. Drop it and the header never turns solid on `/`.
 */
export function IsbCrochetBanner() {
  return (
    <Link
      href="/gifts?category=crochet"
      id="hk-hero-section"
      className={styles.banner}
      aria-label="Pre-orders now open — handmade crochet for ISB Mohali campus. Shop crochet."
    >
      <ImageSlot
        ratio="8/3"
        label="isb-crochet-preorder-banner.png"
        alt="Pre-orders now open. Handmade crochet items for ISB Mohali campus — keychains, bookmarks, flowers and more. Shop crochet."
        src="/images/site/isb-crochet-preorder-banner.png"
        sizes="100vw"
        quality={75}
        className={styles.image}
        priority
      />
    </Link>
  );
}
