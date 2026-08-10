import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminCatalogService } from './catalog.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { ListAdminCatalogQueryDto } from './dto/list-admin-catalog.query.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';

/** Unscoped catalog + review moderation — any vendor's products, any target's reviews. */
@Controller('admin/catalog')
@Roles('admin')
export class AdminCatalogController {
  constructor(private readonly catalogService: AdminCatalogService) {}

  @Get('products')
  listProducts(@Query() query: ListAdminCatalogQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalogService.getProduct(id);
  }

  @Patch('products/:id/moderate')
  moderateProduct(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateProductDto) {
    return this.catalogService.moderateProduct(admin.userId, id, dto);
  }

  /**
   * Everything awaiting review, across products, menu items and meal
   * plans. Separate from `GET products` because that one is a paginated
   * product browser; this is the actionable backlog an admin works to
   * empty, and until M28 two thirds of it were unreachable.
   */
  @Get('queue')
  listReviewQueue() {
    return this.catalogService.listReviewQueue();
  }

  /**
   * Menu items and meal plans have no admin detail screen, so the decision
   * is taken from the queue. Separate routes rather than one
   * `:type/:id/moderate`: the product route already exists and is called
   * by a shipped client, and narrowing or moving a live request path
   * breaks native clients that cannot be redeployed in step (M27).
   */
  @Patch('snacks/:id/moderate')
  moderateSnack(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateProductDto) {
    return this.catalogService.moderateSnack(admin.userId, id, dto);
  }

  @Patch('meal-plans/:id/moderate')
  moderateMealPlan(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateProductDto) {
    return this.catalogService.moderateMealPlan(admin.userId, id, dto);
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
