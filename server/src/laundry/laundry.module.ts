import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { LaundryController } from './laundry.controller';
import { LaundryService } from './laundry.service';

@Module({
  imports: [WalletModule, IdempotencyModule],
  controllers: [LaundryController],
  providers: [LaundryService],
  // Exported for `OrdersModule` — the unified `/orders/history` endpoint
  // merges in this module's bookings (see `order-history.util.ts`).
  exports: [LaundryService],
})
export class LaundryModule {}
