import { Module } from '@nestjs/common';
import { MealsModule } from '../meals/meals.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CorporateModule } from '../corporate/corporate.module';
import { NotificationProvidersModule } from '../notifications/providers/providers.module';
import { AdminAuditModule } from './audit.module';
import { SellerModule } from '../seller/seller.module';
import { AdminSettingsController } from './settings.controller';
import { AdminTaxonomyController } from './taxonomy.controller';
import { TaxonomySuggestionsService } from './taxonomy-suggestions.service';
import { PublicSettingsController } from './public-settings.controller';
import { PublicPincodesController } from './public-pincodes.controller';
import { SettingsModule } from './settings.module';
import { AdminExportsService } from './exports.service';
import { AdminAuditController } from './audit.controller';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { AdminSellersController } from './sellers.controller';
import { AdminSellersService } from './sellers.service';
import { SellerInviteService } from './seller-invite.service';
import { AdminCatalogController } from './catalog.controller';
import { AdminCatalogService } from './catalog.service';
import { ModerationNotificationsService } from './moderation-notifications.service';
import { AdminOrdersController } from './orders.controller';
import { AdminOrdersService } from './orders.service';
import { AdminPayoutsController } from './payouts.controller';
import { AdminPayoutsService } from './payouts.service';
import { AdminSupportController } from './support.controller';
import { AdminSupportService } from './support.service';
import { AdminWalletController } from './wallet.controller';
import { AdminWalletService } from './wallet.service';
import { AdminCollectionsController } from './collections.controller';
import { AdminCollectionsService } from './collections.service';
import { AdminCategoriesService } from './categories.service';
import { AdminAttributesService } from './attributes.service';
import { AdminRecategoriseService } from './recategorise.service';
import { AdminDashboardController } from './dashboard.controller';
import { AdminDashboardService } from './dashboard.service';
import { AdminCorporateController } from './corporate.controller';
import { AdminCorporateService } from './corporate.service';
import { AdminRiderZonesController } from './riders/zones.controller';
import { AdminRiderZonesService } from './riders/zones.service';
import { AdminRidersController } from './riders/riders.controller';
import { AdminRidersService } from './riders/riders.service';
import { AdminDeliveriesController } from './riders/deliveries.controller';
import { AdminDeliveriesService } from './riders/deliveries.service';
import { AdminRiderDepositsController } from './riders/deposits.controller';
import { AdminRiderDepositsService } from './riders/deposits.service';
import { AdminRiderPayoutsController } from './riders/payouts.controller';
import { AdminRiderPayoutsService } from './riders/payouts.service';
import { RiderModule } from '../rider/rider.module';

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
  // `CatalogModule` (M16) for `VendorProfileService` — the verification
  // panel shows the same trust/completion numbers the storefront does.
  imports: [
    // Provides `AdminAuditLogService` to the eleven services here that
    // still inject it directly. It is its own module so `WalletModule`
    // and `OrdersModule` can import it too — see `audit.module.ts`.
    AdminAuditModule,
    IdempotencyModule,
    WalletModule,
    OrdersModule,
    NotificationsModule,
    ReviewsModule,
    CatalogModule,
    // M44 — for `SellerListingsService`, the one owner of product
    // creation and editing, so the admin screens do not grow a second
    // copy of the write that drifts from the seller's. One-way:
    // `SellerModule` takes `AdminAuditLogService` directly rather than
    // importing this module, so there is no cycle.
    SellerModule,
    // M20 — for `CorporateQuotesService`. Quote *rules* live in the
    // corporate module beside the public accept path; only the admin
    // actions that drive them live here.
    CorporateModule,
    // M20 — `EmailProviderService`, so sending a quote actually emails the
    // link. Without it `sentAt` would be a claim nothing backed up, and
    // the token — returned exactly once and never stored — would be lost.
    // M37 — `MealPlanDayMenusService` for the audited menu-lock override.
    MealsModule,
    NotificationProvidersModule,
    // M37 — settings live in their own module so feature modules can
    // read them without importing all of AdminModule (cycle risk).
    SettingsModule,
    // R2 (docs/RIDER-APP.md) — `DeliveryJobsService` (manual despatch,
    // `POST /admin/deliveries`) and `DeliveryOrderReconcileService`
    // (`override-deliver`). One-way, same shape as `SellerModule` above:
    // `RiderModule` does not import `AdminModule`.
    RiderModule,
  ],
  controllers: [
    // Unauthenticated, unlike everything else here — see the controller's
    // own doc comment for why it lives in this module.
    PublicSettingsController,
    // Also unauthenticated, and here for the same reason: it reads the
    // serviced-area setting this module owns.
    PublicPincodesController,
    AdminDashboardController,
    AdminUsersController,
    AdminSellersController,
    AdminCatalogController,
    AdminOrdersController,
    AdminPayoutsController,
    AdminSupportController,
    AdminWalletController,
    AdminCollectionsController,
    AdminCorporateController,
    AdminAuditController,
    AdminSettingsController,
    AdminTaxonomyController,
    // R1 (docs/RIDER-APP.md) — rider fleet: zones + the onboarding review
    // queue. `riders` scope, its own controllers, same split every other
    // section of the panel uses. Wired here alongside `src/admin/riders/`
    // and `src/rider/` themselves in one commit — e7cc509 committed this
    // wiring while those directories were still untracked, which broke
    // `nest build` on a fresh clone (see `app.module.ts`'s matching note).
    AdminRiderZonesController,
    AdminRidersController,
    // R2 — the despatch queue (`/admin/deliveries`).
    AdminDeliveriesController,
    // R3 — cash & payouts (`/admin/rider-deposits`, `/admin/rider-payouts`).
    AdminRiderDepositsController,
    AdminRiderPayoutsController,
  ],
  providers: [
    AdminUsersService,
    AdminSellersService,
    SellerInviteService,
    AdminCatalogService,
    ModerationNotificationsService,
    AdminOrdersService,
    AdminPayoutsService,
    AdminSupportService,
    AdminWalletService,
    AdminCollectionsService,
    AdminCategoriesService,
    AdminAttributesService,
    AdminRecategoriseService,
    AdminCorporateService,
    AdminDashboardService,
    AdminExportsService,
    TaxonomySuggestionsService,
    AdminRiderZonesService,
    AdminRidersService,
    AdminDeliveriesService,
    AdminRiderDepositsService,
    AdminRiderPayoutsService,
  ],
})
export class AdminModule {}
