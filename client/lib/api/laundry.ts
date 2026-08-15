import type { LaundryBooking } from "@/lib/types";
import { laundryServices, laundrySlots, seedLaundryBookings } from "@/lib/data";
import { http, isMockMode } from "./http";

/**
 * Laundry — **withdrawn (M19)**, reduced to its obligations (M37).
 *
 * The browse and create functions (`getLaundryServices`, `getLaundryDays`,
 * `getLaundrySlots`, `createBooking`, `createSubscription`, …) are gone
 * with the server routes that backed them; the module's remaining job is
 * that people who already paid for a pickup can still find it. Booking
 * payloads carry their own service names and slot labels since M37
 * (`LaundryLine.serviceName`, `LaundryBooking.pickupSlotLabel`), so no
 * screen needs the withdrawn catalogue to render one.
 */

/** Mirrors the server's M37 denormalisation for the mock seeds, which predate it. */
function enrichMockBooking(booking: LaundryBooking): LaundryBooking {
  return {
    ...booking,
    lines: booking.lines.map((line) => {
      const service = laundryServices.find((s) => s.id === line.serviceId);
      return { ...line, serviceName: service?.name, unitLabel: service?.unitLabel };
    }),
    pickupSlotLabel: laundrySlots.find((s) => s.id === booking.pickupSlot.slotId)?.label,
    deliverySlotLabel: laundrySlots.find((s) => s.id === booking.deliverySlot.slotId)?.label,
  };
}

/**
 * Real mode: `GET /laundry/bookings` — every booking of the signed-in
 * account. Mock mode: the seeded history (there is no way to place a new
 * booking any more, so there is no live in-memory table either).
 */
export async function getPlacedBookings(): Promise<LaundryBooking[]> {
  if (isMockMode()) return seedLaundryBookings.map(enrichMockBooking);
  return http.get<LaundryBooking[]>("/laundry/bookings");
}
