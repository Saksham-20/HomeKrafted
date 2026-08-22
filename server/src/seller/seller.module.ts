import { Module } from '@nestjs/common';
import { MealsModule } from '../meals/meals.module';
import { SettingsModule } from '../admin/settings.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';
import { SellerListingsController } from './listings.controller';
import { SellerListingsService } from './listings.service';
import { SellerOrdersController } from './orders.controller';
import { SellerOrdersService } from './orders.service';
import { SellerReviewsController } from './reviews.controller';
import { SellerReviewsService } from './reviews.service';
import { SellerBookingsController } from './bookings.controller';
import { SellerBookingsService } from './bookings.service';
import { SellerMenuController } from './menu.controller';
import { SellerMenuService } from './menu.service';
import { SellerMealPlansController } from './meal-plans.controller';
import { SellerMealPlansService } from './meal-plans.service';
import { SellerSnackOrdersController } from './snack-orders.controller';
import { SellerSnackOrdersService } from './snack-orders.service';
import { SellerPayoutsController } from './payouts.controller';
import { SellerPayoutsService } from './payouts.service';
import { SellerProfileController } from './profile.controller';
import { SellerProfileService } from './profile.service';
import { CatalogModule } from '../catalog/catalog.module';
import { SellerAnalyticsController } from './analytics.controller';
import { SellerAnalyticsService } from './analytics.service';
import { OrdersModule } from '../orders/orders.module';
import { AdminAuditLogService } from '../admin/audit-log.service';

/**
 * M8.3b — the owner-scoped seller-portal API for all 3 seller types
 * (maker/laundry/snack) + payouts. Every controller here is
 * `@Roles('seller')` and every read/write is scoped via `SellerService`'s
 * `resolveSeller`/`resolveMaker`/`resolveLaundryPartner`/
 * `resolveSnackSeller` — the JWT's `sellerId` claim (minted server-side at
 * login, never client-supplied), re-verified against a live `Seller` row
 * on every call. See `docs/API.md`'s "Seller portal (M8.3b)" section for
 * the full endpoint contract and `README.md`'s curl walkthrough for the
 * cross-seller-isolation proofs.
 */
@Module({
  // `CatalogModule` for `VendorProfileService` — the seller editor shows the
  // same trust/completion computation the public storefront renders, so it
  // reuses that service rather than keeping a second copy of the rules.
  // `OrdersModule` for `OrderNotificationsService` — advancing an order
  // here has to tell the buyer, and that copy lives in one place.
  imports: [
    IdempotencyModule,
    WhatsAppModule,
    CatalogModule,
    OrdersModule,
    // M37 — `MealPlanDayMenusService` for the dated-menu editor routes.
    MealsModule,
    // M37 — the commission rate on /seller/me + the payout split.
    SettingsModule,
  ],
  controllers: [
    SellerController,
    SellerListingsController,
    SellerOrdersController,
    SellerReviewsController,
    SellerBookingsController,
    SellerMenuController,
    SellerMealPlansController,
    SellerSnackOrdersController,
    SellerPayoutsController,
    SellerProfileController,
    SellerAnalyticsController,
  ],
  providers: [
    SellerService,
    SellerListingsService,
    SellerOrdersService,
    SellerReviewsService,
    SellerBookingsService,
    SellerMenuService,
    SellerMealPlansService,
    SellerSnackOrdersService,
    SellerPayoutsService,
    SellerProfileService,
    SellerAnalyticsService,
    // For the self-set kitchen pin (`PATCH /seller/profile/coords`) —
    // same stateless-two-instances reasoning as `SettingsModule`'s
    // provider comment; its only dependency is the global PrismaService.
    AdminAuditLogService,
  ],
  // M44 — `AdminCatalogService` writes listings through this service so
  // there is one owner of product creation and editing rather than two
  // that drift. The import direction is one-way: `SellerModule` does not
  // import `AdminModule` (it takes `AdminAuditLogService` directly), so
  // this does not make a cycle.
  exports: [SellerListingsService],
})
export class SellerModule {}
