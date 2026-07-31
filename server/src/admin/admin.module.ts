import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { AdminAuditLogService } from './audit-log.service';
import { AdminAuditController } from './audit.controller';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { AdminSellersController } from './sellers.controller';
import { AdminSellersService } from './sellers.service';
import { AdminCatalogController } from './catalog.controller';
import { AdminCatalogService } from './catalog.service';
import { AdminOrdersController } from './orders.controller';
import { AdminOrdersService } from './orders.service';
import { AdminPayoutsController } from './payouts.controller';
import { AdminPayoutsService } from './payouts.service';
import { AdminWalletController } from './wallet.controller';
import { AdminWalletService } from './wallet.service';
import { AdminCollectionsController } from './collections.controller';
import { AdminCollectionsService } from './collections.service';
import { AdminDashboardController } from './dashboard.controller';
import { AdminDashboardService } from './dashboard.service';

/**
 * M8.3c — the unscoped admin-panel API surface, the inverse of
 * `SellerModule` (M8.3b): every controller here is `@Roles('admin')` and
 * every read spans *every* user/seller/order rather than being scoped to
 * a caller's own resource. Every mutation writes an `AdminAuditLog` row
 * (`AdminAuditLogService`) after it succeeds — see `docs/API.md`'s
 * "Admin panel (M8.3c)" section for the full endpoint contract and
 * `README.md`'s curl walkthrough for the RBAC-403 + audit-trail proofs.
 * Money actions (`AdminOrdersService.refund`, `AdminWalletService.adjust`/
 * `issueRefund`) funnel through `WalletModule`'s `WalletService` — never
 * a raw balance write — and `AdminOrdersService.refund` for marketplace
 * orders reuses `OrdersModule`'s `OrdersService.refundOrder` directly
 * rather than re-implementing it.
 */
@Module({
  imports: [IdempotencyModule, WalletModule, OrdersModule, NotificationsModule, ReviewsModule],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminSellersController,
    AdminCatalogController,
    AdminOrdersController,
    AdminPayoutsController,
    AdminWalletController,
    AdminCollectionsController,
    AdminAuditController,
  ],
  providers: [
    AdminAuditLogService,
    AdminUsersService,
    AdminSellersService,
    AdminCatalogService,
    AdminOrdersService,
    AdminPayoutsService,
    AdminWalletService,
    AdminCollectionsService,
    AdminDashboardService,
  ],
})
export class AdminModule {}
