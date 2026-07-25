import type { Review } from "@/lib/types";
import { getReviewsForProduct, getReviewsForVendor } from "@/lib/data";

export async function getProductReviews(productId: string): Promise<Review[]> {
  return getReviewsForProduct(productId);
}

export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  return getReviewsForVendor(vendorId);
}
