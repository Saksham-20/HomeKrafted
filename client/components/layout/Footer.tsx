import Link from "next/link";
import clsx from "clsx";
import { getBrandBlurb, getFooterColumns } from "@/lib/api";
import styles from "./Footer.module.css";

/** Pine-deep footer: brand blurb + 3 mock link columns + mono legal row. */
export async function Footer() {
  const [brandBlurb, footerColumns] = await Promise.all([
    getBrandBlurb(),
    getFooterColumns(),
  ]);
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={clsx("container", styles.top)}>
        <div className={styles.brandCol}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
          <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
          <p className={styles.blurb}>{brandBlurb}</p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title} className={styles.col}>
            <div className={styles.colTitle}>{column.title}</div>
            {column.links.map((link) => (
              <Link key={link.href + link.label} href={link.href} className={styles.link}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className={clsx("container", styles.legal)}>
        <span>© {year} Homekrafted · Made with love in real homes</span>
        <span>Login · Address book · Wallet · Support</span>
      </div>
    </footer>
  );
}
