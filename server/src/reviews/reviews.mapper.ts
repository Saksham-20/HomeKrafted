import { Review } from '@prisma/client';

export function mapReview(review: Review) {
  return {
    id: review.id,
    targetType: review.targetType,
    targetId: review.targetId,
    userId: review.userId,
    userName: review.userName,
    rating: review.rating,
    title: review.title ?? undefined,
    body: review.body,
    createdAt: review.createdAt.toISOString(),
    helpfulCount: review.helpfulCount,
    verifiedPurchase: review.verifiedPurchase,
    sellerReply:
      review.sellerReplyBody && review.sellerReplyCreatedAt
        ? { body: review.sellerReplyBody, createdAt: review.sellerReplyCreatedAt.toISOString() }
        : undefined,
    flagged: review.flagged,
    hidden: review.hidden,
  };
}
