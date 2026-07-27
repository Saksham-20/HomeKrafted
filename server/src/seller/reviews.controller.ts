import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerReviewsService } from './reviews.service';
import { ReplyReviewDto } from './dto/reply-review.dto';

/** Maker-only — reviews on this vendor's own products/vendor record. */
@Controller('seller/reviews')
@Roles('seller')
export class SellerReviewsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly reviewsService: SellerReviewsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.reviewsService.list(seller.vendorId);
  }

  @Post(':id/reply')
  async reply(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReplyReviewDto) {
    const seller = await this.sellerService.resolveMaker(user);
    return this.reviewsService.reply(seller.vendorId, id, dto);
  }
}
