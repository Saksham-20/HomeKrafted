import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { EmailContent, renderEmail } from '../email-template';

export interface EmailSendResult {
  /** `true` when this was a logged stub (no API key), not a real send. */
  mock: boolean;
  /** The provider's own id for the message, when it gave one. Logged, not stored. */
  id?: string;
}

export interface EmailSendOptions {
  /**
   * Rendered HTML. When absent the provider sends the branded shell built
   * from `body` — so a caller that only has a sentence still sends a real
   * email rather than a bare paragraph.
   */
  html?: string;
  /** Plain-text alternative. Defaults to `body`. */
  text?: string;
  /**
   * Dedupe key, passed to Resend's `Idempotency-Key` header. Same rule as
   * every other money-or-message key in this repo (M26): mint it once per
   * *operation*, never per attempt, or a retry after a timeout sends a
   * second copy.
   */
  idempotencyKey?: string;
}

/** Placeholders that mean "nobody has configured this yet". */
const PLACEHOLDER_KEYS = ['placeholder_sendgrid_key', 'placeholder_resend_key'];

/**
 * Email delivery, over **Resend** by default and SendGrid if that is what
 * the box is configured with (2026-09-04).
 *
 * Both are the same shape — Bearer key, JSON body — so the provider is a
 * config value rather than a code change, and neither key being set
 * degrades to a logged stub exactly as `SmsProviderService` and
 * `WhatsAppService` do. That stub is not a nicety: with no key, an
 * approved HomeKrafter's invite reaches nobody, and the admin screen has
 * to be able to say so (`SellerInviteService` reads `mock` to decide
 * whether to show the link for hand-delivery).
 *
 * **Every send carries both HTML and text.** A caller that passes only a
 * body gets the branded shell built for it here, so no path in the app
 * can accidentally send an unstyled paragraph — and the text part is
 * always there, which is what keeps the message readable in a client with
 * remote content switched off.
 *
 * **The from address must be on a domain verified with the provider.**
 * Resend rejects anything else outright; that is a dashboard step, not a
 * code one, and `docs/DEPLOY.md` carries it.
 */
@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isMockMode(): boolean {
    const key = this.config.get('email.apiKey', { infer: true });
    return !key || PLACEHOLDER_KEYS.includes(key);
  }

  /** Which transport a real send would use. Surfaced for the health/diagnostic logs, not for branching at call sites. */
  providerName(): 'resend' | 'sendgrid' {
    return this.config.get('email.provider', { infer: true });
  }

  /**
   * Send one message.
   *
   * `body` stays the second positional argument's partner so every
   * existing caller keeps working: it is the plain-text message, and
   * without `options.html` it is also what the branded HTML is built
   * from.
   */
  async send(
    to: string,
    subject: string,
    body: string,
    options: EmailSendOptions = {},
  ): Promise<EmailSendResult> {
    const provider = this.providerName();

    if (this.isMockMode()) {
      this.logger.warn(
        `[EMAIL STUB — not sent, no ${provider === 'resend' ? 'RESEND_API_KEY' : 'SENDGRID_API_KEY'}] ` +
          `to=${to} subject="${subject}" body="${body}"`,
      );
      return { mock: true };
    }

    const apiKey = this.config.get('email.apiKey', { infer: true });
    const from = this.config.get('email.fromAddress', { infer: true });
    const replyTo = this.config.get('email.replyTo', { infer: true });

    // A caller with no HTML still sends a real-looking email. The
    // alternative — a bare `<pre>`-ish paragraph — is what every message
    // this app sent until now.
    const rendered =
      options.html !== undefined
        ? { html: options.html, text: options.text ?? body }
        : renderEmail({ heading: subject, paragraphs: splitParagraphs(body) });

    return provider === 'resend'
      ? this.sendViaResend({ apiKey, from, replyTo, to, subject, rendered, options })
      : this.sendViaSendgrid({ apiKey, from, replyTo, to, subject, rendered });
  }

  /** Renders `content` through the shared shell and sends it. The path every branded message should take. */
  async sendTemplate(
    to: string,
    subject: string,
    content: EmailContent,
    options: Omit<EmailSendOptions, 'html' | 'text'> = {},
  ): Promise<EmailSendResult> {
    const rendered = renderEmail(content);
    return this.send(to, subject, rendered.text, { ...options, html: rendered.html, text: rendered.text });
  }

  private async sendViaResend(args: {
    apiKey: string;
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    rendered: { html: string; text: string };
    options: EmailSendOptions;
  }): Promise<EmailSendResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (args.options.idempotencyKey) headers['Idempotency-Key'] = args.options.idempotencyKey;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        subject: args.subject,
        html: args.rendered.html,
        text: args.rendered.text,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // The message is the provider's, quoted — an unverified sending
      // domain and a revoked key both land here and read completely
      // differently, and guessing between them wastes the hour somebody
      // spends debugging it.
      this.logger.error(`Resend send to ${args.to} failed (${res.status}): ${text}`);
      throw new Error(`Email send failed (${res.status})`);
    }

    const payload = (await res.json().catch(() => ({}))) as { id?: string };
    return { mock: false, id: payload.id };
  }

  private async sendViaSendgrid(args: {
    apiKey: string;
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    rendered: { html: string; text: string };
  }): Promise<EmailSendResult> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: stripDisplayName(args.from) },
        ...(args.replyTo ? { reply_to: { email: stripDisplayName(args.replyTo) } } : {}),
        subject: args.subject,
        // Order matters to SendGrid: the last part is what a capable
        // client shows, so text must come first.
        content: [
          { type: 'text/plain', value: args.rendered.text },
          { type: 'text/html', value: args.rendered.html },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`SendGrid send to ${args.to} failed (${res.status}): ${text}`);
      throw new Error(`Email send failed (${res.status})`);
    }

    return { mock: false };
  }
}

/** `Homekrafted <hi@x.in>` → `hi@x.in`. Resend takes the friendly form; SendGrid's `from.email` does not. */
function stripDisplayName(address: string): string {
  const match = address.match(/<([^>]+)>/);
  return (match ? match[1] : address).trim();
}

/** Blank-line-separated text back into paragraphs, so a legacy plain-text caller still renders as prose. */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}
