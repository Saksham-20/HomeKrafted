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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ message: string }> {
    await this.authService.requestOtp(dto.phone);
    return { message: 'OTP sent (check server logs in dev — SMS provider is a stub until real Twilio creds are set)' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResult> {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
