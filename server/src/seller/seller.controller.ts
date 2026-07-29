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

  /** Branches by `seller.type` — see `SellerService.getDashboard`'s three shapes. */
  @Get('dashboard')
  async dashboard(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveSeller(user);
    return this.sellerService.getDashboard(seller, this.listingsService, this.payoutsService);
  }

  /** Maker-only — 403s for a laundry/snack seller token. */
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
