import { FeaturedClient } from "@/components/admin/FeaturedClient";

/**
 * `/admin/catalog/featured` (2026-09-19) — which listings lead the
 * default browse, and in what order.
 *
 * Merchandising, not moderation: putting a listing here changes where it
 * sits, never whether it is allowed to be seen, so it does not touch a
 * listing's review state. The whole list is saved at once and array
 * position is the rank.
 */
export default function AdminFeaturedPage() {
  return <FeaturedClient />;
}
