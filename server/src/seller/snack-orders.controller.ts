import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerSnackOrdersService } from './snack-orders.service';

/** Snack-seller-only — inbound `SnackOrder`s scoped to the caller's own `sellerId`. */
@Controller('seller/snack-orders')
@Roles('seller')
export class SellerSnackOrdersController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly snackOrdersService: SellerSnackOrdersService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveSnackSeller(user);
    return this.snackOrdersService.list(seller.id);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveSnackSeller(user);
    return this.snackOrdersService.getOne(seller.id, id);
  }

  /** Advances received -> accepted -> out-for-delivery -> delivered. */
  @Post(':id/advance')
  async advance(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveSnackSeller(user);
    return this.snackOrdersService.advance(seller.id, id);
  }
}
