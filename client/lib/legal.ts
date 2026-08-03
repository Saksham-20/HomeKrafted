/**
 * The business details every policy page needs, in one place (M18).
 *
 * **These are placeholders and the site says so.** Razorpay will not
 * activate a live account without a published refund policy and a real
 * contact address, and a policy page carrying an invented address is
 * worse than one that admits it is incomplete — it looks compliant while
 * being false, which is the failure mode that matters.
 *
 * Fill these in, and the `PLACEHOLDER` banner disappears from every page
 * at once. Nothing else needs touching.
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
  /** Grievance officer, required for an Indian intermediary. */
  grievanceEmail: string;
  supportPhone: string;
  /** Support hours, in plain words. */
  supportHours: string;
  gstin?: string;
  cin?: string;
}

const PLACEHOLDER = "TO BE FILLED";

export const LEGAL_ENTITY: LegalEntity = {
  legalName: PLACEHOLDER,
  address: [PLACEHOLDER],
  supportEmail: "support@homekrafted.in",
  grievanceEmail: "grievance@homekrafted.in",
  supportPhone: PLACEHOLDER,
  supportHours: "10am – 7pm, Monday to Saturday",
};

/** True while any legally-required detail is still a placeholder. */
export function hasPlaceholders(entity: LegalEntity = LEGAL_ENTITY): boolean {
  return [entity.legalName, entity.supportPhone, ...entity.address].some(
    (value) => value === PLACEHOLDER,
  );
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
export const POLICY_LAST_UPDATED = "3 August 2026";
