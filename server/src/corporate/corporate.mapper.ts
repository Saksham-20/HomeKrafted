import { CorporateInquiry, CorporateQuote, Prisma } from '@prisma/client';

export function mapCorporateInquiry(inquiry: CorporateInquiry) {
  return {
    id: inquiry.id,
    companyName: inquiry.companyName,
    contactName: inquiry.contactName,
    email: inquiry.email,
    phone: inquiry.phone,
    occasion: inquiry.occasion ?? undefined,
    estimatedQuantity: inquiry.estimatedQuantity,
    budgetRange: inquiry.budgetRange ?? undefined,
    message: inquiry.message,
    status: inquiry.status,
    orderType: inquiry.orderType,
    createdAt: inquiry.createdAt.toISOString(),
  };
}

/** The admin view — adds the notes only they can see. */
export function mapAdminCorporateInquiry(
  inquiry: CorporateInquiry & { quotes?: CorporateQuote[]; _count?: { quotes: number } },
) {
  return {
    ...mapCorporateInquiry(inquiry),
    internalNotes: inquiry.internalNotes ?? undefined,
    updatedAt: inquiry.updatedAt.toISOString(),
    quoteCount: inquiry._count?.quotes ?? inquiry.quotes?.length ?? 0,
  };
}

export const QUOTE_INCLUDE = {
  lines: {
    include: {
      product: { select: { id: true, name: true, slug: true } },
      vendor: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.CorporateQuoteInclude;

type QuoteWithLines = Prisma.CorporateQuoteGetPayload<{ include: typeof QUOTE_INCLUDE }>;

export function mapQuote(quote: QuoteWithLines) {
  return {
    id: quote.id,
    inquiryId: quote.inquiryId,
    status: quote.status,
    validUntil: quote.validUntil.toISOString(),
    notes: quote.notes ?? undefined,
    subtotal: Number(quote.subtotal),
    taxAmount: Number(quote.taxAmount),
    deliveryFee: Number(quote.deliveryFee),
    total: Number(quote.total),
    /**
     * **Never the token, and never its hash.** Whether a link is live is
     * all an admin screen needs; the raw value is returned exactly once,
     * from `send`.
     */
    hasLiveLink: Boolean(quote.tokenHash) && !quote.revokedAt,
    sentAt: quote.sentAt?.toISOString(),
    revokedAt: quote.revokedAt?.toISOString(),
    acceptedAt: quote.acceptedAt?.toISOString(),
    acceptedName: quote.acceptedName ?? undefined,
    declinedAt: quote.declinedAt?.toISOString(),
    createdAt: quote.createdAt.toISOString(),
    lines: quote.lines.map((line) => ({
      id: line.id,
      productId: line.productId ?? undefined,
      productName: line.product?.name,
      vendorId: line.vendorId,
      vendorName: line.vendor.name,
      description: line.description,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
    })),
  };
}

export type PublicQuoteStatus = 'valid' | 'accepted' | 'declined' | 'expired';

/**
 * What a logged-out procurement manager sees.
 *
 * Deliberately narrower than the admin shape: no internal notes, no
 * inquiry id, no `hasLiveLink`, and **no vendor breakdown** — which
 * kitchen supplies which line is our commercial arrangement, not theirs.
 * `status` here is the derived one, so `expired` reflects the clock rather
 * than whatever was last written.
 */
export function mapPublicQuote(
  quote: QuoteWithLines & { inquiry: CorporateInquiry },
  status: PublicQuoteStatus,
) {
  return {
    status,
    companyName: quote.inquiry.companyName,
    contactName: quote.inquiry.contactName,
    occasion: quote.inquiry.occasion ?? undefined,
    validUntil: quote.validUntil.toISOString(),
    notes: quote.notes ?? undefined,
    subtotal: Number(quote.subtotal),
    taxAmount: Number(quote.taxAmount),
    deliveryFee: Number(quote.deliveryFee),
    total: Number(quote.total),
    acceptedAt: quote.acceptedAt?.toISOString(),
    acceptedName: quote.acceptedName ?? undefined,
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
    })),
  };
}
