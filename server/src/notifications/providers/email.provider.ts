import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

export interface EmailSendResult {
  /** `true` when this was a logged stub (placeholder API key), not a real send. */
  mock: boolean;
}

const PLACEHOLDER_KEY = 'placeholder_sendgrid_key';

/**
 * Email delivery — SendGrid's `POST /v3/mail/send` shape (Bearer API
 * key, JSON body). An SMTP transport is a drop-in alternative behind
 * this same `send()` signature if preferred later. Placeholder
 * `SENDGRID_API_KEY` -> logged stub, same convention as
 * `SmsProviderService`/`WhatsAppService`.
 */
@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isMockMode(): boolean {
    const key = this.config.get('email.apiKey', { infer: true });
    return !key || key === PLACEHOLDER_KEY;
  }

  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    if (this.isMockMode()) {
      this.logger.warn(`[EMAIL STUB — not sent, SENDGRID_API_KEY unset] to=${to} subject="${subject}" body="${body}"`);
      return { mock: true };
    }

    const apiKey = this.config.get('email.apiKey', { infer: true });
    const from = this.config.get('email.fromAddress', { infer: true });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Email send to ${to} failed (${res.status}): ${text}`);
      throw new Error(`Email send failed (${res.status})`);
    }

    return { mock: false };
  }
}
