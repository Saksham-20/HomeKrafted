import Link from "next/link";
import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { Category } from "@/lib/types";
import styles from "./CategoryStickers.module.css";

/**
 * Every photographed category as a round sticker, in a loose cloud of
 * different sizes that the heading sits inside rather than above. Only
 * categories with a real photograph appear (M33); the rest are reached
 * through `/shop`, which the heading links to.
 */
export function CategoryStickers({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;
  return (
    <section className={clsx("lp-rise", styles.section)} aria-labelledby="lp-stickers-title">
      <div className={clsx("container", styles.cloud)}>
        <div className={styles.head}>
          <h2 id="lp-stickers-title" className={styles.title}>
            What are you in the mood for?
          </h2>
          <Link href="/shop" className={styles.all}>
            All categories →
          </Link>
        </div>
        <ul className={styles.stickers} role="list">
          {categories.map((category) => (
            <li key={category.id} className={styles.slot}>
              <Link href={`/shop?category=${category.slug}`} className={styles.sticker}>
                <ImageSlot
                  ratio="1/1"
                  shape="circle"
                  label={category.imagePlaceholder || category.name}
                  alt=""
                  src={category.imageSrc}
                  sizes="160px"
                  className={styles.photo}
                />
                <span className={styles.name}>{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
