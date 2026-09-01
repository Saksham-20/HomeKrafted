import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CallbackBody, ShippingService } from './shipping.service';
import { ServiceabilityQueryDto } from './dto/shipping.dto';

/**
 * A carrier legitimately bursts — a batch of parcels scanned into one hub
 * fires a callback each, in the same second. 600/minute is well above any
 * real burst this platform will produce and well below what an attacker
 * needs to be useful, given the endpoint has no HMAC to hide behind.
 *
 * Deliberately **not** `@SkipThrottle()`, which is what the Razorpay
 * webhook does. That is safe there because a forged request dies on the
 * signature check before touching anything; here the only credential is a
 * shared header value, so an unthrottled endpoint is an unmetered
 * guessing surface against it.
 */
const CALLBACK_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

/**
 * A public read that proxies to a third party we pay per call, so it gets
 * a tighter limit than the app default — otherwise it is an amplifier
 * pointed at our own carrier quota.
 */
const SERVICEABILITY_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  /**
   * "Do we deliver to this pincode?" — asked by checkout before a buyer
   * commits to an address.
   *
   * `@Public()` because it is asked before sign-in and discloses nothing
   * about anybody. Note this is a **carrier coverage** question and is not
   * the M12 delivery-radius gate: a `false` here must never be turned into
   * an empty catalogue or a blocked checkout, because location is never a
   * gate on this platform and an unserviceable pincode simply means the
   * kitchen hands the parcel over itself.
   */
  @Public()
  @Throttle(SERVICEABILITY_THROTTLE)
  @Get('serviceability')
  serviceability(@Query() query: ServiceabilityQueryDto) {
    return this.shipping.checkServiceability(query.pincode);
  }

  /**
   * Shadowfax's PUSH callback.
   *
   * `@Public()` because it is called by a carrier's servers, not a
   * signed-in user — every byte of it is untrusted until
   * `assertCallbackAuthorised` passes, and even then the most it can do is
   * move a parcel forward (see `ShippingService`'s rule 1).
   *
   * Always answers `200` on anything it has accepted, including an AWB it
   * does not recognise and a status id it cannot map. A carrier that
   * receives an error retries the same delivery indefinitely, and neither
   * of those is a condition a retry fixes.
   */
  @Public()
  @Throttle(CALLBACK_THROTTLE)
  @Post('shadowfax/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Req() req: Request,
    @Body() body: CallbackBody,
    @Headers('authorization') authorization?: string,
  ) {
    this.shipping.assertCallbackAuthorised(authorization);
    // A body that is not a JSON object at all — an array, a bare string —
    // parses fine and then reads every field as `undefined`, which the
    // parser would report as "needs awb_number". Named for what it is.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Callback body must be a JSON object.');
    }
    // Guard the events table against a body nobody meant to send. The
    // whole payload is stored, so an unbounded one is an unbounded row.
    const size = Number(req.headers['content-length'] ?? 0);
    if (size > 64 * 1024) {
      throw new BadRequestException('Callback body is too large.');
    }
    return this.shipping.handleCallback(body);
  }

  /**
   * The buyer's own parcels for one of their orders.
   *
   * Scoped by `OrdersService`-style ownership inside the service rather
   * than trusting the path — and it returns the carrier's AWB, status and
   * (once a rider is assigned) their name and number, which is what a
   * person waiting for food actually wants. It never returns the pickup
   * address: that is the kitchen's home (M36b).
   */
  @Get('orders/:orderId')
  forOrder(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.shipping.forOrderAsBuyer(user.userId, orderId);
  }
}
