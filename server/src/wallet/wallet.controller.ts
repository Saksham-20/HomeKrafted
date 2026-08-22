import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireAdminScope } from '../common/decorators/admin-scope.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { SetAutoTopupDto } from './dto/set-auto-topup.dto';
import { WalletService } from './wallet.service';

/**
 * Owner-scoped — every read/write here resolves the wallet from
 * `@CurrentUser()`, never from a route/body param, so a shopper can only
 * ever see/touch their own wallet. There is deliberately no public
 * `POST /wallet/topup`, `/pay`, `/earn-cashback`, or generic `/refund`
 * endpoint here — those would mean trusting a client-submitted amount for
 * an actual money movement. Real credits/debits only ever happen through:
 * `POST /payments/razorpay/order` + the verified webhook (top-up, order
 * cashback), `POST /orders/:id/pay` (wallet-pay an order — amount read
 * from the DB order), `POST /orders/:id/refund` (admin-gated, amount read
 * from the DB order). `adjust` below is the one intentional exception,
 * gated `@Roles('admin')`.
 *
 * **This comment used to be wrong, and the wrongness is why a bug lived
 * here.** `WalletService#maybeFireAutoTopupTx` was a second, ungated credit
 * path: any shopper could `PUT /wallet/auto-topup` with a large
 * `topupAmount` and mint real spendable balance on their next debit, with
 * no Razorpay charge behind it. Everyone reading this file was told the
 * invariant already held, so nobody checked it. Auto-top-up now credits
 * nothing and `setAutoTopup` refuses `enabled: true`. If you add a credit
 * path, update this comment in the same change or delete it — a comment
 * asserting an invariant the code does not hold is worse than none.
 */
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet(@CurrentUser() user: RequestUser) {
    return this.walletService.getWallet(user.userId);
  }

  @Get('transactions')
  getTransactions(@CurrentUser() user: RequestUser, @Query() query: ListTransactionsQueryDto) {
    return this.walletService.getTransactions(user.userId, query);
  }

  @Get('auto-topup')
  getAutoTopup(@CurrentUser() user: RequestUser) {
    return this.walletService.getAutoTopup(user.userId);
  }

  @Put('auto-topup')
  setAutoTopup(@CurrentUser() user: RequestUser, @Body() dto: SetAutoTopupDto) {
    return this.walletService.setAutoTopup(user.userId, dto);
  }

  @Post('adjust')
  @Roles('admin')
  // M47 — money. See `AdminScopeGuard`'s note on admin-only routes that
  // hang off consumer controllers.
  @RequireAdminScope('finance')
  adjust(@CurrentUser() user: RequestUser, @Body() dto: AdjustWalletDto, @IdempotencyKey() key?: string) {
    return this.walletService.adjust(user.userId, dto, key);
  }
}
