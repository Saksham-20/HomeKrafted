import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Same shape as `auth.controller.ts`'s `AUTH_THROTTLE`: evaluated once at
 * import, env-tunable so the e2e suite (which posts many reviews from one
 * IP) can raise it without weakening production's default.
 */
const REVIEWS_THROTTLE = {
  default: {
    limit: parseInt(process.env.THROTTLE_REVIEWS_LIMIT ?? '5', 10),
    ttl: 60_000,
  },
};
import { Public } from '../common/decorators/public.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews.query.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  list(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.list(query.targetType, query.targetId);
  }

  /** Own reviews, hidden ones included — see `ReviewsService.listMine`. Declared above `:id`-shaped routes would matter if any existed here; kept adjacent to `mine/pending` for readability. */
  @Get('mine')
  listMine(@CurrentUser() user: RequestUser) {
    return this.reviewsService.listMine(user.userId);
  }

  /** Delivered-but-unreviewed items — the "waiting for your review" list on `/account/reviews`. */
  @Get('mine/pending')
  listPending(@CurrentUser() user: RequestUser) {
    return this.reviewsService.listPending(user.userId);
  }

  /**
   * Throttled well under the global 120/min (M37): the delivered-order
   * requirement already blocks strangers, but an account with real
   * deliveries could still script a burst onto its own targets. Nobody
   * writes six honest reviews in a minute.
   */
  @Throttle(REVIEWS_THROTTLE)
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.userId, dto);
  }
}
