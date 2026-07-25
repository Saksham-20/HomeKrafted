import { Fragment } from "react";
import clsx from "clsx";
import { getAnnouncementItems } from "@/lib/api";
import styles from "./AnnouncementBar.module.css";

/** Pine value-props strip. Gold mono first item, centered, wraps on mobile. */
export async function AnnouncementBar() {
  const items = await getAnnouncementItems();

  return (
    <div className={styles.bar}>
      <div className={clsx("container", styles.row)}>
        {items.map((item, index) => (
          <Fragment key={item.text}>
            {index > 0 ? <span className={styles.dot}>·</span> : null}
            <span className={clsx(styles.item, item.emphasis && styles.emphasis)}>
              {item.text}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
