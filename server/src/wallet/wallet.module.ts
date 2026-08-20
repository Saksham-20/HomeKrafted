import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin/audit.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  // `AdminAuditModule`, not `AdminModule` — importing the latter would be
  // a cycle, since it imports this one. `POST /wallet/adjust` is
  // `@Roles('admin')` and moves money, so it owes an audit row exactly
  // like its `/admin/wallet/:userId/adjust` twin.
  imports: [AdminAuditModule, IdempotencyModule],
  controllers: [WalletController],
  providers: [WalletService],
  // Exported for `OrdersModule` (wallet-pay/refund an order) and
  // `PaymentsModule` (credit a verified top-up / order cashback).
  exports: [WalletService],
})
export class WalletModule {}
