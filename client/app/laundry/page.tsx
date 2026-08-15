import { notFound } from "next/navigation";

/**
 * Laundry, Cleaning & Ironing — **withdrawn from the web in M19** when the
 * platform narrowed to snacks and hampers.
 *
 * This route 404s and every entry point (nav, footer, home page,
 * sitemap) is removed. M37 finished the withdrawal: the booking flow
 * components, browse API functions and server browse/create paths are
 * deleted — what stays is exactly the obligation set:
 *
 * - The Prisma tables and the server's owner-scoped reads stay, so order
 *   history still merges existing bookings and someone who booked a
 *   pickup last month can still find it in `/account/orders`. Hiding a
 *   product must not erase what people already paid for.
 * - A subscription holder can still change or cancel what they signed
 *   up for, and `/seller/pickups` stays reachable for work in flight.
 *
 * **Nothing may add a `loading.tsx` above this route.** A Suspense
 * boundary starts streaming the 200 before the body runs, so `notFound()`
 * can no longer set the status and the visitor gets a soft 404 — a right
 * page under a 200, which search engines keep indexing. Measured in M15;
 * see CLAUDE.md's SEO section.
 */
export default function LaundryPage() {
  notFound();
}
