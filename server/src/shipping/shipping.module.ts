import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminAuditModule } from '../admin/audit.module';
import { ShadowfaxClient } from './shadowfax.client';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { AdminShippingController } from './admin-shipping.controller';

/**
 * M57 — courier despatch.
 *
 * `ShippingService` is exported because `SellerModule` calls it when a
 * HomeKrafter marks an order packed. `OrdersModule` is imported for
 * `OrderNotificationsService`: every path that writes `Order.status` owes
 * the buyer a message (M18), and a carrier callback is now one of those
 * paths.
 *
 * The whole module is inert unless `SHADOWFAX_ENABLED=true` — the
 * controllers are always mounted (a callback arriving at a deployment
 * with the switch off should be refused with a sentence, not 404), but
 * nothing books, and no consignment row is ever created.
 */
@Module({
  imports: [PrismaModule, OrdersModule, AdminAuditModule],
  controllers: [ShippingController, AdminShippingController],
  providers: [ShadowfaxClient, ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
