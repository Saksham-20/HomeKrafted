/**
 * The business details every policy page needs, in one place (M18).
 *
 * **These are placeholders and the site says so.** Razorpay will not
 * activate a live account without a published refund policy and a real
 * contact address, and a policy page carrying an invented address is
 * worse than one that admits it is incomplete — it looks compliant while
 * being false, which is the failure mode that matters.
 *
 * Fill these in, and the `PLACEHOLDER` banner disappears from the pages
 * that print them (`/contact`, `/grievance-redressal`) at once. Nothing
 * else needs touching.
 *
 * See `docs/LAUNCH-READINESS.md` §4.
 */
export interface LegalEntity {
  /** Registered legal name. Not the brand — Razorpay KYC matches this. */
  legalName: string;
  /** Registered address, one line per line. */
  address: string[];
  /** The address a customer can actually reach a person at. */
  supportEmail: string;
  /** Grievance officer's mailbox, required for an Indian intermediary. */
  grievanceEmail: string;
  /**
   * The grievance officer's own name. The Consumer Protection (E-Commerce)
   * Rules ask for a *named* officer, so the company's name does not stand
   * in for it — `/contact` used to print `legalName` here, which read as
   * "the grievance officer is a private limited company".
   */
  grievanceOfficer: string;
  supportPhone: string;
  /** Support hours, in plain words. */
  supportHours: string;
  gstin?: string;
  cin?: string;
}

const PLACEHOLDER = "TO BE FILLED";

export const LEGAL_ENTITY: LegalEntity = {
  // From the client's reviewed policies (2026-09-21): "Homekrafted is
  // operated by Tics Foodworks Pvt. Ltd." Homekrafted is the brand.
  legalName: "Tics Foodworks Pvt. Ltd.",
  address: [PLACEHOLDER],
  // Every reviewed policy names info@ as the contact address.
  supportEmail: "info@homekrafted.in",
  // Not in the reviewed text (its own fill-in tag was left open). This one
  // predates it and was already on /contact; confirm the mailbox exists.
  grievanceEmail: "grievance@homekrafted.in",
  grievanceOfficer: PLACEHOLDER,
  supportPhone: PLACEHOLDER,
  supportHours: "10am – 7pm, Monday to Saturday",
};

/** True while any legally-required detail is still a placeholder. */
export function hasPlaceholders(entity: LegalEntity = LEGAL_ENTITY): boolean {
  return missingDetails(entity).length > 0;
}

/**
 * Which details are still placeholders, in the words a reader would use —
 * the banner names them, so it stops claiming the company name is missing
 * once it is not.
 */
export function missingDetails(entity: LegalEntity = LEGAL_ENTITY): string[] {
  const missing: string[] = [];
  if (isPlaceholder(entity.legalName)) missing.push("company name");
  if (entity.address.some(isPlaceholder)) missing.push("registered office address");
  if (isPlaceholder(entity.supportPhone)) missing.push("phone number");
  if (isPlaceholder(entity.grievanceOfficer)) missing.push("grievance officer");
  return missing;
}

export function isPlaceholder(value: string): boolean {
  return value === PLACEHOLDER;
}

/**
 * The date these documents last changed, shown on every page.
 *
 * Hardcoded rather than derived from a build timestamp: "last updated"
 * must mean "the terms changed", not "we deployed". A deploy-derived date
 * silently claims a change every release and makes the field meaningless.
 * Bump it by hand when the wording changes.
 */
export const POLICY_LAST_UPDATED = "20 September 2026";
