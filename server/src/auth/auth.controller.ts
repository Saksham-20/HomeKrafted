import { Body, Controller, HttpCode, HttpStatus, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SocialProvider } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { AuthService, AuthResult, TokenPair } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * Brute-force budget for the auth routes, from `THROTTLE_AUTH_LIMIT` /
 * `THROTTLE_AUTH_TTL_SECONDS`.
 *
 * These were hardcoded to `5 / 60s`, which made both env vars dead config:
 * `configuration.ts` read them, nothing consumed them, and raising them in
 * `.env` changed nothing. Worth keeping in mind when tuning: the throttler
 * keys on client IP, so everyone behind one office NAT shares this budget.
 *
 * Evaluated once, when this module is first imported — which is why
 * `main.ts` loads `dotenv/config` before pulling in `AppModule`, so
 * `process.env` is already populated by the time this runs.
 */
const AUTH_THROTTLE = {
  default: {
    limit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '20', 10),
    ttl: parseInt(process.env.THROTTLE_AUTH_TTL_SECONDS ?? '60', 10) * 1000,
  },
};

/**
 * All routes here are `@Public()` (no access token required to reach
 * them — that's the point of an auth endpoint) but still sit behind the
 * app-wide `ThrottlerGuard`; `@Throttle` tightens the default limit
 * further on the routes most worth protecting from brute force
 * (login/OTP/register).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  /**
   * Always 200 with the same body, hit or miss.
   *
   * A different answer for a known and an unknown address makes this an
   * account-existence oracle — "is this person a Homekrafted customer" for
   * anyone who can POST. The cost is that a typo looks like a success;
   * that is the right trade, and the copy says "if an account exists"
   * rather than "sent" for exactly that reason.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If an account exists for that email, a reset link is on its way.',
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password updated. Sign in with your new password.' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    await this.authService.requestOtp(dto.phone);
    return { message: 'OTP sent (check server logs in dev — SMS provider is a stub until real Twilio creds are set)' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResult> {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('social/:provider')
  socialLogin(
    @Param('provider', new ParseEnumPipe(SocialProvider)) provider: SocialProvider,
    @Body() dto: SocialLoginDto,
  ): Promise<AuthResult> {
    return this.authService.socialLogin(provider, dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
