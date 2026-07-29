import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerOrdersService } from './orders.service';

/** Maker-only — orders containing at least one of this seller's own vendor's items. */
@Controller('seller/orders')
@Roles('seller')
export class SellerOrdersController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly ordersService: SellerOrdersService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.list(seller.vendorId);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.getOne(seller.vendorId, id);
  }

  /** Advances placed -> confirmed -> packed -> shipped -> delivered. Terminal/unpaid orders 409. */
  @Post(':id/advance')
  async advance(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.advance(seller.vendorId, id);
  }
}
