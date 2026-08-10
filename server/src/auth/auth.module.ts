import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationProvidersModule } from '../notifications/providers/providers.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SocialTokenVerifier } from './social-token-verifier';

@Module({
  // `NotificationProvidersModule` (not the whole `NotificationsModule`)
  // so `OtpService` can send real OTP SMS via `SmsProviderService`
  // without depending on the inbox/preferences feature.
  imports: [JwtModule.register({}), NotificationProvidersModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService, SocialTokenVerifier],
  exports: [AuthService],
})
export class AuthModule {}
