import { CorporateInquiry } from '@prisma/client';

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
    createdAt: inquiry.createdAt.toISOString(),
  };
}
