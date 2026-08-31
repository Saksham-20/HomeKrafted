import Link from "next/link";
import clsx from "clsx";
import { getBrandBlurb, getFooterColumns } from "@/lib/api";
import styles from "./Footer.module.css";

/**
 * Social profiles (M56, owner request). Brand marks are inline SVG per
 * the stack rule (lucide is line icons; its brand glyphs are deprecated).
 * Instagram matches the confirmed handle in `lib/data/about.ts`
 * (@_homekrafted); **Facebook and X are brand-name guesses — confirm
 * or correct them here**, the one place they live.
 */
const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://instagram.com/_homekrafted",
    path: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1.1-1.5.2-1.8.3-.4.2-.7.3-1 .6-.3.3-.5.6-.6 1-.1.3-.3.7-.3 1.8-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c.1 1.1.2 1.5.3 1.8.2.4.3.7.6 1 .3.3.6.5 1 .6.3.1.7.3 1.8.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1.1-.1 1.5-.2 1.8-.3.4-.2.7-.3 1-.6.3-.3.5-.6.6-1 .1-.3.3-.7.3-1.8.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c-.1-1.1-.2-1.5-.3-1.8-.2-.4-.3-.7-.6-1-.3-.3-.6-.5-1-.6-.3-.1-.7-.3-1.8-.3-1.3-.1-1.7-.1-4.8-.1Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 1.8a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm5.1-3.1a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/homekrafted.in",
    path: "M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.5V21h3.1Z",
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/homekrafted_in",
    path: "M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.2L5.6 21h-3l7.1-8.1L2.5 3h6.3l4.3 5.7L17.8 3Zm-1.1 16.2h1.7L7.9 4.7H6.1l10.6 14.5Z",
  },
];

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
          <div className={styles.socialRow}>
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                className={styles.socialLink}
                href={social.href}
                rel="noopener noreferrer"
                target="_blank"
                aria-label={`Homekrafted on ${social.label}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
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
