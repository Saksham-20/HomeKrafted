import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationProvidersModule } from './providers/providers.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsDeliveryService } from './notifications-delivery.service';

@Module({
  imports: [WhatsAppModule, NotificationProvidersModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsDeliveryService],
  // Exported so any module with an event worth notifying a user about
  // (wallet ledger, orders, laundry, snacks, admin actions) can inject
  // `NotificationsDeliveryService.deliver(...)` directly.
  exports: [NotificationsDeliveryService],
})
export class NotificationsModule {}
