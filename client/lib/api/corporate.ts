import type { CorporateInquiry } from "@/lib/types";
import { corporateBudgetRanges, corporateOccasions } from "@/lib/data";

export async function getCorporateOccasions(): Promise<string[]> {
  return corporateOccasions;
}

export async function getCorporateBudgetRanges(): Promise<string[]> {
  return corporateBudgetRanges;
}

/** In-memory mock inquiry "table" — same session-scoped pattern as `lib/api/support.ts`'s `supportTickets`. */
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

/**
 * Mock bulk-gifting inquiry mutation. Swap for a real `POST
 * /api/corporate-inquiries` call in M8 without changing the call site
 * (`CorporateInquiryClient`).
 */
export async function createCorporateInquiry(input: CreateCorporateInquiryInput): Promise<CorporateInquiry> {
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

export async function getCorporateInquiries(): Promise<CorporateInquiry[]> {
  return corporateInquiries;
}
