import clsx from "clsx";
import styles from "./Tag.module.css";
import type { ProductTag } from "@/lib/types";

export interface TagProps {
  label: ProductTag;
  className?: string;
}

/**
 * Product card tag — pine fill, mono uppercase. One visual style for all
 * four tag values (Bestseller / New / Festive / Curated), ported verbatim.
 */
export function Tag({ label, className }: TagProps) {
  return <span className={clsx(styles.tag, className)}>{label}</span>;
}
