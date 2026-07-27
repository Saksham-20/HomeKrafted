import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [IdempotencyModule],
  controllers: [WalletController],
  providers: [WalletService],
  // Exported for `OrdersModule` (wallet-pay/refund an order) and
  // `PaymentsModule` (credit a verified top-up / order cashback).
  exports: [WalletService],
})
export class WalletModule {}
