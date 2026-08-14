import type {
  SellerApplication,
  SellerApplicationCategory,
  SellerApplicationStatus,
  SellerSpecialty,
} from "@/lib/types";
import { categoryForSpecialties } from "@/lib/types";
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
  /**
   * **Optional since M22 — the `/sell` form no longer collects it.** The
   * server derives it from `specialties`; see
   * `server/src/seller-applications/specialty-taxonomy.ts` for why it
   * stopped being worth asking. Kept on the type because the endpoint
   * still accepts it from an older native client.
   */
  category?: SellerApplicationCategory;
  /** What they make — becomes `Seller.specialties` once approved, and the source of the derived category. */
  specialties: SellerSpecialty[];
  /**
   * **Derived from the pincode server-side since M36** — India Post's
   * district beats what somebody types in a hurry. Still sent so a
   * pre-M36 client keeps working.
   */
  city: string;
  /**
   * **Legacy since M36.** A tricity area id, or the literal `"other"`.
   * The form no longer sends it; the endpoint still accepts it.
   */
  area?: string;
  /**
   * Where they work from (M36) — any valid Indian pincode. One of this
   * or `area` is required; the server refuses a submission with neither.
   */
  pincode?: string;
  /** Required when `area` is `"other"`: the locality they typed. Pre-M36 only. */
  areaLabel?: string;
  /**
   * The pickup address (M36b) — where a rider collects. `addressLine1` is
   * required by the server; the rest are genuinely optional.
   *
   * This is somebody's home address, collected under an explicit on-form
   * promise that buyers never see it. Don't render it on any buyer-facing
   * surface.
   */
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  pickupPhone?: string;
  /**
   * How far they'll deliver, km. **Omit it and it stays null**, which is
   * what lets `PlatformSetting.defaultDeliveryRadiusKm` apply at approval —
   * before M19 the column defaulted to 10 and the platform value was
   * unreachable.
   */
  deliveryRadiusKm?: number;
  description: string;
  /**
   * M32 — the standardised form's extra questions. All optional, and all
   * carried onto `VendorProfile` at approval rather than left in a queue
   * row nobody reads again.
   *
   * Photos were the obvious alternative and were deliberately not built:
   * `POST /uploads` is authenticated and `/sell` is public, so collecting
   * images would mean opening an anonymous upload route — a new abuse
   * surface on the one endpoint that writes files to disk. A link points
   * at work they have already published.
   */
  instagramUrl?: string;
  websiteUrl?: string;
  /** Asked only of applicants who make food. Never a verification — the badge is admin-only (M16). */
  fssaiNumber?: string;
  /** Absent means "didn't say", which is not the same as zero. */
  yearsMaking?: number;
  capacityPerDay?: number;
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
        // Only sent when a caller actually supplied one — the server
        // derives it otherwise.
        ...(input.category ? { category: input.category } : {}),
        specialties: input.specialties,
        city: input.city,
        // Both optional since M36 and one of them required by the server:
        // `pincode` is what the form sends now, `area` is what a native
        // client built before M36 still sends.
        ...(input.area ? { area: input.area } : {}),
        ...(input.pincode ? { pincode: input.pincode } : {}),
        areaLabel: input.areaLabel,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        landmark: input.landmark,
        pickupPhone: input.pickupPhone,
        deliveryRadiusKm: input.deliveryRadiusKm,
        description: input.description,
        instagramUrl: input.instagramUrl,
        websiteUrl: input.websiteUrl,
        fssaiNumber: input.fssaiNumber,
        yearsMaking: input.yearsMaking,
        capacityPerDay: input.capacityPerDay,
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
    category: input.category ?? categoryForSpecialties(input.specialties),
    specialties: input.specialties,
    area: input.area,
    pincode: input.pincode,
    areaLabel: input.areaLabel,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    landmark: input.landmark,
    pickupPhone: input.pickupPhone,
    deliveryRadiusKm: input.deliveryRadiusKm,
    city: input.city,
    description: input.description,
    // Mirrors the server (M36): only a legacy `area === "other"`
    // application is waitlisted. A pincode application never is — that is
    // the whole point of it, and mock mode must not teach otherwise.
    status: !input.pincode && input.area === "other" ? "waitlisted" : "new",
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

/**
 * The mock half of `lib/api/admin.ts#assignApplicationArea` — an admin
 * resolving a waitlisted application to a real serviced area.
 *
 * Mirrors `AdminSellersService.assignApplicationArea` in the two ways
 * that matter. The row moves back to `reviewing`, because leaving it
 * `waitlisted` would fix the data and still hide it from the admin who
 * just fixed it. And `areaLabel` is **kept**, not cleared: it is what
 * the applicant actually said about where they are, and an admin
 * overriding it with a nearby area shouldn't erase the original claim.
 */
export async function setSellerApplicationArea(
  id: string,
  area: string,
): Promise<SellerApplication | undefined> {
  const application = sellerApplications.find((a) => a.id === id);
  if (!application) return undefined;
  application.area = area;
  application.status = "reviewing";
  return application;
}
