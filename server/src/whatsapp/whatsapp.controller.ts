import { BadRequestException, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, RawBodyRequest, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AppConfig } from '../config/configuration';
import { WhatsAppInboundService } from './whatsapp-inbound.service';
import { verifyMetaSignature } from './whatsapp-signature.util';

/**
 * Meta's WhatsApp Cloud API webhook — mirrors `PaymentsController`'s
 * Razorpay webhook pattern: `@Public()` (Meta's servers, not a signed-in
 * user) + `@SkipThrottle()` (legitimate delivery retries shouldn't trip
 * the per-IP limit), with everything about the request's authenticity
 * resting on `verifyMetaSignature` inside `POST`, not on Nest's own
 * guards.
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly inbound: WhatsAppInboundService,
  ) {}

  /**
   * Meta's one-time subscription verification handshake (run once when
   * the webhook URL is registered in the App Dashboard, and again any
   * time the subscription is re-verified): echoes back `hub.challenge`
   * only if `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` exactly.
   */
  @Public()
  @SkipThrottle()
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = this.config.get('whatsapp.verifyToken', { infer: true });
    if (mode === 'subscribe' && challenge && expected && verifyToken === expected) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).send('verification failed');
  }

  /**
   * Inbound messages + outbound delivery/read statuses. Needs the
   * **raw** body bytes (`req.rawBody`, wired globally in `main.ts`) to
   * verify `X-Hub-Signature-256` before trusting anything — an invalid
   * or missing signature is rejected `400` with nothing parsed or acted
   * on (no `SnackOrder` write, no state change of any kind).
   */
  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<{ received: boolean }> {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable — check main.ts rawBody wiring');
    }

    const appSecret = this.config.get('whatsapp.appSecret', { infer: true });
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }

    await this.inbound.handle(payload);
    return { received: true };
  }
}
