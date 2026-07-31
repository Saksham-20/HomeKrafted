import type { Review, ReviewTargetType } from "@/lib/types";
import { getReviewsForProduct, getReviewsForVendor } from "@/lib/data";
import { http, isMockMode } from "./http";

/**
 * Reviews. `GET /reviews?targetType=&targetId=` is `@Public()` and
 * already excludes `hidden` server-side (`docs/API.md` "Reviews") — no
 * client-side filter needed on the real path.
 *
 * The write side landed in M15. `POST /reviews` accepts a review only
 * from someone whose order containing that item has been **delivered**
 * (`ReviewsService.create`), so a submission can legitimately fail with a
 * reason the UI has to state rather than swallow — `createReview` lets
 * the `ApiError` through for exactly that.
 */

export async function getProductReviews(productId: string): Promise<Review[]> {
  if (isMockMode()) return getReviewsForProduct(productId).filter((r) => !r.hidden);
  return http.get<Review[]>("/reviews", { auth: false, query: { targetType: "product", targetId: productId } });
}

export async function getVendorReviews(vendorId: string): Promise<Review[]> {
  if (isMockMode()) return getReviewsForVendor(vendorId).filter((r) => !r.hidden);
  return http.get<Review[]>("/reviews", { auth: false, query: { targetType: "vendor", targetId: vendorId } });
}

export interface CreateReviewInput {
  targetType: ReviewTargetType;
  targetId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
}

/** Something the signed-in buyer has had delivered and hasn't reviewed yet. */
export interface PendingReview {
  targetType: ReviewTargetType;
  targetId: string;
  name: string;
  slug: string;
  vendorName: string;
  imageSrc?: string;
  imagePlaceholder: string;
}

export async function createReview(input: CreateReviewInput): Promise<Review> {
  if (isMockMode()) {
    // Mock mode has no order history to verify against. Returns a
    // plausible row rather than pretending to persist one — enough to
    // exercise the form's success state offline, and honest about not
    // being a write.
    return {
      id: `rv-local-${Date.now()}`,
      targetType: input.targetType,
      targetId: input.targetId,
      userId: "u-local",
      userName: "You",
      rating: input.rating,
      title: input.title,
      body: input.body,
      createdAt: new Date().toISOString(),
      helpfulCount: 0,
      verifiedPurchase: true,
    };
  }
  return http.post<Review>("/reviews", input);
}

/** The buyer's own reviews — hidden ones included, so a moderated review stays visible to its author. */
export async function getMyReviews(): Promise<Review[]> {
  if (isMockMode()) return [];
  return http.get<Review[]>("/reviews/mine");
}

/** Delivered-but-unreviewed items. The prompt to review — there is no other one in the product. */
export async function getPendingReviews(): Promise<PendingReview[]> {
  if (isMockMode()) return [];
  return http.get<PendingReview[]>("/reviews/mine/pending");
}
