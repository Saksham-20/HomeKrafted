import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerOrdersService } from './orders.service';
import { ListSellerOrdersQueryDto } from './dto/list-seller-orders.query.dto';

/** Orders containing at least one of this HomeKrafter's own vendor's items. */
@Controller('seller/orders')
@Roles('seller')
export class SellerOrdersController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly ordersService: SellerOrdersService,
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

  /** Advances placed -> confirmed -> packed -> shipped -> delivered. Terminal/unpaid orders 409. */
  @Post(':id/advance')
  async advance(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.ordersService.advance(seller.vendorId, id);
  }
}
