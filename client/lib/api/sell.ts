import type {
  SellerApplication,
  SellerApplicationCategory,
  SellerApplicationStatus,
  SellerSpecialty,
} from "@/lib/types";
import {
  sellerBenefits,
  sellerCategories,
  seedSellerApplications,
  sellerSteps,
  type SellerBenefit,
  type SellerStep,
} from "@/lib/data";
import { http, isMockMode } from "./http";

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
  /** What they'll offer — becomes `Seller.specialties` once approved. */
  specialties: SellerSpecialty[];
  city: string;
  /**
   * Tricity area id, or the literal `"other"` — sets where their kitchen
   * sits for the buyer distance filter. `"other"` files the application as
   * a **waitlist** entry that cannot be approved until an admin assigns a
   * real area.
   */
  area: string;
  /** Required when `area` is `"other"`: the locality they typed. */
  areaLabel?: string;
  /**
   * How far they'll deliver, km. **Omit it and it stays null**, which is
   * what lets `PlatformSetting.defaultDeliveryRadiusKm` apply at approval —
   * before M19 the column defaulted to 10 and the platform value was
   * unreachable.
   */
  deliveryRadiusKm?: number;
  description: string;
}

/**
 * Seller-onboarding application submission — **real as of M9**
 * (`docs/PRD.md`'s "future-flagged" note no longer applies): `POST
 * /seller-applications` (`@Public()`, same "no account needed to submit"
 * shape as `createCorporateInquiry`) persists straight into the real
 * admin approval queue (`GET /admin/sellers/applications`) that
 * `AdminSellersService.approveApplication` promotes into a live `Seller`
 * + `Vendor` — this closes the `/sell` -> admin-approve -> seller-active
 * loop end-to-end. Starts at the server's own default status (`"new"`),
 * a genuine pending-review row, not the old mock's synthetic
 * `"waitlisted"` framing.
 */
export async function createSellerApplication(input: CreateSellerApplicationInput): Promise<SellerApplication> {
  if (!isMockMode()) {
    return http.post<SellerApplication>(
      "/seller-applications",
      {
        businessName: input.businessName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        category: input.category,
        specialties: input.specialties,
        city: input.city,
        area: input.area,
        areaLabel: input.areaLabel,
        deliveryRadiusKm: input.deliveryRadiusKm,
        description: input.description,
      },
      { auth: false },
    );
  }

  const application: SellerApplication = {
    id: `sa-${Date.now()}`,
    businessName: input.businessName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    category: input.category,
    specialties: input.specialties,
    area: input.area,
    areaLabel: input.areaLabel,
    deliveryRadiusKm: input.deliveryRadiusKm,
    city: input.city,
    description: input.description,
    status: input.area === "other" ? "waitlisted" : "new",
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
