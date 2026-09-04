import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewAggregatesService } from './review-aggregates.service';

/** `ReviewAggregatesService` is exported because `AdminModule`'s review moderation has to recompute the same numbers — see that service's doc comment. */
@Module({
  // A review is the one buyer action a HomeKrafter hears about nowhere
  // else (2026-09-04) — see `ReviewsService.notifySeller`.
  imports: [NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewAggregatesService],
  exports: [ReviewAggregatesService],
})
export class ReviewsModule {}
