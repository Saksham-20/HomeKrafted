import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerOrdersService } from './orders.service';
import { ShippingService } from '../shipping/shipping.service';
import { ListSellerOrdersQueryDto } from './dto/list-seller-orders.query.dto';

/** Orders containing at least one of this HomeKrafter's own vendor's items. */
@Controller('seller/orders')
@Roles('seller')
export class SellerOrdersController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly ordersService: SellerOrdersService,
    private readonly shipping: ShippingService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListSellerOrdersQueryDto) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.list(seller.vendorId, query.page ?? 1, query.pageSize ?? 50);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.getOne(seller.vendorId, id);
  }

  /**
   * The courier parcels for this order that are **this** kitchen's — the
   * AWB to write on the box, and the rider's name and number once one is
   * assigned. A participant in a multi-kitchen order never sees the other
   * kitchen's parcel (M37).
   */
  @Get(':id/consignments')
  async consignments(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.shipping.forOrderAsSeller(seller.vendorId, id);
  }

  /** Advances placed -> confirmed -> packed -> shipped -> delivered. Terminal/unpaid orders 409. */
  @Post(':id/advance')
  async advance(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.advance(seller.vendorId, id);
  }
}
