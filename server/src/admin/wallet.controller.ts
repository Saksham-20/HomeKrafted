import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../common/decorators/idempotency-key.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AdminWalletService } from './wallet.service';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { AdminIssueRefundDto } from './dto/admin-issue-refund.dto';

/** Platform-wide wallet oversight — any user's wallet, unscoped. Every mutation still funnels through `WalletService`'s row-locked ledger primitives (see `AdminWalletService`'s doc comment) — never a raw balance write. */
@Controller('admin/wallet')
@Roles('admin')
export class AdminWalletController {
  constructor(private readonly walletService: AdminWalletService) {}

  @Get()
  getOverview() {
    return this.walletService.getOverview();
  }

  @Get(':userId')
  getUserWallet(@Param('userId') userId: string) {
    return this.walletService.getUserWallet(userId);
  }

  @Post(':userId/adjust')
  adjust(
    @CurrentUser() admin: RequestUser,
    @Param('userId') userId: string,
    @Body() dto: AdminAdjustWalletDto,
    @IdempotencyKey() key?: string,
  ) {
    return this.walletService.adjust(admin.userId, userId, dto, key);
  }

  @Post(':userId/refund')
  issueRefund(
    @CurrentUser() admin: RequestUser,
    @Param('userId') userId: string,
    @Body() dto: AdminIssueRefundDto,
    @IdempotencyKey() key?: string,
  ) {
    return this.walletService.issueRefund(admin.userId, userId, dto, key);
  }
}
