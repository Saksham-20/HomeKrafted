import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { LaundryModule } from '../laundry/laundry.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [WalletModule, IdempotencyModule, LaundryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  // Exported for `PaymentsModule` — the Razorpay webhook transitions a
  // `pending_payment` order to `placed` via `markPaidByRazorpayTx`.
  exports: [OrdersService],
})
export class OrdersModule {}
