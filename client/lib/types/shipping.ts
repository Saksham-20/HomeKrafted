/**
 * Courier despatch (M57). One `Consignment` is one kitchen's lines of one
 * order going to one address — a rider collects from the HomeKrafter's own
 * kitchen and delivers to the buyer.
 *
 * These mirror `server/prisma/schema.prisma`'s `Consignment`, minus every
 * column the server refuses to serve: there is deliberately no pickup
 * address here, because that is a home cook's home address (M36b), and no
 * `failureReason`, which is operator vocabulary — see `publicConsignment`
 * in `server/src/shipping/shipping.service.ts`.
 */
export type ConsignmentStatus =
  | "pending"
  | "booked"
  | "out-for-pickup"
  | "picked"
  | "in-transit"
  | "out-for-delivery"
  | "delivered"
  | "exception"
  | "returned"
  | "cancelled"
  | "failed";

export interface Consignment {
  id: string;
  status: ConsignmentStatus;
  /** The carrier's waybill. `null` until a booking succeeds. */
  awbNumber: string | null;
  /** The carrier's own raw status id, unmapped — shown to an admin only. */
  courierStatus: string | null;
  currentLocation: string | null;
  /** Only ever set once a rider is actually assigned, which is the only time it means anything. */
  riderName: string | null;
  riderContact: string | null;
  lastEventAt: string | null;
  bookedAt: string | null;
  pickedAt: string | null;
  deliveredAt: string | null;
  vendor?: { id: string; name: string; slug: string };
}

export interface ServiceabilityAnswer {
  pincode: string;
  serviceable: boolean;
  services: string[];
}
