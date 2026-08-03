import { Module } from '@nestjs/common';
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
  imports: [IdempotencyModule, WhatsAppModule, CatalogModule, OrdersModule],
  controllers: [
    SellerController,
    SellerListingsController,
    SellerOrdersController,
    SellerReviewsController,
    SellerBookingsController,
    SellerMenuController,
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
    SellerSnackOrdersService,
    SellerPayoutsService,
    SellerProfileService,
    SellerAnalyticsService,
  ],
})
export class SellerModule {}
