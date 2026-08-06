import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

interface MetaWebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<{ from?: string; id?: string; type?: string; text?: { body?: string } }>;
  statuses?: Array<{ id?: string; status?: string; recipient_id?: string }>;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaWebhookValue }>;
  }>;
}

/** Matches a `buildSnackListMessage` line ("2x Masala Mathri") — see doc comment below. */
const ITEM_LINE = /^(\d+)\s*x\s+(.+)$/i;

interface MatchedItem {
  snackId: string;
  sellerId: string;
  name: string;
  quantity: number;
  price: number;
}

/**
 * Parses inbound WhatsApp messages into `SnackOrder` rows — the M9
 * "inbound snack-order messages can create/update a SnackOrder" seam,
 * deliberately kept minimal per the brief.
 *
 * The parser recognizes exactly the shape
 * `client/lib/snacks/message.ts#buildSnackListMessage` emits (a "1x Snack
 * Name" line per item, everything else ignored) — a real production
 * integration would likely add an interactive WhatsApp list/flow instead
 * of free-text parsing, but this is enough to prove the wire end-to-end:
 * a customer's actual "send list on WhatsApp" message becomes a real
 * `SnackOrder` a snack seller sees in their portal. Anything that doesn't
 * match at least one item line is logged and otherwise ignored — no
 * guessing at a shape we don't recognize.
 *
 * One `SnackOrder` is created per **seller** referenced by the parsed
 * items (a single list can span more than one seller's menu); each
 * unmatched item name (no `Snack` row, or an unassigned/no-seller snack)
 * is dropped with a warning log rather than failing the whole message.
 */
@Injectable()
export class WhatsAppInboundService {
  private readonly logger = new Logger(WhatsAppInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const body = payload as MetaWebhookPayload;
    if (body.object !== 'whatsapp_business_account') {
      this.logger.debug(`Ignoring webhook payload with unexpected object="${body.object}"`);
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // Delivery/read receipts for messages *we* sent — logged for
        // visibility only, nothing to act on server-side.
        for (const status of value.statuses ?? []) {
          this.logger.log(`[WHATSAPP STATUS] message=${status.id} status=${status.status} recipient=${status.recipient_id}`);
        }

        const senderName = value.contacts?.[0]?.profile?.name;
        for (const message of value.messages ?? []) {
          if (message.type !== 'text' || !message.text?.body || !message.from) continue;
          await this.handleTextMessage(message.from, senderName, message.text.body, message.id);
        }
      }
    }
  }

  private async handleTextMessage(
    fromPhone: string,
    senderName: string | undefined,
    text: string,
    messageId: string | undefined,
  ): Promise<void> {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const itemLines = lines.map((line) => ITEM_LINE.exec(line)).filter((m): m is RegExpExecArray => m !== null);

    if (itemLines.length === 0) {
      this.logger.log(`[WHATSAPP INBOUND] non-order text from ${fromPhone}: "${text.slice(0, 120)}"`);
      return;
    }

    const matchedItems: MatchedItem[] = [];
    for (const match of itemLines) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();
      const snack = await this.prisma.snack.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (!snack || !snack.sellerId) {
        this.logger.warn(`[WHATSAPP INBOUND] no sellable snack matched for "${name}" from ${fromPhone} — item skipped`);
        continue;
      }
      matchedItems.push({ snackId: snack.id, sellerId: snack.sellerId, name: snack.name, quantity, price: Number(snack.price) });
    }

    if (matchedItems.length === 0) {
      this.logger.warn(`[WHATSAPP INBOUND] order-shaped message from ${fromPhone} matched no known snacks — ignored`);
      return;
    }

    const bySeller = new Map<string, MatchedItem[]>();
    for (const item of matchedItems) {
      const list = bySeller.get(item.sellerId) ?? [];
      list.push(item);
      bySeller.set(item.sellerId, list);
    }

    // Everything below is one transaction, claiming the message id first —
    // the same shape `PaymentsService.handleWebhook` uses for Razorpay, and
    // for the same reason. **Meta redelivers.** Its Cloud API retries any
    // webhook it does not get a timely 200 for, and a retry replayed this
    // whole method: a customer who sent one snack list got two `SnackOrder`
    // rows, a HomeKrafter cooked the order twice, and nothing on the row
    // said which one was real. The `WebhookEvent` unique index on
    // `(provider, eventId)` is what makes the second delivery a no-op, and
    // it must be claimed *inside* the transaction so a crash mid-write
    // rolls the claim back with the orders rather than swallowing them.
    let created: { id: string; sellerId: string; itemCount: number; total: number }[];
    try {
      created = await this.prisma.$transaction(async (tx) => {
        if (messageId) {
          await tx.webhookEvent.create({
            data: { provider: 'whatsapp', eventId: `message:${messageId}` },
          });
        }

        const rows: { id: string; sellerId: string; itemCount: number; total: number }[] = [];
        for (const [sellerId, items] of bySeller) {
          const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const order = await tx.snackOrder.create({
            data: {
              sellerId,
              customerName: senderName ?? fromPhone,
              customerPhone: fromPhone,
              total,
              channel: 'whatsapp',
              status: 'received',
              items: {
                create: items.map((item) => ({ snackId: item.snackId, name: item.name, quantity: item.quantity, price: item.price })),
              },
            },
          });
          rows.push({ id: order.id, sellerId, itemCount: items.length, total });
        }
        return rows;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`[WHATSAPP INBOUND] duplicate delivery of message ${messageId} — already processed`);
        return;
      }
      throw err;
    }

    if (!messageId) {
      this.logger.warn(
        `[WHATSAPP INBOUND] message from ${fromPhone} carried no id — processed without redelivery protection`,
      );
    }

    // Outbound confirmations happen after the commit, never inside it: an
    // HTTP call to Meta holds the transaction (and its row locks) open for
    // the length of a network round trip, and a send that fails must not
    // roll back an order the kitchen has already been given.
    for (const order of created) {
      this.logger.log(
        `[WHATSAPP INBOUND] created SnackOrder ${order.id} for seller ${order.sellerId} from ${fromPhone} (${order.itemCount} item(s), total ₹${order.total})`,
      );
      await this.whatsapp.sendStatus({ phone: fromPhone, name: senderName }, order.id, 'received');
    }
  }
}
