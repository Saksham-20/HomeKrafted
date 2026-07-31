import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewAggregatesService } from './review-aggregates.service';

/** `ReviewAggregatesService` is exported because `AdminModule`'s review moderation has to recompute the same numbers — see that service's doc comment. */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewAggregatesService],
  exports: [ReviewAggregatesService],
})
export class ReviewsModule {}
