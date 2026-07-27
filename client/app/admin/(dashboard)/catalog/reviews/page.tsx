import { CatalogReviewsClient } from "@/components/admin/CatalogReviewsClient";

/** `/admin/catalog/reviews` — every review across products + vendors, flagged queue, hide/unhide. */
export default function AdminCatalogReviewsPage() {
  return <CatalogReviewsClient />;
}
