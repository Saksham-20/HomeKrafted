import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Public()
  @Get()
  list(@Query('q') q?: string) {
    return this.vendorsService.list(q);
  }

  /**
   * Declared above `:slug` on purpose — Nest matches in declaration
   * order, so the reverse would resolve `/vendors/following` to a vendor
   * whose slug is literally "following".
   */
  @Get('following')
  listFollowed(@CurrentUser() user: RequestUser) {
    return this.vendorsService.listFollowed(user.userId);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.vendorsService.getBySlug(slug);
  }

  @Public()
  @Get(':slug/products')
  productsBySlug(@Param('slug') slug: string) {
    return this.vendorsService.productsBySlug(slug);
  }

  /**
   * The rich profile (M16) — story, kitchen photos, policies, trust
   * signals, badges. Split from `GET /vendors/:slug` rather than folded
   * into it because that route answers every product card and every
   * follow check, and none of them need a shop's return policy.
   */
  @Public()
  @Get(':slug/profile')
  profileBySlug(@Param('slug') slug: string) {
    return this.vendorsService.profileBySlug(slug);
  }

  /**
   * When this kitchen can actually take an order (M16, M2) — prep time,
   * working days, days marked off. Public, because the pre-order picker
   * on `/snacks` runs before anybody signs in.
   */
  @Public()
  @Get(':slug/availability')
  availabilityBySlug(@Param('slug') slug: string) {
    return this.vendorsService.availabilityBySlug(slug);
  }

  /** Authed, unlike the storefront read itself — see `VendorsService`'s follows section. */
  @Get(':slug/follow')
  followState(@CurrentUser() user: RequestUser, @Param('slug') slug: string) {
    return this.vendorsService.followState(user.userId, slug);
  }

  @Post(':slug/follow')
  follow(@CurrentUser() user: RequestUser, @Param('slug') slug: string) {
    return this.vendorsService.follow(user.userId, slug);
  }

  @Delete(':slug/follow')
  unfollow(@CurrentUser() user: RequestUser, @Param('slug') slug: string) {
    return this.vendorsService.unfollow(user.userId, slug);
  }
}
