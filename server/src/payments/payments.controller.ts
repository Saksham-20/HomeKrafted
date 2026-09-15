import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateRazorpayOrderDto } from './dto/create-razorpay-order.dto';
import { VerifyRazorpayPaymentDto } from './dto/verify-razorpay-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments/razorpay')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * What this deployment can actually collect. `@Public()` because the
   * checkout screen needs it before a shopper has necessarily signed in,
   * and it discloses nothing — only whether a payment provider is
   * configured, never which keys.
   */
  @Public()
  @Get('config')
  config() {
    return { cardPaymentsEnabled: this.paymentsService.cardPaymentsEnabled() };
  }

  @Post('order')
  createOrder(@CurrentUser() user: RequestUser, @Body() dto: CreateRazorpayOrderDto) {
    return this.paymentsService.createOrder(user.userId, dto);
  }

  /**
   * Standard Checkout's "verify payment signature" step, called by the
   * browser with the three values from the success handler. Signed-in, and
   * scoped to the caller's own Razorpay order — see
   * `PaymentsService.verifyCheckout` for the checks. `200` whether the
   * payment is `captured` or still `pending` (the webhook finishes those);
   * a signature or amount mismatch is `400` and nothing is marked paid.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@CurrentUser() user: RequestUser, @Body() dto: VerifyRazorpayPaymentDto) {
    return this.paymentsService.verifyCheckout(user.userId, dto);
  }

  /**
   * Called by Razorpay's servers, not a signed-in shopper — `@Public()`
   * (bypasses `JwtAuthGuard`) and `@SkipThrottle()` (a burst of legitimate
   * retries from Razorpay shouldn't trip the same per-IP limit a browser
   * client would). Authentication here is entirely the HMAC signature
   * check inside `PaymentsService.handleWebhook` — everything about this
   * request is untrusted until that passes.
   *
   * Needs the **raw** body bytes (`req.rawBody`), not the parsed JSON —
   * wired globally via `NestFactory.create(AppModule, { rawBody: true })`
   * in `main.ts`, which still parses `req.body` normally for every route
   * while additionally stashing the raw buffer for this one to use.
   */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable — check main.ts rawBody wiring');
    }
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }
}
