import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayClient } from './razorpay.client';

@Module({
  imports: [WalletModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayClient],
})
export class PaymentsModule {}
