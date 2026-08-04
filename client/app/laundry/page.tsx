import { notFound } from "next/navigation";

/**
 * Laundry, Cleaning & Ironing — **withdrawn from the web in M19** when the
 * platform narrowed to snacks and hampers.
 *
 * Gone, not deleted. This route 404s and every entry point (nav, footer,
 * home page, sitemap) is removed, but:
 *
 * - `LaundryBookingClient`, `lib/api/laundry.ts` and the Prisma tables all
 *   stay, so bringing the module back is reverting a commit rather than
 *   rebuilding a vertical.
 * - `LaundryModule` stays registered on the server. `OrdersService`
 *   constructor-injects `LaundryService` through `OrdersModule`'s own
 *   import, so unpicking it is a four-step change ending at
 *   `app.module.ts`, not a deletion.
 * - Order history still merges existing bookings, so someone who booked a
 *   pickup last month can still find it in `/account/orders`. Hiding a
 *   product must not erase what people already paid for.
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
