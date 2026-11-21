import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./PickShelf.module.css";

export interface PickItem {
  id: string;
  href: string;
  src?: string;
  name: string;
  maker: string;
  price: string;
  /** The struck-through figure, only when the listing really is reduced. */
  was?: string;
}

export const SHELF_COUNT = 4;

/** A plain grid of product cards: photo, name, maker, price. */
export function PickShelf({ items, label }: { items: PickItem[]; label: string }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {items.slice(0, SHELF_COUNT).map((item) => (
        <li key={item.id}>
          <Link href={item.href} className={styles.card}>
            <ImageSlot
              ratio="4/5"
              label={item.name}
              alt=""
              src={item.src}
              sizes="(max-width: 640px) 50vw, 25vw"
              className={styles.photo}
            />
            <span className={styles.name}>{item.name}</span>
            <span className={styles.maker}>by {item.maker}</span>
            <span className={styles.price}>
              {item.price}
              {item.was ? <s className={styles.was}>{item.was}</s> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
