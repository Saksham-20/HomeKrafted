import { MyReviewsClient } from "@/components/account/MyReviewsClient";

/**
 * `/account/reviews` (M15) — both reads are owner-scoped, so the client
 * screen fetches them itself on mount rather than this wrapper doing it
 * server-side (same reasoning as every other authed account route).
 */
export default function MyReviewsPage() {
  return <MyReviewsClient />;
}
