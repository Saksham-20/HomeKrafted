import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { MealPlansController } from './meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MealSubscriptionsController } from './meal-subscriptions.controller';
import { MealSubscriptionsService } from './meal-subscriptions.service';

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
  imports: [WalletModule, IdempotencyModule],
  controllers: [MealPlansController, MealSubscriptionsController],
  providers: [MealPlansService, MealSubscriptionsService],
  exports: [MealPlansService, MealSubscriptionsService],
})
export class MealsModule {}
