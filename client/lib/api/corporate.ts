import type {
  AdminCorporateInquiry,
  AdminCorporateInquiryDetail,
  CorporateInquiry,
  CorporateInquiryStatus,
  CorporateQuote,
  CorporateQuoteInput,
  PublicCorporateQuote,
} from "@/lib/types";
import { corporateBudgetRanges, corporateOccasions } from "@/lib/data";
import { http, isMockMode } from "./http";

export async function getCorporateOccasions(): Promise<string[]> {
  return corporateOccasions;
}

export async function getCorporateBudgetRanges(): Promise<string[]> {
  return corporateBudgetRanges;
}

/** Mock-mode-only in-memory inquiry "table". Real mode reads `GET /admin/corporate-inquiries` (M20). */
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
  /** "50 hampers for clients" and "20kg of namkeen for a wedding" are different conversations. */
  orderType?: "corporate" | "bulk";
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
      orderType: input.orderType ?? "corporate",
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
      orderType: input.orderType,
    },
    { auth: false },
  );
}

/** Mock-only. The real admin reader is `getAdminCorporateInquiries` below. */
export async function getCorporateInquiries(): Promise<CorporateInquiry[]> {
  return corporateInquiries;
}

/* --------------------------------------------------------------------------
 * The admin queue (M20).
 *
 * `CorporateInquiry` had a live public POST, a form behind it, and nothing
 * anywhere that read a row. This is the missing reader.
 * ------------------------------------------------------------------------ */

export interface AdminCorporateList {
  items: AdminCorporateInquiry[];
  page: number;
  pageSize: number;
  total: number;
  /** The whole queue, never the page or the filter. */
  summary: { unworked: number; contacted: number; quoted: number };
}

export async function getAdminCorporateInquiries(
  status?: CorporateInquiryStatus,
  page = 1,
): Promise<AdminCorporateList> {
  if (isMockMode()) {
    return { items: [], page: 1, pageSize: 0, total: 0, summary: { unworked: 0, contacted: 0, quoted: 0 } };
  }
  const query: Record<string, string> = {};
  if (status) query.status = status;
  if (page > 1) query.page = String(page);
  return http.get<AdminCorporateList>("/admin/corporate-inquiries", {
    query: Object.keys(query).length ? query : undefined,
  });
}

export async function getAdminCorporateInquiry(
  id: string,
): Promise<AdminCorporateInquiryDetail | undefined> {
  if (isMockMode()) return undefined;
  try {
    return await http.get<AdminCorporateInquiryDetail>(
      `/admin/corporate-inquiries/${encodeURIComponent(id)}`,
    );
  } catch {
    return undefined;
  }
}

export async function setCorporateInquiryStatus(
  id: string,
  status: CorporateInquiryStatus,
): Promise<AdminCorporateInquiry> {
  return http.patch<AdminCorporateInquiry>(
    `/admin/corporate-inquiries/${encodeURIComponent(id)}/status`,
    { status },
  );
}

export async function setCorporateInquiryNotes(
  id: string,
  internalNotes: string,
): Promise<AdminCorporateInquiry> {
  return http.patch<AdminCorporateInquiry>(
    `/admin/corporate-inquiries/${encodeURIComponent(id)}/notes`,
    { internalNotes },
  );
}

export async function createCorporateQuote(
  inquiryId: string,
  input: CorporateQuoteInput,
): Promise<CorporateQuote> {
  return http.post<CorporateQuote>(
    `/admin/corporate-inquiries/${encodeURIComponent(inquiryId)}/quotes`,
    input,
  );
}

export async function updateCorporateQuote(
  quoteId: string,
  input: Partial<CorporateQuoteInput>,
): Promise<CorporateQuote> {
  return http.patch<CorporateQuote>(
    `/admin/corporate-inquiries/quotes/${encodeURIComponent(quoteId)}`,
    input,
  );
}

/** Mints the accept link and emails it. Re-sending rotates the token, killing the old link. */
export async function sendCorporateQuote(quoteId: string): Promise<CorporateQuote> {
  return http.post<CorporateQuote>(
    `/admin/corporate-inquiries/quotes/${encodeURIComponent(quoteId)}/send`,
    {},
  );
}

export async function revokeCorporateQuoteLink(quoteId: string): Promise<CorporateQuote> {
  return http.delete<CorporateQuote>(
    `/admin/corporate-inquiries/quotes/${encodeURIComponent(quoteId)}/link`,
  );
}

/* --------------------------------------------------------------------------
 * The public quote — what a logged-out procurement manager opens.
 * ------------------------------------------------------------------------ */

/**
 * `undefined` means the token resolves to nothing: never found, or
 * revoked. The server makes those two indistinguishable on purpose, and
 * this must not try to tell them apart either.
 */
export async function getPublicQuote(token: string): Promise<PublicCorporateQuote | undefined> {
  try {
    return await http.get<PublicCorporateQuote>(
      `/corporate/quotes/${encodeURIComponent(token)}`,
      { auth: false },
    );
  } catch {
    return undefined;
  }
}

/**
 * Accepting. **Errors are deliberately not swallowed** — a 409 on an
 * expired quote carries a message the customer needs to read, and this is
 * the one action on the page.
 */
export async function acceptPublicQuote(
  token: string,
  acceptedName: string,
): Promise<PublicCorporateQuote> {
  return http.post<PublicCorporateQuote>(
    `/corporate/quotes/${encodeURIComponent(token)}/accept`,
    { acceptedName },
    { auth: false },
  );
}

export async function declinePublicQuote(token: string): Promise<PublicCorporateQuote> {
  return http.post<PublicCorporateQuote>(
    `/corporate/quotes/${encodeURIComponent(token)}/decline`,
    {},
    { auth: false },
  );
}
