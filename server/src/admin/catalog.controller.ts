import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminCatalogService } from './catalog.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';

/** Unscoped catalog + review moderation — any vendor's products, any target's reviews. */
@Controller('admin/catalog')
@Roles('admin')
export class AdminCatalogController {
  constructor(private readonly catalogService: AdminCatalogService) {}

  @Get('products')
  listProducts() {
    return this.catalogService.listProducts();
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalogService.getProduct(id);
  }

  @Patch('products/:id/moderate')
  moderateProduct(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateProductDto) {
    return this.catalogService.moderateProduct(admin.userId, id, dto);
  }

  @Get('reviews')
  listReviews() {
    return this.catalogService.listReviews();
  }

  @Patch('reviews/:id/moderate')
  moderateReview(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.catalogService.moderateReview(admin.userId, id, dto.hidden);
  }
}
