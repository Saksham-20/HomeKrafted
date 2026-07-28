import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/** Mirrors `client/lib/messaging.ts#OrderStatusUpdate` server-side, plus the seller-portal's `SnackOrderStatus` enum members (`out_for_delivery`, underscored) — `sendStatus` accepts either spelling. */
export type WhatsAppStatusState =
  | 'received'
  | 'accepted'
  | 'out_for_delivery'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled';

export interface WhatsAppRecipient {
  /** Any format — non-digits are stripped before calling the Graph API, same as `buildWhatsAppLink`. */
  phone: string;
  name?: string;
}

export interface WhatsAppSendResult {
  /** `true` when this was a logged stub (placeholder creds), not a real Graph API call. */
  mock: boolean;
  messageId?: string;
}

const STATUS_COPY: Record<string, string> = {
  received: "we've received your order",
  accepted: 'your order has been accepted and is being prepared',
  out_for_delivery: 'your order is out for delivery',
  'out-for-delivery': 'your order is out for delivery',
  delivered: 'your order has been delivered — enjoy!',
  cancelled: 'your order has been cancelled',
};

const PLACEHOLDER_TOKEN = 'placeholder_whatsapp_token';
const PLACEHOLDER_PHONE_NUMBER_ID = 'placeholder_phone_number_id';

/**
 * Server-side WhatsApp Cloud API client — the real code path Meta's Graph
 * API `POST /{phoneNumberId}/messages` always runs through; when
 * `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are still the
 * `.env.example` placeholders, it degrades to a **clearly marked logged
 * stub** instead (same "degrade gracefully, obviously a stub" convention
 * as `PaymentsService.isMockMode`/`RazorpayClient`) — no silent
 * pretend-success that could be mistaken for a real send.
 *
 * This is the server-side sibling of `client/lib/messaging.ts`'s
 * `Messaging` interface (that one is click-to-chat only, with no
 * server-side send capability) — `sendStatus` is the one seam both
 * `SellerSnackOrdersService.advance` (snack-seller status timeline) and
 * `NotificationsDeliveryService` (generic per-preference fan-out) call
 * through.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isMockMode(): boolean {
    const token = this.config.get('whatsapp.token', { infer: true });
    const phoneNumberId = this.config.get('whatsapp.phoneNumberId', { infer: true });
    return !token || !phoneNumberId || token === PLACEHOLDER_TOKEN || phoneNumberId === PLACEHOLDER_PHONE_NUMBER_ID;
  }

  /** Sends a status-update message about `orderRef` to `recipient` — template-based when `WHATSAPP_STATUS_TEMPLATE` is set, else a plain-text session message. */
  async sendStatus(recipient: WhatsAppRecipient, orderRef: string, state: WhatsAppStatusState): Promise<WhatsAppSendResult> {
    const statusText = STATUS_COPY[state] ?? state;
    const greeting = recipient.name ? `Hi ${recipient.name}, ` : 'Hi, ';
    const text = `${greeting}update on order ${orderRef}: ${statusText}.`;

    const templateName = this.config.get('whatsapp.statusTemplate', { infer: true });
    if (templateName) {
      return this.sendTemplate(recipient.phone, templateName, [recipient.name ?? 'there', orderRef, statusText], {
        orderRef,
        state,
      });
    }
    return this.sendText(recipient.phone, text, { orderRef, state });
  }

  /** Plain-text session message — used for status fallback (no template configured) and generic notification fan-out bodies. */
  async sendText(to: string, text: string, meta?: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const digits = to.replace(/\D/g, '');

    if (this.isMockMode()) {
      this.logger.warn(
        `[WHATSAPP STUB — not sent, WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID unset] to=${digits} text="${text}"${
          meta ? ` meta=${JSON.stringify(meta)}` : ''
        }`,
      );
      return { mock: true };
    }

    return this.postMessage(digits, {
      messaging_product: 'whatsapp',
      to: digits,
      type: 'text',
      text: { body: text },
    });
  }

  private async sendTemplate(
    to: string,
    templateName: string,
    bodyParams: string[],
    meta?: Record<string, unknown>,
  ): Promise<WhatsAppSendResult> {
    const digits = to.replace(/\D/g, '');

    if (this.isMockMode()) {
      this.logger.warn(
        `[WHATSAPP STUB — not sent, WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID unset] to=${digits} template="${templateName}" params=${JSON.stringify(
          bodyParams,
        )}${meta ? ` meta=${JSON.stringify(meta)}` : ''}`,
      );
      return { mock: true };
    }

    return this.postMessage(digits, {
      messaging_product: 'whatsapp',
      to: digits,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  private async postMessage(to: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const token = this.config.get('whatsapp.token', { infer: true });
    const phoneNumberId = this.config.get('whatsapp.phoneNumberId', { infer: true });
    const apiVersion = this.config.get('whatsapp.apiVersion', { infer: true });

    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const responseBody = await res.text().catch(() => '');
      this.logger.error(`WhatsApp send to ${to} failed (${res.status}): ${responseBody}`);
      throw new Error(`WhatsApp send failed (${res.status})`);
    }

    const json = (await res.json()) as { messages?: { id: string }[] };
    return { mock: false, messageId: json.messages?.[0]?.id };
  }
}
