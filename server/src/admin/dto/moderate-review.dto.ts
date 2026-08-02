import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/** `PATCH /admin/catalog/reviews/:id/moderate` — same `Review.hidden` flag `ReviewsService.list` already filters on. Doesn't clear `flagged` on unhide — see `moderateReview`'s service-level doc comment. */
export class ModerateReviewDto {
  @BooleanField()
  hidden!: boolean;
}
