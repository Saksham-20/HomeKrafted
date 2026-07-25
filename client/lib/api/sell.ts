import type { SellerApplication, SellerApplicationCategory } from "@/lib/types";
import { sellerBenefits, sellerCategories, sellerSteps, type SellerBenefit, type SellerStep } from "@/lib/data";

export async function getSellerBenefits(): Promise<SellerBenefit[]> {
  return sellerBenefits;
}

export async function getSellerSteps(): Promise<SellerStep[]> {
  return sellerSteps;
}

export async function getSellerCategories(): Promise<{ value: SellerApplicationCategory; label: string }[]> {
  return sellerCategories;
}

/** In-memory mock application "table" — same session-scoped pattern as `lib/api/support.ts`'s `supportTickets`. */
const sellerApplications: SellerApplication[] = [];

export interface CreateSellerApplicationInput {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: SellerApplicationCategory;
  city: string;
  description: string;
}

/**
 * Mock seller-onboarding application mutation. Seller onboarding itself
 * is future-flagged (see `docs/PRD.md`) — this "un-flags" only once M8/M9
 * stand up a real vendor-application backend + review workflow;
 * `status` starts `"waitlisted"` rather than `"new"` to match `/sell`'s
 * framing ("we'll reach out when onboarding opens"), not an immediate
 * review queue.
 */
export async function createSellerApplication(input: CreateSellerApplicationInput): Promise<SellerApplication> {
  const application: SellerApplication = {
    id: `sa-${Date.now()}`,
    businessName: input.businessName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    category: input.category,
    city: input.city,
    description: input.description,
    status: "waitlisted",
    createdAt: new Date().toISOString(),
  };
  sellerApplications.push(application);
  return application;
}

export async function getSellerApplications(): Promise<SellerApplication[]> {
  return sellerApplications;
}
