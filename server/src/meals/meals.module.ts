import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../admin/settings.module';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MealSubscriptionsController } from './meal-subscriptions.controller';
import { MealSubscriptionsService } from './meal-subscriptions.service';
import { MealPlanDayMenusService } from './day-menus.service';
import { MealBlackoutCascadeService } from './blackout-cascade.service';

/**
 * Meal subscriptions (M19) — the recurring product the platform did not
 * have, and the replacement for `LaundrySubscription`, which recorded intent
 * and produced nothing before laundry was withdrawn.
 *
 * `WalletModule` is imported for `postLedgerEntryTx`: a cycle is prepaid in
 * one debit and there is no background charging, so the wallet is the only
 * payment surface this module touches.
 */
@Module({
  // `SettingsModule` for the menu lock time, `NotificationsModule` for the
  // `meals`-category lifecycle + menu-change messages (M37). Importing
  // `AdminModule` instead would cycle (Admin → Catalog → Meals), which is
  // exactly what `SettingsModule` exists to avoid.
  imports: [WalletModule, IdempotencyModule, NotificationsModule, SettingsModule],
  controllers: [MealPlansController, MealSubscriptionsController],
  providers: [
    MealPlansService,
    MealSubscriptionsService,
    MealPlanDayMenusService,
    MealBlackoutCascadeService,
  ],
  exports: [
    MealPlansService,
    MealSubscriptionsService,
    MealPlanDayMenusService,
    MealBlackoutCascadeService,
  ],
})
export class MealsModule {}
