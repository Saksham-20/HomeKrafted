import { Module } from '@nestjs/common';
import { WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppInboundService } from './whatsapp-inbound.service';

/**
 * M9 — WhatsApp Cloud API. `WhatsAppService` (outbound sends, real-or-
 * stub) is exported for `SellerModule` (snack-order status advance) and
 * `NotificationsModule` (generic per-preference fan-out) to inject;
 * `WhatsAppInboundService` + the webhook controller stay local to this
 * module. `PrismaService` is available without importing `PrismaModule`
 * — it's `@Global()`.
 */
@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppInboundService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
