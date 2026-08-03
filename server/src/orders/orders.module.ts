import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { LaundryModule } from '../laundry/laundry.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderNotificationsService } from './order-notifications.service';

@Module({
  imports: [WalletModule, IdempotencyModule, LaundryModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderNotificationsService],
  // Exported for `PaymentsModule` — the Razorpay webhook transitions a
  // `pending_payment` order to `placed` via `markPaidByRazorpayTx`.
  // `OrderNotificationsService` is exported because the seller portal and
  // the admin panel also move an order between statuses — every path that
  // writes `Order.status` owes the buyer a message, and there is one place
  // that copy lives.
  exports: [OrdersService, OrderNotificationsService],
})
export class OrdersModule {}
