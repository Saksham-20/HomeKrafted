import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminCatalogService } from './catalog.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { CreateAdminProductDto } from './dto/create-admin-product.dto';
import { UpdateListingDto } from '../seller/dto/update-listing.dto';
import { ListAdminCatalogQueryDto } from './dto/list-admin-catalog.query.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ListAdminReviewsQueryDto } from './dto/list-admin-reviews.query.dto';
import { parseDateParam } from '../meals/day-menus.service';
import { SetDayMenuDto } from '../meals/dto/set-day-menu.dto';

/** Unscoped catalog + review moderation — any vendor's products, any target's reviews. */
@Controller('admin/catalog')
@Roles('admin')
@RequireAdminScope('catalog')
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

  /**
   * Create a listing (M44). Defaults to the platform's own "Homekrafted"
   * storefront; pass `vendorId` to list on a HomeKrafter's behalf, which
   * is the assisted-onboarding path — see `AdminCatalogService`.
   */
  @Post('products')
  createProduct(@CurrentUser() admin: RequestUser, @Body() dto: CreateAdminProductDto) {
    return this.catalogService.createProduct(admin.userId, dto);
  }

  /**
   * Full-record edit for any vendor's listing (M44). The screen for this
   * shipped in M11b against a client wrapper that wrote to a mock array
   * and returned; every admin edit since has been silently discarded.
   *
   * Declared above `:id/moderate`? No — Nest matches the more specific
   * static segment regardless of order here, since `moderate` cannot
   * collide with an id in the same position. Kept next to it for reading.
   */
  @Patch('products/:id')
  updateProduct(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.catalogService.updateProduct(admin.userId, id, dto);
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

  /**
   * The emergency door past the menu lock (M37): a kitchen calls in sick
   * after 8pm, support fixes tomorrow's menu here. Audited with
   * before/after, and it still notifies the scheduled subscribers — the
   * lock protects buyers from silent changes, not from being told.
   */
  @Put('meal-plans/:id/menus/:date')
  overrideMealPlanDayMenu(
    @CurrentUser() admin: RequestUser,
    @Param('id') id: string,
    @Param('date') dateParam: string,
    @Body() dto: SetDayMenuDto,
  ) {
    const date = parseDateParam(dateParam);
    if (!date) throw new BadRequestException('Date must look like 2026-08-20');
    return this.catalogService.overrideMealPlanDayMenu(admin.userId, id, date, dto.lines);
  }

  @Get('reviews')
  listReviews(@Query() query: ListAdminReviewsQueryDto) {
    return this.catalogService.listReviews(query.page ?? 1, query.pageSize ?? 50);
  }

  @Patch('reviews/:id/moderate')
  moderateReview(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.catalogService.moderateReview(admin.userId, id, dto.hidden);
  }
}
