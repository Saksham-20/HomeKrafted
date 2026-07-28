import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

export interface SmsSendResult {
  /** `true` when this was a logged stub (placeholder creds), not a real send. */
  mock: boolean;
  sid?: string;
}

const PLACEHOLDER_SID = 'placeholder_account_sid';
const PLACEHOLDER_TOKEN = 'placeholder_auth_token';

/**
 * SMS delivery — Twilio's REST API shape (Basic-auth over `Account SID :
 * Auth Token`, form-encoded body against `Messages.json`). MSG91 or any
 * other REST SMS provider is a drop-in swap behind this same `send()`
 * signature (base URL + auth header only differ). Placeholder
 * `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` -> logged stub, same
 * "degrade gracefully, obviously a stub" convention as
 * `WhatsAppService`/`PaymentsService.isMockMode`.
 *
 * Used by both `NotificationsDeliveryService` (per-preference fan-out)
 * and `OtpService` (real phone-OTP delivery, replacing the M8.0
 * console-only stub).
 */
@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isMockMode(): boolean {
    const sid = this.config.get('sms.accountSid', { infer: true });
    const token = this.config.get('sms.authToken', { infer: true });
    return !sid || !token || sid === PLACEHOLDER_SID || token === PLACEHOLDER_TOKEN;
  }

  async send(to: string, body: string): Promise<SmsSendResult> {
    if (this.isMockMode()) {
      this.logger.warn(`[SMS STUB — not sent, TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN unset] to=${to} body="${body}"`);
      return { mock: true };
    }

    const accountSid = this.config.get('sms.accountSid', { infer: true });
    const authToken = this.config.get('sms.authToken', { infer: true });
    const from = this.config.get('sms.fromNumber', { infer: true });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`SMS send to ${to} failed (${res.status}): ${text}`);
      throw new Error(`SMS send failed (${res.status})`);
    }

    const json = (await res.json()) as { sid?: string };
    return { mock: false, sid: json.sid };
  }
}
