import type { Review } from "@/lib/types";
import { getReviewsForProduct, getReviewsForVendor } from "@/lib/data";

/** Excludes moderator-hidden reviews (M11b `/admin/catalog/reviews`). Note the same server/client module-graph boundary as `lib/api/products.ts#isBrowsable` applies — see that file's doc comment. */
export async function getProductReviews(productId: string): Promise<Review[]> {
  return getReviewsForProduct(productId).filter((r) => !r.hidden);
}

export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  return getReviewsForVendor(vendorId).filter((r) => !r.hidden);
}
