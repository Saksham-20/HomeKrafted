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

      {/* The policy row. These are the links a customer looks for when
          something has gone wrong, and the ones Razorpay requires to be
          published before a live account is activated — so they live in
          the footer of every page rather than behind Support. */}
      <div className={clsx("container", styles.legal)}>
        <span>
          © {year} Homekrafted · Made with love in real homes ·{" "}
          {/* Studio credit, owner's request 2026-08-30 (linked since the
              same day). Same 24px target box as the policy links. */}
          Developed by{" "}
          <a
            className={styles.credit}
            href="https://globoniks.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Globoniks
          </a>
        </span>
        <span className={styles.legalLinks}>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Cancellation &amp; refunds</Link>
          <Link href="/contact">Contact</Link>
          {/*
            **A licence condition, not a credit we chose to give.** The
            pincode table behind the location fields is GeoNames data
            under CC-BY 4.0, which obliges a visible attribution linking
            to geonames.org on a page a visitor can reach. It is in the
            footer because that is the only element on every page.

            If `server/src/common/pincodes.json` is ever removed, remove
            this with it. While the table is in use, this link is not
            optional and must not be dropped in a tidy-up of the footer.
          */}
          <a href="https://www.geonames.org" rel="noopener noreferrer" target="_blank">
            Pincode data © GeoNames
          </a>
        </span>
      </div>
    </footer>
  );
}
