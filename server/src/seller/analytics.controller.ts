import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerAnalyticsService } from './analytics.service';

/**
 * `/seller/analytics` (M16, H6). Scoped through `resolveHomeKrafter` like
 * every other `/seller/*` route — the window is the only thing the client
 * gets to choose, and the service clamps it.
 */
@Controller('seller/analytics')
@Roles('seller')
export class SellerAnalyticsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly analyticsService: SellerAnalyticsService,
  ) {}

  @Get()
  async snapshot(@CurrentUser() user: RequestUser, @Query('days') days?: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.analyticsService.snapshot(seller, Number(days ?? 30));
  }
}
