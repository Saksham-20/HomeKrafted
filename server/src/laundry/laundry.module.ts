import { Module } from '@nestjs/common';
import { LaundryController } from './laundry.controller';
import { LaundryService } from './laundry.service';

@Module({
  controllers: [LaundryController],
  providers: [LaundryService],
  // Exported for `OrdersModule` — the unified `/orders/history` endpoint
  // merges in this module's bookings (see `order-history.util.ts`).
  exports: [LaundryService],
})
export class LaundryModule {}
