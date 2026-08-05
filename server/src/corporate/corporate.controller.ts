import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CorporateService } from './corporate.service';
import { CorporateQuotesService } from './corporate-quotes.service';
import { CreateCorporateInquiryDto } from './dto/create-corporate-inquiry.dto';
import { AcceptQuoteDto } from './dto/quote.dto';

/**
 * The public corporate surface: the intake form, and the quote a
 * procurement manager opens from an emailed link.
 *
 * **These are JSON endpoints, not a web page.** The Next route at
 * `/corporate/quote/[token]` is one client of them; a native app is
 * another. Specifying the flow as a page would have made
 * `acceptedName`/`acceptedAt` meaningless to anything else.
 *
 * `@Public()` only skips `JwtAuthGuard`. This controller carries no
 * class-level `@Roles`, so `RolesGuard` finds no metadata and lets these
 * through — the admin routes live on their own controller for exactly
 * that reason.
 */
@Controller()
export class CorporateController {
  constructor(
    private readonly corporateService: CorporateService,
    private readonly quotes: CorporateQuotesService,
  ) {}

  /**
   * Throttled at the same 5/60s as `POST /seller-applications`, its
   * sibling public intake. It sat on the global 120/min/IP while fanning
   * out a notification per admin per channel.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('corporate-inquiries')
  create(@Body() dto: CreateCorporateInquiryDto) {
    return this.corporateService.create(dto);
  }

  /**
   * Reading a quote.
   *
   * On the app-wide 120/min/IP rather than a tighter custom limit. The
   * protection here is 256 bits of entropy in the token — at that size a
   * rate limit changes an unreachable brute force into a marginally more
   * unreachable one, while a real burst is ordinary: a forwarded link
   * opened by three people at once, or a page reloaded.
   *
   * Always **200** for a resolvable token, with the state
   * in the body — `valid`, `accepted`, `expired`, `declined`. Only
   * not-found and revoked 404, and they are indistinguishable, so a token
   * cannot be probed for existence.
   *
   * "Already accepted" is a normal state rather than an error: clicking an
   * emailed link twice is the ordinary case for a forwarded quote.
   */
  @Public()
  @Get('corporate/quotes/:token')
  getQuote(@Param('token') token: string) {
    return this.quotes.getByToken(token);
  }

  /**
   * Accepting. **A POST, never a GET** — the emailed link opens the page,
   * and a link prefetcher or an email-security scanner must not be able to
   * accept a ₹50,000 order by following it.
   *
   * No CSRF token: a native client cannot obtain a cookie-based one, and
   * the protection here is the unguessable token plus the typed-name
   * confirmation.
   *
   * Deliberately **not** throttled below the app-wide default. Accepting
   * requires already holding a valid token, so a tighter limit buys
   * nothing the read limit does not — and it would break the honest case
   * this is built for: a link forwarded to finance and opened twice at
   * once. The duplicate is handled by the conditional claim, not by
   * refusing the second request.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('corporate/quotes/:token/accept')
  async accept(@Param('token') token: string, @Body() dto: AcceptQuoteDto) {
    const { quote } = await this.quotes.accept(token, dto.acceptedName);
    return quote;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('corporate/quotes/:token/decline')
  async decline(@Param('token') token: string) {
    const { quote } = await this.quotes.decline(token);
    return quote;
  }
}
