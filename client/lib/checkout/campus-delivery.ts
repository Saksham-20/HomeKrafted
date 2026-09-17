import type { Address } from "@/lib/types";

/**
 * Hand-delivery onto the ISB campus, buyer side (2026-09-17, owner).
 *
 * The server owns the rule and the destination
 * (`server/src/common/delivery/isb-campus.ts`); this is the one string
 * the client needs to recognise what it wrote, plus the copy that goes
 * with it.
 *
 * **Mirrors the server's `ISB_ADDRESS_LABEL` and must stay in step** —
 * the same standing hazard as `lib/geo.ts` and its server twin, for the
 * same reason (two packages, no shared module). It is one string, and
 * the consequence of drift is contained: the campus address stops being
 * filtered out of the pickers below, which is untidy rather than wrong.
 */
export const ISB_ADDRESS_LABEL = "ISB campus";

/**
 * Is this the server-written campus address?
 *
 * **Why it is filtered out of every picker.** Choosing "Deliver to ISB"
 * makes the server write an `Address` row on the buyer's account, which
 * is what lets an order, a parcel label and a six-month-old receipt all
 * keep rendering a real destination. The side effect is that it then
 * appears in the ordinary "deliver to me" list — where picking it would
 * place a **standard** order to the campus: a delivery fee, and a
 * courier booked to carry a parcel we were going to walk over. That is
 * the exact inconsistency the server-owned destination exists to
 * prevent, arriving through a second door.
 *
 * So it is offered nowhere a buyer picks an address. It is not hidden
 * from anything that *displays* where an order went — those read the
 * address off the order, not off this list.
 */
export function isCampusAddress(address: Pick<Address, "label">): boolean {
  return address.label === ISB_ADDRESS_LABEL;
}

/** The buyer's own addresses, minus the one the campus option writes. */
export function withoutCampusAddress(addresses: Address[]): Address[] {
  return addresses.filter((address) => !isCampusAddress(address));
}
