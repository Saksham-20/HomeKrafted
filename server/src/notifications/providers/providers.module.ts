import { Module } from '@nestjs/common';
import { SmsProviderService } from './sms.provider';
import { EmailProviderService } from './email.provider';

/**
 * Shared, credential-only provider clients — split out from
 * `NotificationsModule` so `AuthModule` can also inject
 * `SmsProviderService` for real OTP delivery without importing the
 * entire notifications feature (inbox, preferences, delivery fan-out).
 */
@Module({
  providers: [SmsProviderService, EmailProviderService],
  exports: [SmsProviderService, EmailProviderService],
})
export class NotificationProvidersModule {}
