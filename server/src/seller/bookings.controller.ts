import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerBookingsService } from './bookings.service';

/** Laundry-partner-only — bookings assigned to this seller (`LaundryBooking.partnerId`). */
@Controller('seller/bookings')
@Roles('seller')
export class SellerBookingsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly bookingsService: SellerBookingsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveLaundryPartner(user);
    return this.bookingsService.list(seller.id);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveLaundryPartner(user);
    return this.bookingsService.getOne(seller.id, id);
  }

  /** Advances scheduled -> picked-up -> in-progress -> out-for-delivery -> delivered. */
  @Post(':id/advance')
  async advance(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const seller = await this.sellerService.resolveLaundryPartner(user);
    return this.bookingsService.advance(seller.id, id);
  }
}
