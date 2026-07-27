import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { LaundryService } from './laundry.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

/** Browse is anonymous per `lib/channel.ts` ("Browse web: yes") — service/availability reads are `@Public()`. Bookings + subscriptions are owner-scoped. */
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
   * Server-priced booking creation — `paymentMethod: "wallet"` debits +
   * credits cashback atomically with the insert (see
   * `LaundryService.createBooking`'s doc comment). Supports
   * `Idempotency-Key` so a retried/double-submitted click can't double-book
   * or double-debit.
   */
  @Post('bookings')
  createBooking(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateBookingDto,
    @IdempotencyKey() key?: string,
  ) {
    return this.laundryService.createBooking(user.userId, dto, key);
  }

  @Get('subscriptions')
  listSubscriptions(@CurrentUser() user: RequestUser) {
    return this.laundryService.listSubscriptions(user.userId);
  }

  @Get('subscriptions/:id')
  getSubscription(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.laundryService.getSubscriptionById(user.userId, id);
  }

  @Post('subscriptions')
  createSubscription(@CurrentUser() user: RequestUser, @Body() dto: CreateSubscriptionDto) {
    return this.laundryService.createSubscription(user.userId, dto);
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
