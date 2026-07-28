import type { CorporateInquiry } from "@/lib/types";
import { corporateBudgetRanges, corporateOccasions } from "@/lib/data";
import { http, isMockMode } from "./http";

export async function getCorporateOccasions(): Promise<string[]> {
  return corporateOccasions;
}

export async function getCorporateBudgetRanges(): Promise<string[]> {
  return corporateBudgetRanges;
}

/** Mock-mode-only in-memory inquiry "table" — also the *only* store of inquiries in real mode, since there's still no list/review endpoint (`docs/API.md`: "seamed for M11" admin panel) — `getCorporateInquiries` below stays mock-only either way. */
const corporateInquiries: CorporateInquiry[] = [];

export interface CreateCorporateInquiryInput {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  occasion?: string;
  estimatedQuantity: number;
  budgetRange?: string;
  message: string;
}

/** Real mode: `POST /corporate-inquiries` (`@Public()` — no account needed to submit a bulk-gifting inquiry). */
export async function createCorporateInquiry(input: CreateCorporateInquiryInput): Promise<CorporateInquiry> {
  if (isMockMode()) {
    const inquiry: CorporateInquiry = {
      id: `ci-${Date.now()}`,
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      occasion: input.occasion || undefined,
      estimatedQuantity: input.estimatedQuantity,
      budgetRange: input.budgetRange || undefined,
      message: input.message,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    corporateInquiries.push(inquiry);
    return inquiry;
  }

  return http.post<CorporateInquiry>(
    "/corporate-inquiries",
    {
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      occasion: input.occasion,
      estimatedQuantity: input.estimatedQuantity,
      budgetRange: input.budgetRange,
      message: input.message,
    },
    { auth: false },
  );
}

/** Still mock-only — no list endpoint yet (seamed for M11 admin panel), so this can never reflect a real submission either way. */
export async function getCorporateInquiries(): Promise<CorporateInquiry[]> {
  return corporateInquiries;
}
