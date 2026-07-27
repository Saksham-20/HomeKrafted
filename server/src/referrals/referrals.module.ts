import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReferralsController } from './referrals.controller';
import { LoyaltyController } from './loyalty.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [WalletModule, IdempotencyModule],
  controllers: [ReferralsController, LoyaltyController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
