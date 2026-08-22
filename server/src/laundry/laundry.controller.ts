import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { LaundryService } from './laundry.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

/**
 * **M19: laundry is withdrawn; M37 removed the anonymous browse routes
 * too.** The four `@Public()` service/availability reads served a
 * catalogue nobody could act on — the create routes have answered 410
 * since M19 — so a withdrawn module was still publishing a browsable
 * price list. What remains is exactly what existing customers need:
 *
 * Reads stay live so existing bookings keep rendering in order history,
 * and `PATCH`/`DELETE` on a subscription stay so anyone with one can still
 * change or cancel it. Cancelling something you are no longer allowed to
 * create must never be the thing that breaks. The create routes stay as
 * `410 Gone` stubs rather than vanishing — a native client built against
 * `docs/API.md` deserves to be told the product was retired, not that
 * the route never existed.
 */
@Controller('laundry')
export class LaundryController {
  constructor(private readonly laundryService: LaundryService) {}

  @Get('bookings')
  listBookings(@CurrentUser() user: RequestUser) {
    return this.laundryService.listBookings(user.userId);
  }

  @Get('bookings/:id')
  getBooking(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.laundryService.getBookingById(user.userId, id);
  }

  /**
   * Withdrawn (M19). `410 Gone` rather than `404`: the route existed, the
   * product was retired, and a native client built against `docs/API.md`
   * deserves to be told which of those happened. The service-side create
   * path was deleted in M37 — it had been unreferenced since M19, and
   * dead money-moving code is a liability, not an asset.
   */
  @Post('bookings')
  createBooking(): never {
    throw new GoneException('Laundry bookings are no longer available on Homekrafted.');
  }

  @Get('subscriptions')
  listSubscriptions(@CurrentUser() user: RequestUser) {
    return this.laundryService.listSubscriptions(user.userId);
  }

  @Get('subscriptions/:id')
  getSubscription(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.laundryService.getSubscriptionById(user.userId, id);
  }

  /** Withdrawn (M19), same reasoning as `POST bookings` above. */
  @Post('subscriptions')
  createSubscription(): never {
    throw new GoneException('Laundry subscriptions are no longer available on Homekrafted.');
  }

  @Patch('subscriptions/:id')
  updateSubscription(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.laundryService.updateSubscription(user.userId, id, dto);
  }

  /** Soft-cancel (`active: false`) — see `LaundryService.cancelSubscription`. */
  @Delete('subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelSubscription(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    await this.laundryService.cancelSubscription(user.userId, id);
  }
}
