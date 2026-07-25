/**
 * Corporate/bulk gifting inquiry form content — occasion and budget
 * options for the `/corporate` form's selects. Not domain entities, so
 * these stay plain string lists rather than growing their own types.
 */

export const corporateOccasions: string[] = [
  "Diwali",
  "New Year",
  "Employee onboarding",
  "Work anniversary",
  "Client gifting",
  "Other",
];

export const corporateBudgetRanges: string[] = [
  "Under ₹25,000",
  "₹25,000 – ₹1,00,000",
  "₹1,00,000 – ₹5,00,000",
  "Above ₹5,00,000",
];
