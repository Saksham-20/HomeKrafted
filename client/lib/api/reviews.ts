import type { Review } from "@/lib/types";
import { getReviewsForProduct, getReviewsForVendor } from "@/lib/data";
import { http, isMockMode } from "./http";

/** Reviews (M8.4a — real read side). `GET /reviews?targetType=&targetId=` is `@Public()`, already excludes `hidden` server-side (`docs/API.md` "Reviews") — no client-side filter needed for the real path. There's no review-submission UI in the frontend yet, so only the two reads below swap; `POST /reviews` has no call site to wire up. */

export async function getProductReviews(productId: string): Promise<Review[]> {
  if (isMockMode()) return getReviewsForProduct(productId).filter((r) => !r.hidden);
  return http.get<Review[]>("/reviews", { auth: false, query: { targetType: "product", targetId: productId } });
}

export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  if (isMockMode()) return getReviewsForVendor(vendorId).filter((r) => !r.hidden);
  return http.get<Review[]>("/reviews", { auth: false, query: { targetType: "vendor", targetId: vendorId } });
}
