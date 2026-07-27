import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { WalletModule } from './wallet/wallet.module';
import { PaymentsModule } from './payments/payments.module';
import { LaundryModule } from './laundry/laundry.module';
import { SnacksModule } from './snacks/snacks.module';
import { ReferralsModule } from './referrals/referrals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { CorporateModule } from './corporate/corporate.module';
import { SellerModule } from './seller/seller.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL_SECONDS ?? '60', 10) * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
          },
        ],
      }),
    }),
    // Registered here (not just inside AuthModule) because the global
    // JwtAuthGuard below is provided at the AppModule level and needs
    // JwtService in its own module's DI scope to resolve.
    JwtModule.register({}),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    // M8.1 (commerce): catalog (public reads) + reviews/wishlist/cart/orders
    // (owner-scoped) — each following the same controller/service/dto shape
    // as AuthModule/UsersModule, gated by the same global JwtAuthGuard +
    // RolesGuard. M8.3 (laundry/snacks/seller/admin) adds its feature
    // modules here the same way.
    CatalogModule,
    ReviewsModule,
    WishlistModule,
    CartModule,
    OrdersModule,
    // M8.2 (wallet/Razorpay): server-authoritative wallet ledger +
    // Razorpay order/webhook integration. PaymentsModule depends on both
    // WalletModule (credit a verified top-up/cashback) and OrdersModule
    // (transition an order pending_payment -> placed on capture).
    WalletModule,
    PaymentsModule,
    // M8.3a (services): laundry (public reads + owner-scoped bookings/
    // subscriptions, server-priced, wallet-pay via the M8.2 ledger),
    // snacks (public menu read only — ordering is WhatsApp-only, M9),
    // referrals/loyalty, notifications, support, corporate — each
    // following the same controller/service/dto/mapper shape as every
    // module above. `OrdersModule` (already imported) depends on
    // `LaundryModule` to merge bookings into `GET /orders/history`.
    LaundryModule,
    SnacksModule,
    ReferralsModule,
    NotificationsModule,
    SupportModule,
    CorporateModule,
    // M8.3b (seller portal) — owner-scoped endpoints for all 3 seller
    // types (maker/laundry/snack) + payouts, gated by `@Roles('seller')`
    // plus per-request ownership re-derivation from the JWT (never a
    // client-supplied id). M8.3c (admin) adds an unscoped counterpart.
    SellerModule,
    // M8.3c (admin panel) — the unscoped counterpart to SellerModule:
    // dashboard/analytics, user + seller directory (suspend, approval
    // queue), catalog/review moderation, unified orders oversight +
    // refunds, wallet oversight, collections CMS, and the audit log every
    // mutation above writes to. `@Roles('admin')` on every route.
    AdminModule,
  ],
  providers: [
    // Order matters: Nest runs APP_GUARDs in registration order, and
    // RolesGuard reads `request.user`, which JwtAuthGuard sets — so
    // JwtAuthGuard must run first.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
