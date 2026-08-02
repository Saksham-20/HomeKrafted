import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerListingsService } from './listings.service';
import { SellerPayoutsService } from './payouts.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

/**
 * `@Roles('seller')` at the class level — the whole `/seller/*` surface
 * (every controller in this module) is unreachable by a `consumer` or
 * `admin` token (403 via `RolesGuard`), and every method below re-resolves
 * the acting seller from `@CurrentUser().sellerId` (minted server-side at
 * login), never a route/body param — see `SellerService.resolveSeller`'s
 * doc comment for the full ownership-scoping seam.
 */
@Controller('seller')
@Roles('seller')
export class SellerController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly listingsService: SellerListingsService,
    private readonly payoutsService: SellerPayoutsService,
  ) {}

  /**
   * The signed-in HomeKrafter's own `Seller` record (M17).
   *
   * The web client used to resolve this from the **mock** seller list in
   * `lib/data/sellers.ts`, keyed on the session user's id. A real
   * HomeKrafter is not in that list, so the lookup missed and fell
   * through to a default demo record — every genuine kitchen saw another
   * kitchen's name and `vendorId` in their own portal. There was no
   * endpoint to read it from; this is that endpoint.
   *
   * Resolved from the caller's own session, never from a supplied id.
   */
  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return this.sellerService.getOwnRecord(user);
  }

  /** One shape for every HomeKrafter — see `SellerService.getDashboard`. */
  @Get('dashboard')
  async dashboard(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveSeller(user);
    return this.sellerService.getDashboard(seller, this.listingsService, this.payoutsService);
  }

  @Get('storefront')
  async getStorefront(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.sellerService.getStorefront(seller.vendorId);
  }

  @Patch('storefront')
  async updateStorefront(@CurrentUser() user: RequestUser, @Body() dto: UpdateStorefrontDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.sellerService.updateStorefront(seller.vendorId, dto);
  }
}
