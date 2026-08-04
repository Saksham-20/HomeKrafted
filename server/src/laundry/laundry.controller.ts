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
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { LaundryService } from './laundry.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

/**
 * Browse is anonymous per `lib/channel.ts` — service/availability reads are
 * `@Public()`. Bookings + subscriptions are owner-scoped.
 *
 * **M19: laundry is withdrawn, and the two CREATE routes are gone (410).**
 *
 * Removing the web entry points alone would have been the worst of both
 * worlds: `POST /laundry/bookings` was reachable by any signed-in consumer
 * and `/seller/pickups` was going to 404, so a booking could still be
 * created that **no HomeKrafter could ever see**. Both halves move
 * together — no new work arrives, and the fulfilment screen stays
 * reachable so work already in flight can be finished.
 *
 * Reads stay live so existing bookings keep rendering in order history,
 * and `PATCH`/`DELETE` on a subscription stay so anyone with one can still
 * change or cancel it. Cancelling something you are no longer allowed to
 * create must never be the thing that breaks.
 */
@Controller('laundry')
export class LaundryController {
  constructor(private readonly laundryService: LaundryService) {}

  @Public()
  @Get('services')
  listServices() {
    return this.laundryService.listServices();
  }

  @Public()
  @Get('services/:slug')
  getService(@Param('slug') slug: string) {
    return this.laundryService.getServiceBySlug(slug);
  }

  @Public()
  @Get('availability/days')
  listDays() {
    return this.laundryService.listDays();
  }

  @Public()
  @Get('availability/slots')
  listSlots() {
    return this.laundryService.listSlots();
  }

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
   * deserves to be told which of those happened.
   *
   * `LaundryService.createBooking` is deliberately left intact — it is the
   * server-priced, wallet-debiting, idempotent path, and rebuilding it
   * later is a worse outcome than leaving it unreferenced here.
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
