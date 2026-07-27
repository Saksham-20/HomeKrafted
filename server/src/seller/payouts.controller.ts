import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerPayoutsService } from './payouts.service';

/** All 3 seller types — payout history + pending balance, and requesting a new payout. */
@Controller('seller/payouts')
@Roles('seller')
export class SellerPayoutsController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly payoutsService: SellerPayoutsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const seller = await this.sellerService.resolveSeller(user);
    return this.payoutsService.list(seller);
  }

  /** Computes the pending balance server-side and records a new `pending` `Payout` — 409 if one is already pending, 400 if there's nothing to pay out. Supports `Idempotency-Key`. */
  @Post('request')
  async request(@CurrentUser() user: RequestUser, @IdempotencyKey() key?: string) {
    const seller = await this.sellerService.resolveSeller(user);
    return this.payoutsService.requestPayout(seller, key);
  }
}
