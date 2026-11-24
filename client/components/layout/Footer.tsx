import Link from "next/link";
import clsx from "clsx";
import { ArrowUpRight, Heart } from "lucide-react";
import { Snowfall } from "@/components/season/Snowfall";
import { SnowToggle } from "@/components/season/SnowToggle";
import { getFooterColumns, getFooterNav } from "@/lib/api";
import { SEASON } from "@/lib/season";
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

/**
 * The footer, as the client's seasonal mockup draws it (2026-11-24): the
 * lockup and one line, three link columns (explore, help, company), and a
 * "Stay in the loop" column. Under them, every policy document in one
 * compact row — they must stay on every page — then the legal line.
 *
 * "Stay in the loop" points at Instagram, not an email box: there is no
 * newsletter list to put an address in yet, and a form that goes nowhere
 * is worse than no form.
 *
 * While the winter season is on (`SEASON.theme`) the top edge wears a
 * snow cap with a little snow falling through it, the legal line carries
 * the snow's pause switch (the control has to be on every page the snow
 * is), and the Explore column carries the season's tab.
 */
export async function Footer() {
  const [footerNav, policyColumns] = await Promise.all([getFooterNav(), getFooterColumns()]);
  const year = new Date().getFullYear();
  const explore = SEASON.theme
    ? footerNav.map((column, index) =>
        index === 0
          ? { ...column, links: [...column.links.slice(0, 2), { label: SEASON.nav.label, href: SEASON.nav.href }, ...column.links.slice(2)] }
          : column,
      )
    : footerNav;
  // The documents only: the company links in the policy data (About,
  // Contact, FAQs…) are already in the columns above, once is enough.
  const inColumns = new Set(footerNav.flatMap((column) => column.links.map((link) => link.href)));
  const policies = policyColumns.flatMap((column) => column.links).filter((link) => !inColumns.has(link.href));

  return (
    <footer className={clsx(styles.footer, SEASON.theme && styles.seasonal)}>
      {SEASON.theme === "winter" && <Snowfall variant="footer" count={26} seed={1124} />}

      <div className={clsx("container", "container-wide", styles.top)}>
        <div className={styles.brandCol}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed vector lockup. */}
          <img src="/images/site/logo.svg" alt="Homekrafted" className={styles.logoMark} />
          <p className={styles.tagline}>
            Made with love in real homes
            <Heart size={14} strokeWidth={2} aria-hidden="true" />
          </p>
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={social.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {explore.map((column) => (
          <nav key={column.title} className={styles.col} aria-label={column.title}>
            <h2 className={styles.colTitle}>{column.title}</h2>
            {column.links.map((link) => (
              <Link key={link.href + link.label} href={link.href} className={styles.link}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}

        <div className={styles.col}>
          <h2 className={styles.colTitle}>Stay in the loop</h2>
          <p className={styles.loopText}>Seasonal edits, new kitchens and gifting ideas — first on Instagram.</p>
          <a
            className={styles.loopLink}
            href={SOCIAL_LINKS[0].href}
            rel="noopener noreferrer"
            target="_blank"
          >
            Follow @_homekrafted
            <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
            <span className="hk-sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      {/* Every policy document, once, on every page (`lib/policies`): the
          ones a customer looks for when something has gone wrong, and the
          ones Razorpay requires published before a live account. */}
      <nav className={clsx("container", "container-wide", styles.policies)} aria-label="Policies">
        {policies.map((link) => (
          <Link key={link.href} href={link.href} className={styles.policyLink}>
            {link.label}
          </Link>
        ))}
      </nav>

      <div className={clsx("container", "container-wide", styles.legal)}>
        <span>
          © {year} Homekrafted. All rights reserved ·{" "}
          {/* Studio credit, owner's request 2026-08-30. */}
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
          {SEASON.theme === "winter" && <SnowToggle tone="plain" />}
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
