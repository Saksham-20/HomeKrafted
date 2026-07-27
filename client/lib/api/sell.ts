import type { SellerApplication, SellerApplicationCategory, SellerApplicationStatus } from "@/lib/types";
import {
  sellerBenefits,
  sellerCategories,
  seedSellerApplications,
  sellerSteps,
  type SellerBenefit,
  type SellerStep,
} from "@/lib/data";

export async function getSellerBenefits(): Promise<SellerBenefit[]> {
  return sellerBenefits;
}

export async function getSellerSteps(): Promise<SellerStep[]> {
  return sellerSteps;
}

export async function getSellerCategories(): Promise<{ value: SellerApplicationCategory; label: string }[]> {
  return sellerCategories;
}

/**
 * In-memory mock application "table" — same session-scoped pattern as
 * `lib/api/support.ts`'s `supportTickets`, seeded from
 * `lib/data/sell.ts#seedSellerApplications` (M11a) so `/admin/sellers`'
 * approval queue has real applications on first load, with every
 * `/sell` form submission (`createSellerApplication` below) and every
 * admin approve/reject decision (`setSellerApplicationStatus` below)
 * pushed onto / mutated in place on this same array.
 */
const sellerApplications: SellerApplication[] = [...seedSellerApplications];

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

export async function getSellerApplicationById(id: string): Promise<SellerApplication | undefined> {
  return sellerApplications.find((application) => application.id === id);
}

/**
 * M11a — the admin approval-queue mutation target
 * (`lib/api/admin.ts#approveSellerApplication`/`rejectSellerApplication`
 * call this rather than reaching into `sellerApplications` directly,
 * same "each api module owns its own state" convention every other
 * `lib/api/*` mutation in this codebase follows).
 */
export async function setSellerApplicationStatus(
  id: string,
  status: SellerApplicationStatus,
): Promise<SellerApplication | undefined> {
  const application = sellerApplications.find((a) => a.id === id);
  if (!application) return undefined;
  application.status = status;
  return application;
}
