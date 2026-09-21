/**
 * The client's policy documents, and the two places that list them
 * (2026-09-21): the footer, and the sitemap page.
 *
 * One list, three readers. Each document is defined once in
 * `consumer.ts` / `sellers.ts` / `compliance.ts`; the footer columns and
 * the `/sitemap` groups below are *built from* those definitions by slug, so
 * a route cannot be renamed in one place and stay stale in the other two.
 * `policies.spec.ts` fails the build if a document is missing from either.
 *
 * **What is deliberately not here.** The client's footer and sitemap also
 * name Seller Guidelines, Seller Support, Offers, Events and a "Consumer
 * Policy" page, and supplied no content for any of them. A footer link to a
 * page that does not exist is a 404 a customer finds first, so they are
 * left out rather than stubbed; adding one is one entry in the lists below.
 */
import { CONSUMER_POLICIES } from "./consumer";
import { SELLER_POLICIES } from "./sellers";
import { COMPLIANCE_POLICIES } from "./compliance";
import type { PolicyDoc } from "./types";

export type { PolicyDoc, PolicyBlock, PolicyGroup } from "./types";

export const POLICY_DOCS: readonly PolicyDoc[] = [
  ...CONSUMER_POLICIES,
  ...SELLER_POLICIES,
  ...COMPLIANCE_POLICIES,
];

/** A document by slug. Throws on a typo — these are constants, not user input. */
export function policyBySlug(slug: string): PolicyDoc {
  const doc = POLICY_DOCS.find((candidate) => candidate.slug === slug);
  if (!doc) throw new Error(`Unknown policy document: ${slug}`);
  return doc;
}

export interface PolicyLink {
  label: string;
  href: string;
}

/** A policy as a link, labelled the way the footer labels it. */
export function policyLink(slug: string): PolicyLink {
  const doc = policyBySlug(slug);
  return { label: doc.footerLabel, href: doc.path };
}

const linksFor = (group: PolicyDoc["group"]): PolicyLink[] =>
  POLICY_DOCS.filter((doc) => doc.group === group).map((doc) => policyLink(doc.slug));

export interface PolicyColumn {
  title: string;
  links: PolicyLink[];
}

/**
 * The footer, in the client's four columns and their order. The three
 * policy columns are read straight off the documents' `group`; "Homekrafted"
 * is the company's own pages. **FAQs point at `/support`** — its chat and
 * ticket screen is the site's help page, and the old footer already called
 * that link "Help & FAQ".
 */
export const FOOTER_COLUMNS: readonly PolicyColumn[] = [
  { title: "Consumer Policy", links: linksFor("consumer") },
  {
    title: "Homekrafted",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Become a Homekrafted Entrepreneur", href: "/sell" },
      { label: "FAQs", href: "/support" },
      { label: "Sitemap", href: "/sitemap" },
    ],
  },
  { title: "Sellers", links: linksFor("sellers") },
  { title: "Compliance", links: linksFor("compliance") },
];

/**
 * `/sitemap`, grouped as the client's own sitemap was. Only destinations
 * that exist are listed — the client's "All Products", "Offers", "Events",
 * "Bakery & Desserts" and "Home Artists & Handicrafts" have no page or
 * shelf of that name here, and the shop's real doors sit under "Food" and
 * "Gifting" instead.
 */
export const SITEMAP_GROUPS: readonly PolicyColumn[] = [
  {
    title: "Main Pages",
    links: [
      { label: "Home", href: "/" },
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Become a Homekrafted Entrepreneur", href: "/sell" },
    ],
  },
  {
    title: "Food",
    links: [
      { label: "Homemade Food", href: "/shop" },
      { label: "Meal plans", href: "/meal-plans" },
      { label: "Snacks on WhatsApp", href: "/snacks" },
    ],
  },
  {
    title: "Gifting",
    links: [
      { label: "Handcrafted Gifts", href: "/gifts" },
      { label: "Gift Hampers", href: "/hamper" },
      { label: "Occasions", href: "/collections" },
      { label: "Corporate & bulk", href: "/corporate" },
    ],
  },
  {
    title: "Customer Support",
    links: [
      ...linksFor("consumer"),
      { label: "FAQs", href: "/support" },
      policyLink("grievance-redressal"),
    ],
  },
  {
    title: "Seller/Entrepreneur",
    links: [
      { label: "Become a Homekrafted Entrepreneur", href: "/sell" },
      { label: "HomeKrafter sign in", href: "/seller/login" },
      ...linksFor("sellers"),
    ],
  },
  { title: "Compliance", links: linksFor("compliance") },
];
