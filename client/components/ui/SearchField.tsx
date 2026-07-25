import type { InputHTMLAttributes } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import styles from "./SearchField.module.css";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  className?: string;
}

/** Search field — pill, leading magnifier, muted placeholder. Ported from the header search pill. */
export function SearchField({
  className,
  placeholder = "Search homemade…",
  ...rest
}: SearchFieldProps) {
  return (
    <label className={clsx(styles.field, className)}>
      <Search
        size={17}
        strokeWidth={1.7}
        aria-hidden="true"
        className={styles.icon}
      />
      <input
        type="search"
        className={styles.input}
        placeholder={placeholder}
        {...rest}
      />
    </label>
  );
}
