import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.userId, dto);
  }
}
