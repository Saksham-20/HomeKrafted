import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SocialProvider } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthService,
  AuthResult,
  ContinueResult,
  SocialProviderConfig,
  TokenPair,
} from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ContinueDto } from './dto/continue.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

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
   * The single-field form's one endpoint (M25) — signs in or signs up
   * from an identifier plus a password. See
   * `AuthService.continueWithPassword` for the four outcomes and why the
   * "no password set" case is a 409 rather than a 401.
   *
   * `register` and `login` above are untouched and still work: the native
   * apps call them, and this is an addition rather than a replacement.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('continue')
  continueWithPassword(@Body() dto: ContinueDto): Promise<ContinueResult> {
    return this.authService.continueWithPassword(dto);
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

  /**
   * Change the password of the account you are signed in as.
   *
   * Not `@Public()` — this is the one password path that proves identity
   * with a session plus the current password rather than with a token
   * from an email. It is also the exit from `mustChangePassword`, so it
   * is on `JwtAuthGuard`'s tiny exempt list; everything else stays shut
   * until it succeeds.
   *
   * Returns a fresh token pair: the change revokes every existing
   * session, including any opened with an admin-issued temporary
   * password, and the caller has to swap to tokens that outlive it.
   */
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password/change')
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthResult> {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    const kind = await this.authService.requestOtp(dto);
    return {
      message:
        kind === 'phone'
          ? 'If that number can receive messages, a code is on its way.'
          : 'If that address can receive mail, a code is on its way.',
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResult> {
    return this.authService.verifyOtp(dto);
  }

  /**
   * Which social providers are actually usable, and their public client ids.
   *
   * Deliberately **not** `@Throttle`d down to the auth budget. The sign-in
   * page reads this on every render, and that budget is per-IP — a whole
   * office behind one NAT would burn 20/minute just loading the page, and
   * the symptom (sign-in buttons vanishing at random) points nowhere near
   * the cause. Read server-side by `app/login/page.tsx`; the app-wide
   * throttler still applies.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Get('social/config')
  socialConfig(): Record<string, SocialProviderConfig> {
    return this.authService.socialConfig();
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
