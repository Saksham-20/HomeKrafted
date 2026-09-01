import type { Consignment, ConsignmentStatus, ServiceabilityAnswer } from "@/lib/types/shipping";
import { ApiError, http, isMockMode } from "./http";

/**
 * Courier parcels (M57).
 *
 * Every read here answers `[]` rather than throwing when the deployment
 * has no carrier configured — a kitchen that hands its own parcels over is
 * the normal case, and an order with no consignment is not an error. That
 * is a **read** narrowing a documented outcome, not a swallowed write:
 * `client/lib/silent-failure.spec.ts`'s rule is that a mutation must never
 * discard its own refusal, and there is no mutation in this file.
 *
 * The 404 branch is narrow on purpose. A 5xx, a dropped connection or a
 * 403 still throws, so a broken deployment renders as broken rather than
 * as "this order has no parcels" — the exact failure M39 found on
 * `/seller/me`.
 */
async function listConsignments(path: string): Promise<Consignment[]> {
  if (isMockMode()) return [];
  try {
    return await http.get<Consignment[]>(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

/** The buyer's own parcels for one of their orders. A foreign order 404s. */
export async function getOrderConsignments(orderId: string): Promise<Consignment[]> {
  return listConsignments(`/shipping/orders/${orderId}`);
}

/** The HomeKrafter's own parcel for one of their orders — their lines, their rider. */
export async function getSellerOrderConsignments(orderId: string): Promise<Consignment[]> {
  return listConsignments(`/seller/orders/${orderId}/consignments`);
}

/**
 * "Do we deliver to this pincode?"
 *
 * **Advisory only.** A `false` must never become an empty catalogue or a
 * blocked checkout — location is never a gate on this platform (M12), and
 * an unserviceable pincode simply means the kitchen hands the parcel over
 * itself. Answers `null` when we could not ask, which callers must render
 * as "we don't know", never as "no".
 */
export async function checkServiceability(pincode: string): Promise<ServiceabilityAnswer | null> {
  if (isMockMode()) return null;
  try {
    return await http.get<ServiceabilityAnswer>(`/shipping/serviceability?pincode=${encodeURIComponent(pincode)}`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin despatch queue
// ---------------------------------------------------------------------------

export interface AdminConsignment extends Consignment {
  orderId: string;
  vendorId: string;
  clientOrderId: string;
  /** The carrier's own refusal, verbatim — the whole of what says what to fix. */
  failureReason: string | null;
  bookAttempts: number;
  statusNote: string | null;
  cancelledAt: string | null;
  createdAt: string;
  order?: { id: string; orderNumber: string; status: string };
}

export interface AdminConsignmentEvent {
  id: string;
  courierStatus: string;
  status: ConsignmentStatus;
  comments: string | null;
  location: string | null;
  eventAt: string;
  createdAt: string;
}

export interface AdminConsignmentDetail extends AdminConsignment {
  events: AdminConsignmentEvent[];
}

export interface AdminConsignmentPage {
  items: AdminConsignment[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listConsignmentsForAdmin(params: {
  status?: ConsignmentStatus;
  page?: number;
} = {}): Promise<AdminConsignmentPage> {
  if (isMockMode()) return { items: [], total: 0, page: 1, pageSize: 50 };
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  const suffix = qs.toString() ? `?${qs}` : "";
  return http.get<AdminConsignmentPage>(`/admin/shipping/consignments${suffix}`);
}

export async function getConsignmentForAdmin(id: string): Promise<AdminConsignmentDetail> {
  return http.get<AdminConsignmentDetail>(`/admin/shipping/consignments/${id}`);
}

/**
 * Both of these are **mutations**, so neither swallows its own refusal
 * (M36): a retry that the carrier rejects, or a cancellation it will not
 * accept, carries the sentence saying why — and that sentence is the only
 * thing telling the operator what to do next. The screen's error banner
 * depends on these throwing.
 */
export async function bookConsignment(id: string): Promise<AdminConsignment> {
  return http.post<AdminConsignment>(`/admin/shipping/consignments/${id}/book`, {});
}

export async function cancelConsignment(id: string, reason: string): Promise<AdminConsignment> {
  return http.post<AdminConsignment>(`/admin/shipping/consignments/${id}/cancel`, { reason });
}
