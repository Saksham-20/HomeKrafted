/**
 * The shape of a policy document (2026-09-21).
 *
 * **The wording of every document under `lib/policies/` is the client's,
 * reviewed by them, and it is data — not copy to tidy.** Do not paraphrase,
 * merge sections or "fix" a sentence here to match how the product behaves;
 * if the two disagree, that is a decision for whoever owns the legal text,
 * and it is raised, not edited over. What the code owns is only the frame:
 * headings, lists, the links and the layout.
 *
 * Pure data, no React, no DOM — `lib/` is a two-package contract (see
 * `shared-boundary.spec.ts`), and the renderer lives in
 * `components/legal/PolicyDocument.tsx`.
 *
 * **Tokens.** Two moments in the text are not literal, because they must
 * track `lib/legal.ts` rather than be re-typed in seventeen places:
 * `{{supportEmail}}` and `{{grievanceEmail}}`. The renderer swaps them for
 * the live value (a mailto link), or for "not published yet" while the
 * value is still a placeholder — never for the client's `[INSERT …]` tag.
 */

export type PolicyGroup = "consumer" | "sellers" | "compliance";

export type PolicyBlock =
  /** A section heading. Numbering ("1. Order Cancellation") is part of the text. */
  | { kind: "h2"; text: string }
  /** One paragraph. */
  | { kind: "p"; text: string }
  /** A bulleted list. Each item is one line of the client's text. */
  | { kind: "ul"; items: readonly string[] }
  /** Short lines that belong together (a contact block), one `<br />` apart. */
  | { kind: "lines"; lines: readonly string[] }
  /** The grievance officer's details, read live from `LEGAL_ENTITY`. */
  | { kind: "officer" };

export interface PolicyDoc {
  /** Stable id — the footer, the sitemap page and the specs key on it. */
  slug: string;
  /** The public route. Changing one breaks every link anybody has shared. */
  path: string;
  /** The page's `<h1>`, as the client titled the document. */
  title: string;
  /** The link text in the footer and on the sitemap page. */
  footerLabel: string;
  /** Meta description — ours, one sentence, for search results. */
  description: string;
  /** The document's opening paragraph, set under the title. */
  lead: string;
  /** Everything after the opening paragraph, in the client's order. */
  blocks: readonly PolicyBlock[];
  group: PolicyGroup;
  /**
   * True on a page that prints the company's own details, so the "not yet
   * published" banner is shown there and only there. A cookies policy
   * carries none, and a banner saying it is incomplete would be a lie about
   * a document that is.
   */
  showsBusinessDetails?: boolean;
}

/* Builders — they keep the data files readable, and are the only thing a
   data file imports. */
export const h2 = (text: string): PolicyBlock => ({ kind: "h2", text });
export const p = (text: string): PolicyBlock => ({ kind: "p", text });
export const ul = (...items: string[]): PolicyBlock => ({ kind: "ul", items });
export const lines = (...rows: string[]): PolicyBlock => ({ kind: "lines", lines: rows });
export const officer = (): PolicyBlock => ({ kind: "officer" });
