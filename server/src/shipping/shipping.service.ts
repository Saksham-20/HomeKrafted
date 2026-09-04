import { timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsignmentStatus, OrderStatus, Prisma, ShippingProvider } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { isPincodeShape, lookupPincode } from '../common/pincodes';
import { OrderNotificationsService } from '../orders/order-notifications.service';
import { BULK_TRACK_MAX, ShadowfaxClient } from './shadowfax.client';
import { buildCreateOrderPayload, ShadowfaxPayloadError } from './shadowfax-payload';
import { advancesConsignment, consignmentStatusFor, orderStatusFor, statusRank } from './shadowfax-status';

/** Where a courier-driven order may be pushed to. Never past `delivered`, never backwards. */
const ORDER_RANK: Record<OrderStatus, number> = {
  pending_payment: 0,
  placed: 1,
  confirmed: 2,
  packed: 3,
  shipped: 4,
  delivered: 5,
  cancelled: 6,
  returned: 6,
};

/**
 * What a buyer or a HomeKrafter is allowed to see of a parcel.
 *
 * An allowlist, not a blocklist: a column added to `Consignment` later is
 * absent from this projection until somebody decides it belongs, which is
 * the safe direction. `failureReason` and `bookAttempts` are deliberately
 * out — a carrier's refusal message is operator vocabulary, and telling a
 * buyer "Shadowfax does not collect from pincode 160022" reads as the
 * order being broken when the kitchen will simply deliver it itself.
 */
function publicConsignment(row: {
  id: string;
  status: string;
  awbNumber: string | null;
  courierStatus: string | null;
  currentLocation: string | null;
  trackingUrl: string | null;
  riderName: string | null;
  riderContact: string | null;
  lastEventAt: Date | null;
  bookedAt: Date | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  vendor?: { id: string; name: string; slug: string };
}) {
  return {
    id: row.id,
    status: row.status,
    awbNumber: row.awbNumber,
    courierStatus: row.courierStatus,
    currentLocation: row.currentLocation,
    // The carrier's own live tracking page. Absent in staging and until a
    // parcel is moving, so every surface must treat it as optional.
    trackingUrl: row.trackingUrl,
    // Only ever populated by the carrier once a rider is actually
    // assigned, which is the only time it means anything.
    riderName: row.riderName,
    riderContact: row.riderContact,
    lastEventAt: row.lastEventAt,
    bookedAt: row.bookedAt,
    pickedAt: row.pickedAt,
    deliveredAt: row.deliveredAt,
    vendor: row.vendor ? { id: row.vendor.id, name: row.vendor.name, slug: row.vendor.slug } : undefined,
  };
}

const CONSIGNMENT_INCLUDE = {
  order: { select: { id: true, orderNumber: true, status: true } },
  vendor: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ConsignmentInclude;

/**
 * How many live parcels one reconciliation run will look at.
 *
 * A ceiling, not a target: a backlog is worked through over several runs
 * rather than turning one poll into a thousand carrier calls on a 1-vCPU
 * box. 500 is ten `bulk_track` calls.
 */
const RECONCILE_MAX_PARCELS = 500;

/**
 * The rank `shadowfax-status.ts` gives delivered / returned / cancelled —
 * the three states a parcel does not come back from.
 */
const TERMINAL_RANK = 6;

/** IST, the zone Shadowfax reports in. See `parseCallback`. */
const CARRIER_UTC_OFFSET = '+05:30';

/**
 * `"2026-09-01 16:22:13"` -> a real instant, read as IST.
 *
 * Returns `null` for anything unparseable, including the empty string, so
 * the caller can make the fallback decision explicitly rather than
 * silently storing an Invalid Date.
 */
function parseCarrierTimestamp(raw: string | null): Date | null {
  if (!raw) return null;
  // Already carries a zone (a `Z` or a `±HH:MM`) — trust it as sent.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(hasZone ? iso : `${iso}${CARRIER_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Coercion for callback fields, all of which arrive from a third party.
 *
 * `String(value)` is not good enough here: a carrier (or anybody who has
 * guessed an AWB) can send `{"comments": {"a": 1}}` or an array, and
 * `.toString()` on those yields `"[object Object]"` — a real-looking
 * string that gets stored and shown to an operator as though the carrier
 * said it. Anything that is not already a string or a number becomes
 * `null`, and everything is length-capped at the column's own budget so a
 * megabyte of `comments` cannot be used to bloat the events table.
 */
function str(value: unknown, max: number): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** The subset of a callback body we are willing to act on, all of it validated. */
interface CleanCallback {
  awb: string;
  courierStatus: string;
  comments: string | null;
  location: string | null;
  riderName: string | null;
  riderContact: string | null;
  eventAt: Date;
}

export interface CallbackBody {
  awb_number?: string;
  order_id?: string;
  event?: string;
  status?: string;
  comments?: string;
  current_location?: string;
  event_timestamp?: string;
  rider_name?: string | null;
  rider_contact?: string | null;
  [key: string]: unknown;
}

/**
 * Courier despatch (M57).
 *
 * A `Consignment` is one kitchen's lines of one order going to one
 * address. Everything here holds to four rules, each of which this
 * codebase has already paid for once somewhere else:
 *
 * 1. **A carrier callback never moves money.** It can advance an order to
 *    `shipped` or `delivered` and nothing else. Cancellations, returns and
 *    losses are recorded on the consignment and left for an admin, because
 *    each of those refunds a buyer and the loss lands on a home cook
 *    (M15). The callback is also the least-authenticated input we accept —
 *    see `assertCallbackAuthorised`.
 * 2. **Booking never blocks the order.** The order is already paid. If the
 *    carrier is down, the pincode is unserviceable or the kitchen has no
 *    address on file, the consignment records why and the despatch queue
 *    picks it up — the HomeKrafter's "mark as packed" still succeeds.
 * 3. **The pickup address goes to the carrier and nowhere else.** It is a
 *    home cook's home address (M36b). It is read at booking time, put in
 *    the request body, and never stored on `Consignment` or returned by
 *    any endpoint in this module.
 * 4. **Nothing here reads the clock except to stamp a row.** The status
 *    arithmetic lives in `shadowfax-status.ts`, pure and unit-tested.
 */
@Injectable()
export class ShippingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShippingService.name);
  private pollTimer?: NodeJS.Timeout;
  /** One run at a time. A slow carrier must not let runs pile up on top of each other. */
  private polling = false;

  /**
   * The background reconciliation poll.
   *
   * **Off unless `SHADOWFAX_POLL_SECONDS` is set**, and floored at 60s so
   * a typo (`SHADOWFAX_POLL_SECONDS=1`) cannot turn into a thousand
   * carrier calls a minute. `unref()` so the timer never holds the
   * process open — a Jest run that boots the app must still exit.
   *
   * No `@nestjs/schedule`: this is one interval, and it is not worth a
   * dependency. It also means **one process polls** — if this API is ever
   * run at more than one instance, every instance polls, and the poll
   * should move behind a lock or a single scheduled worker. `ingest` is
   * idempotent so duplicate polling is wasteful rather than wrong.
   */
  onModuleInit(): void {
    const seconds = this.config.get('shadowfax.pollSeconds', { infer: true });
    if (!this.isEnabled() || !seconds) return;
    const interval = Math.max(60, seconds) * 1000;
    this.pollTimer = setInterval(() => {
      if (this.polling) return;
      this.polling = true;
      void this.reconcile()
        .then((r) => {
          if (r.updated || r.errors) {
            this.logger.log(`Reconciled ${r.checked} parcels — ${r.updated} advanced, ${r.errors} errors`);
          }
        })
        .catch((err) => this.logger.warn(`Reconcile run failed: ${(err as Error).message}`))
        .finally(() => {
          this.polling = false;
        });
    }, interval);
    this.pollTimer.unref();
    this.logger.log(`Courier reconciliation polling every ${interval / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }


  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly client: ShadowfaxClient,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  /** The master switch. Off -> this module does nothing at all. */
  isEnabled(): boolean {
    return this.config.get('shadowfax.enabled', { infer: true }) === true;
  }

  // -------------------------------------------------------------------------
  // Booking
  // -------------------------------------------------------------------------

  /**
   * Despatch every parcel an order needs. Called (as `void`) when a
   * HomeKrafter marks an order packed.
   *
   * Never throws at the caller. A despatch failure is a row an operator
   * can see and retry, not a reason a kitchen cannot record that it has
   * finished cooking — rule 2 above.
   */
  async bookForOrder(orderId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const consignments = await this.ensureConsignments(orderId);
      for (const consignment of consignments) {
        await this.book(consignment.id).catch((err) => {
          this.logger.warn(`Consignment ${consignment.id} could not be booked: ${(err as Error).message}`);
        });
      }
    } catch (err) {
      this.logger.error(`Despatch for order ${orderId} failed: ${(err as Error).message}`);
    }
  }

  /**
   * The `Consignment` rows this order needs, created if absent.
   *
   * Grouped by (vendor, address) because that is what a parcel is: one
   * rider, one pickup, one drop. A two-kitchen order to one address is two
   * parcels, which is exactly the shape `OrderShipment` cannot express.
   *
   * Idempotent — the `@@unique([orderId, vendorId, addressId])` means a
   * re-run finds what exists rather than minting a second parcel.
   */
  private async ensureConsignments(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { vendorId: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const groups = new Map<string, { vendorId: string; addressId: string }>();
    for (const item of order.items) {
      const vendorId = item.product?.vendorId;
      // A line with no product row is a legacy hamper line (M18). It has no
      // kitchen to collect from, so it cannot be a parcel — recording one
      // would send a rider to nobody.
      if (!vendorId) continue;
      groups.set(`${vendorId}:${item.addressId}`, { vendorId, addressId: item.addressId });
    }

    for (const { vendorId, addressId } of groups.values()) {
      await this.prisma.consignment.upsert({
        where: { orderId_vendorId_addressId: { orderId, vendorId, addressId } },
        create: {
          orderId,
          vendorId,
          addressId,
          provider: ShippingProvider.shadowfax,
          // Minted before the carrier is called, so a booking that times
          // out is retried against the same id instead of creating a
          // second parcel on the carrier's side.
          clientOrderId: `HK-${order.orderNumber}-${vendorId}-${addressId}`.slice(0, 100),
        },
        update: {},
      });
    }

    return this.prisma.consignment.findMany({
      where: { orderId, status: { in: [ConsignmentStatus.pending, ConsignmentStatus.failed] } },
    });
  }

  /**
   * Ask the carrier for an AWB.
   *
   * Serviceability is checked first and separately, because "we do not go
   * there" is a different thing to tell an operator than "the carrier
   * errored" — the first needs a different courier or a self-delivery, the
   * second needs a retry.
   */
  async book(consignmentId: string) {
    const consignment = await this.prisma.consignment.findUnique({
      where: { id: consignmentId },
      include: {
        address: true,
        vendor: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            profile: true,
            // The kitchen's own number is the fallback when no separate
            // pickup number was given. It lives on `User`, not `Seller`.
            seller: { select: { user: { select: { phone: true } } } },
          },
        },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
    });
    if (!consignment) throw new NotFoundException('Consignment not found');
    if (consignment.awbNumber) return consignment; // already booked — idempotent

    const items = await this.prisma.orderItem.findMany({
      where: {
        orderId: consignment.orderId,
        addressId: consignment.addressId,
        product: { vendorId: consignment.vendorId },
      },
      select: { sku: true, name: true, quantity: true, price: true },
    });
    if (!items.length) {
      return this.markFailed(consignmentId, 'This order has no lines from this kitchen to this address.');
    }

    const profile = consignment.vendor.profile;
    const declaredValue = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    let payload;
    try {
      payload = buildCreateOrderPayload({
        clientOrderId: consignment.clientOrderId,
        pickup: {
          vendorName: consignment.vendor.name,
          line1: profile?.pickupAddressLine1 ?? null,
          line2: profile?.pickupAddressLine2 ?? null,
          landmark: profile?.pickupLandmark ?? null,
          pincode: profile?.pickupPincode ?? null,
          phone: profile?.pickupPhone ?? consignment.vendor.seller?.user?.phone ?? null,
          // The confirmed pin, not the pincode centroid (M36).
          lat: consignment.vendor.lat,
          lng: consignment.vendor.lng,
        },
        drop: {
          recipientName: consignment.address.recipientName,
          phone: consignment.address.phone,
          line1: consignment.address.line1,
          line2: consignment.address.line2,
          city: consignment.address.city,
          state: consignment.address.state,
          pincode: consignment.address.pincode,
          instructions: consignment.address.instructions,
          lat: consignment.address.lat,
          lng: consignment.address.lng,
        },
        lines: items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, price: Number(i.price) })),
        declaredValue,
        // Every order on this platform is paid before it is despatched —
        // there is no COD rung in `PaymentMethod` that reaches here. Sent
        // explicitly rather than defaulted so adding one is a decision.
        codAmount: 0,
      });
    } catch (err) {
      if (err instanceof ShadowfaxPayloadError) return this.markFailed(consignmentId, err.message);
      throw err;
    }

    // Deliberately **no serviceability pre-check here.** The obvious design
    // is to ask `/v1/clients/serviceability/` first and refuse early, and
    // it was written that way — then measured against the carrier's own
    // staging environment on 2026-09-01, where:
    //
    //   * `customer_delivery` answered `serviceable` for **every** pincode
    //     put to it, including `999999` and `123456`, which are not
    //     Indian pincodes at all; and
    //   * `seller_pickup` answered for `999999` and **omitted `160022`** —
    //     central Chandigarh, where most of this platform's kitchens are.
    //
    // Read through the endpoint's documented contract (a pincode absent
    // from the response is one it will not serve), that second result
    // refuses every real booking we have. A read-only endpoint whose data
    // disagrees with the carrier's own booking endpoint must not be the
    // thing that decides whether a paid order gets a rider. So the booking
    // call is the authority: if the carrier will not take the parcel it
    // says so there, in its own words, and that sentence is what lands on
    // `failureReason` for an operator to act on.
    //
    // `GET /shipping/serviceability` still exists for the buyer-facing
    // "do you deliver to me?" question, where being advisory is fine.
    try {
      const result = await this.client.createOrder(payload);
      const booked = await this.prisma.consignment.update({
        where: { id: consignmentId },
        data: {
          awbNumber: result.awbNumber,
          status: ConsignmentStatus.booked,
          courierStatus: result.status ?? 'new',
          bookedAt: new Date(),
          failureReason: null,
          bookAttempts: { increment: 1 },
        },
      });
      // The waybill is the number a courier's support line asks for, and
      // until now it existed only on this row (2026-09-04). `void`, like
      // every other notification here: a message that fails must not
      // un-book a parcel that a rider is already coming for.
      void this.orderNotifications.notifyBuyerOfDespatch(booked.id);
      return booked;
    } catch (err) {
      return this.markFailed(consignmentId, (err as Error).message);
    }
  }

  private async markFailed(consignmentId: string, reason: string) {
    this.logger.warn(`Consignment ${consignmentId} failed: ${reason}`);
    return this.prisma.consignment.update({
      where: { id: consignmentId },
      data: {
        status: ConsignmentStatus.failed,
        failureReason: reason,
        bookAttempts: { increment: 1 },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Callback
  // -------------------------------------------------------------------------

  /**
   * Shadowfax does **not** sign callback bodies. There is no HMAC to
   * verify — unlike Razorpay, where the signature is the authentication.
   * All we get is a header value we chose and gave them, so:
   *
   * - it is compared in **constant time**, because a plain `===` on a
   *   secret leaks its length and prefix to anybody who can time us;
   * - an **unset** `SHADOWFAX_CALLBACK_TOKEN` refuses everything rather
   *   than accepting everything. A missing secret is a misconfiguration,
   *   and the failure mode of the other direction is a public endpoint
   *   that will mark any order delivered for anyone who guesses an AWB;
   * - and it is why rule 1 exists at the top of this file. This is the
   *   weakest input the server accepts, so the most it is allowed to do is
   *   move a parcel forward.
   */
  assertCallbackAuthorised(header: string | undefined): void {
    const expected = this.config.get('shadowfax.callbackToken', { infer: true });
    if (!expected) {
      throw new ForbiddenException('Courier callbacks are not configured on this deployment.');
    }
    const presented = (header ?? '').replace(/^Token\s+/i, '').trim();
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid courier callback credentials.');
    }
  }

  /**
   * One carrier status change.
   *
   * The parcel is resolved by **`awb_number` against our own row** — never
   * by the body's `order_id`. That is the Razorpay lesson: a webhook body
   * is an assertion by a third party, and the only field of it we trust is
   * the one we can look up something of our own with.
   */
  /**
   * Validate a callback body into the only fields we will act on.
   *
   * Separated from `handleCallback` so the parsing can be unit-tested
   * without a database, and so every untrusted field passes through
   * exactly one place.
   */
  parseCallback(body: CallbackBody, receivedAt: Date): CleanCallback {
    const awb = str(body.awb_number, 64);
    const courierStatus = str(body.event, 64);
    if (!awb || !courierStatus) {
      throw new BadRequestException('Callback needs both awb_number and event.');
    }
    // A carrier timestamp is `YYYY-MM-DD HH:MM:SS` with **no zone**, and
    // it is IST — Shadowfax is an Indian carrier operating Indian riders.
    // `new Date("2026-09-01T10:30:00")` parses a zoneless string in the
    // *server's* local zone, so the same callback becomes two different
    // instants on two boxes: measured 2026-09-01, this dev machine is
    // Asia/Kolkata and the production VPS is Etc/UTC, a 5h30m skew on
    // every `pickedAt` and `deliveredAt` we store — and `deliveredAt`
    // starts the buyer's seven-day return window (M15). Pinned to +05:30
    // explicitly so the box's zone stops mattering.
    //
    // A value we cannot parse falls back to now rather than rejecting the
    // event: losing a delivery notification over a malformed date field
    // is the worse failure. A timestamp far in the future falls back too,
    // so a bad carrier clock cannot park an event beyond every subsequent
    // one and freeze the row.
    const parsed = parseCarrierTimestamp(str(body.event_timestamp, 40));
    const usable = parsed && parsed.getTime() < receivedAt.getTime() + 24 * 60 * 60 * 1000;
    return {
      awb,
      courierStatus,
      comments: str(body.comments, 500),
      location: str(body.current_location, 200),
      riderName: str(body.rider_name, 120),
      riderContact: str(body.rider_contact, 32),
      // Non-null on purpose — it is part of the idempotency key, and
      // Postgres treats NULLs in a unique index as distinct, so a
      // nullable value here would let a redelivered callback with no
      // timestamp insert a second event and re-drive the order.
      eventAt: usable ? (parsed as Date) : receivedAt,
    };
  }

  /**
   * One carrier status change.
   *
   * The parcel is resolved by **`awb_number` against our own row** — never
   * by the body's `order_id`. That is the Razorpay lesson: a webhook body
   * is an assertion by a third party, and the only field of it we trust is
   * the one we can look up something of our own with.
   *
   * The whole update runs in one transaction over a **row-locked**
   * consignment. Carriers deliver callbacks in parallel and out of order,
   * and without the lock two events arriving together both read the old
   * status, both decide they advance it, and the later-committing one
   * wins regardless of which is actually further along — so a parcel can
   * go `delivered` then back to `in_transit`.
   */
  async handleCallback(body: CallbackBody): Promise<{ received: boolean; note?: string }> {
    const receivedAt = new Date();
    const event = this.parseCallback(body, receivedAt);

    const existing = await this.prisma.consignment.findUnique({
      where: { awbNumber: event.awb },
      select: { id: true, orderId: true },
    });
    if (!existing) {
      // Acknowledged, not 404'd: a carrier that gets an error keeps
      // retrying forever, and an AWB we do not know is not something a
      // retry will fix. Logged, because a run of these means our AWBs and
      // theirs have diverged.
      this.logger.warn(`Callback for unknown AWB ${event.awb} (${event.courierStatus}) — acknowledged and dropped`);
      return { received: true, note: 'unknown awb' };
    }

    const outcome = await this.ingest(existing.id, event, body);
    if (outcome === 'duplicate') return { received: true, note: 'duplicate delivery — already processed' };
    if (outcome === 'unmapped') return { received: true, note: 'unmapped status recorded' };
    if (outcome === 'advanced') await this.reconcileOrderStatus(existing.orderId);
    return { received: true };
  }

  /**
   * **The one path a parcel's state changes on**, shared by the PUSH
   * callback and the reconciliation poll.
   *
   * Both channels report the same events — a callback we missed while the
   * box was restarting arrives again in `tracking_details` on the next
   * poll — so they must converge rather than each keep their own idea of
   * the truth. That is what the `ConsignmentEvent` uniqueness key buys:
   * whichever channel sees an event first records it, and the other one
   * loses the insert and changes nothing.
   *
   * Runs in one transaction over a **row-locked** consignment. Carriers
   * deliver callbacks in parallel and the poll runs concurrently with
   * them; without the lock two events read the same old status, both
   * decide they advance it, and the later-committing one wins regardless
   * of which is actually further along — so a parcel can go `delivered`
   * and then back to `in_transit`.
   */
  private async ingest(
    consignmentId: string,
    event: CleanCallback,
    payload: unknown,
  ): Promise<'advanced' | 'recorded' | 'duplicate' | 'unmapped'> {
    const mapped = consignmentStatusFor(event.courierStatus);
    if (!mapped) {
      // A word the carrier has invented since this file was written. The
      // event is still kept — the raw id is the record — and the parcel's
      // own status is left alone, because an unknown word must never be
      // read as "delivered".
      this.logger.warn(
        `Unknown Shadowfax status "${event.courierStatus}" on ${event.awb} — event stored, status unchanged`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Consignment" WHERE id = ${consignmentId} FOR UPDATE`;
        const current = await tx.consignment.findUniqueOrThrow({ where: { id: consignmentId } });

        await tx.consignmentEvent.create({
          data: {
            consignmentId: current.id,
            courierStatus: event.courierStatus,
            status: mapped ?? current.status,
            comments: event.comments,
            location: event.location,
            riderName: event.riderName,
            riderContact: event.riderContact,
            eventAt: event.eventAt,
            payload: payload as Prisma.InputJsonValue,
          },
        });

        if (!mapped) return 'unmapped';

        // Only the newest event describes where the parcel is now.
        //
        // Writing these unconditionally is wrong and was measured being
        // wrong: a stale `nc` redelivered after `delivered` left the row
        // reading `status=delivered, courierStatus=nc, statusNote="Item
        // nc"` — a delivered parcel labelled "not contactable", which is
        // exactly the row an operator would act on. Carriers redeliver
        // out of order as a matter of course, and the poll replays a
        // whole history at once, so an older event is recorded as an
        // event and changes nothing else.
        // A terminal parcel is finished, and nothing that arrives later
        // describes it any more. Measured: a carrier event stamped a day
        // *after* a delivery is legitimately "newest", so without this it
        // rewrote the row to `status=delivered, courierStatus=ofd` — a
        // delivered parcel labelled out-for-delivery. The event is still
        // kept; a genuine post-delivery return is an admin's decision
        // (this file's rule 1), read off the event log.
        if (statusRank(current.status) >= TERMINAL_RANK) return 'recorded';

        const isNewest = !current.lastEventAt || event.eventAt.getTime() >= current.lastEventAt.getTime();
        const moves = advancesConsignment(current.status, mapped);
        if (!isNewest && !moves) return 'recorded';

        // Rider identity is kept once given: the carrier sends it only on
        // out-for-pickup/delivery events, and blanking it on the next
        // event would lose the one number support actually needs.
        const data: Prisma.ConsignmentUpdateInput = {
          courierStatus: event.courierStatus,
          statusNote: event.comments,
          currentLocation: event.location,
          lastEventAt: event.eventAt,
          ...(event.riderName ? { riderName: event.riderName } : {}),
          ...(event.riderContact ? { riderContact: event.riderContact } : {}),
        };
        if (moves) {
          data.status = mapped;
          if (mapped === ConsignmentStatus.picked) data.pickedAt = event.eventAt;
          if (mapped === ConsignmentStatus.delivered) data.deliveredAt = event.eventAt;
          if (mapped === ConsignmentStatus.cancelled) data.cancelledAt = event.eventAt;
        }
        await tx.consignment.update({ where: { id: current.id }, data });
        return moves ? 'advanced' : 'recorded';
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The idempotency key fired — this exact event, at this exact
        // instant, has already been recorded by the other channel.
        return 'duplicate';
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Reconciliation poll
  // -------------------------------------------------------------------------

  /**
   * Ask the carrier where every live parcel actually is, and replay
   * anything we have not already recorded.
   *
   * This exists because the PUSH callback needs a URL registered in
   * Shadowfax's **client portal**, which is a setting on their side that
   * no amount of code here can make. Until somebody does that, this poll
   * is the whole of the auto-update; afterwards it is the safety net for
   * every callback lost to a restart, a deploy or a network blip. Both
   * feed `ingest`, so they cannot disagree.
   *
   * Reads `tracking_details` — the parcel's **whole history** — rather
   * than only its current status, so a parcel that went
   * `picked -> ofd -> delivered` between two polls records all three
   * events instead of jumping straight to the last one. Every one of them
   * is idempotent, so replaying costs nothing.
   */
  async reconcile(): Promise<{ checked: number; updated: number; errors: number }> {
    if (!this.isEnabled()) return { checked: 0, updated: 0, errors: 0 };

    const live = await this.prisma.consignment.findMany({
      where: {
        awbNumber: { not: null },
        status: {
          // Terminal parcels are never re-polled: they cannot change, and
          // polling them would grow this call without bound as the
          // platform's order history grows.
          notIn: [
            ConsignmentStatus.delivered,
            ConsignmentStatus.cancelled,
            ConsignmentStatus.returned,
            ConsignmentStatus.failed,
            ConsignmentStatus.pending,
          ],
        },
      },
      select: { id: true, orderId: true, awbNumber: true },
      // A ceiling on one run. A backlog is worked through over several
      // runs rather than turning one poll into a thousand carrier calls.
      take: RECONCILE_MAX_PARCELS,
    });
    if (!live.length) return { checked: 0, updated: 0, errors: 0 };

    const byAwb = new Map(live.map((c) => [c.awbNumber as string, c]));
    let updated = 0;
    let errors = 0;
    const touchedOrders = new Set<string>();

    for (let i = 0; i < live.length; i += BULK_TRACK_MAX) {
      const batch = live.slice(i, i + BULK_TRACK_MAX).map((c) => c.awbNumber as string);
      let rows;
      try {
        rows = await this.client.bulkTrack(batch);
      } catch (err) {
        // One bad batch must not abandon the rest. The carrier being down
        // is a thing that happens, and the next run picks these up.
        errors += 1;
        this.logger.warn(`bulk_track batch failed: ${(err as Error).message}`);
        continue;
      }

      for (const row of rows) {
        const consignment = row.awb_number ? byAwb.get(row.awb_number) : undefined;
        if (!consignment) continue;

        if (row.customer_track_url) {
          await this.prisma.consignment
            .update({ where: { id: consignment.id }, data: { trackingUrl: row.customer_track_url } })
            .catch(() => undefined);
        }

        // Oldest first, so the row walks its history forwards instead of
        // landing on the last event and refusing the rest as stale.
        const history = [...(row.tracking_details ?? [])].sort((a, b) =>
          (a.created ?? '').localeCompare(b.created ?? ''),
        );
        // A parcel with no history still has a current status worth
        // recording — `bulk_track` always carries one.
        const events = history.length ? history : [{ status_id: row.status, created: undefined }];

        for (const entry of events) {
          const statusId = typeof entry.status_id === 'string' ? entry.status_id.trim() : '';
          if (!statusId) continue;
          const outcome = await this.ingest(
            consignment.id,
            {
              awb: row.awb_number as string,
              courierStatus: statusId,
              comments: typeof entry.remarks === 'string' ? entry.remarks.slice(0, 500) : null,
              location: typeof entry.location === 'string' ? entry.location.slice(0, 200) : null,
              // The poll carries no rider identity — only the PUSH
              // callback does. Passing null would blank a name the
              // callback gave us, so `ingest` only ever writes these
              // when they are present.
              riderName: null,
              riderContact: null,
              eventAt: parseCarrierTimestamp(entry.created ?? null) ?? new Date(),
            },
            entry,
          ).catch((err) => {
            errors += 1;
            this.logger.warn(`Reconcile ingest failed for ${row.awb_number}: ${(err as Error).message}`);
            return 'recorded' as const;
          });
          if (outcome === 'advanced') {
            updated += 1;
            touchedOrders.add(consignment.orderId);
          }
        }
      }
    }

    for (const orderId of touchedOrders) {
      await this.reconcileOrderStatus(orderId).catch((err) =>
        this.logger.warn(`Order reconcile failed for ${orderId}: ${(err as Error).message}`),
      );
    }

    return { checked: live.length, updated, errors };
  }

  /**
   * Pull the whole order up to whatever its parcels agree on.
   *
   * **The weakest parcel decides.** An order is `shipped` when every parcel
   * has left its kitchen and `delivered` when every parcel has arrived —
   * not when the first one does. That mirrors `SellerOrdersService.advance`
   * exactly, and for the same reason: `delivered` stamps `deliveredAt`,
   * starts the buyer's seven-day return window and is the payout basis for
   * *every* kitchen on the order (M15/M37). One rider finishing early must
   * not start the clock on food still in somebody else's oven.
   *
   * A parcel that is cancelled, returned or failed stops the order
   * advancing at all rather than being quietly excluded. That is
   * deliberate: an order with a lost parcel is not a delivered order, and
   * the honest outcome is that it sits in the despatch queue for a person,
   * not that it closes itself and starts a return window.
   *
   * Row-locked for the same reason the callback is: two parcels on one
   * order can report delivery in the same instant, and both would
   * otherwise read the order as `shipped` and both write `delivered` —
   * which fires the buyer's notification twice.
   */
  private async reconcileOrderStatus(orderId: string): Promise<void> {
    const target = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
      if (!order) return null;
      // A cancelled or returned order is a money decision that has already
      // been made by a person. A rider's callback does not reopen it.
      if (order.status === OrderStatus.cancelled || order.status === OrderStatus.returned) return null;

      const consignments = await tx.consignment.findMany({ where: { orderId }, select: { status: true } });
      if (!consignments.length) return null;

      const implied = consignments.map((c) => orderStatusFor(c.status));
      if (implied.some((s) => s === null)) return null;

      const next = implied.reduce<OrderStatus>(
        (lowest, s) => (ORDER_RANK[s as OrderStatus] < ORDER_RANK[lowest] ? (s as OrderStatus) : lowest),
        implied[0] as OrderStatus,
      );
      if (ORDER_RANK[next] <= ORDER_RANK[order.status]) return null; // never backwards

      await tx.order.update({
        where: { id: orderId },
        data: { status: next, ...(next === OrderStatus.delivered ? { deliveredAt: new Date() } : {}) },
      });
      return next;
    });

    // Outside the transaction, and `void`: every path that writes
    // `Order.status` owes the buyer a message (M18), and a message that
    // fails must never roll back a delivery that happened.
    if (target) void this.orderNotifications.notifyBuyerOfStatus(orderId, target);
  }

  // -------------------------------------------------------------------------
  // Reads and operator actions
  // -------------------------------------------------------------------------

  /** Whether the carrier will serve a pincode for delivery. Public, read-only, no identifiers. */
  async checkServiceability(pincode: string): Promise<{ pincode: string; serviceable: boolean; services: string[] }> {
    const pin = pincode.trim();
    if (!isPincodeShape(pin)) {
      throw new BadRequestException('Enter a six-digit Indian pincode.');
    }
    // Existence is checked against **our own** table before the carrier is
    // asked. Shadowfax's staging serviceability endpoint answers
    // `serviceable` for `999999` and `123456`, so relaying it unchecked
    // would tell a buyer we deliver to a pincode that does not exist —
    // which reads as a working answer right up until the parcel is booked.
    // `pincodes.json` (GeoNames, 19k rows) is authoritative for whether a
    // pincode is real; the carrier is authoritative for whether it goes
    // there.
    if (!lookupPincode(pin)) {
      return { pincode: pin, serviceable: false, services: [] };
    }
    const code = Number(pin);
    const rows = await this.client.serviceability([code], 'customer_delivery');
    const hit = rows.find((r) => r.code === code);
    return { pincode: pin, serviceable: Boolean(hit), services: hit?.services ?? [] };
  }

  /** The despatch queue. */
  async list(params: { status?: ConsignmentStatus; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
    const where: Prisma.ConsignmentWhereInput = params.status ? { status: params.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.consignment.findMany({
        where,
        include: CONSIGNMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.consignment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const consignment = await this.prisma.consignment.findUnique({
      where: { id },
      include: {
        ...CONSIGNMENT_INCLUDE,
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!consignment) throw new NotFoundException('Consignment not found');
    return consignment;
  }

  /**
   * Every parcel on one order, as the **admin** sees it.
   *
   * There is deliberately no pickup address on `Consignment` to leak here
   * (M36b) — it is read at booking time, sent to the carrier, and never
   * stored.
   */
  async forOrder(orderId: string) {
    return this.prisma.consignment.findMany({
      where: { orderId },
      include: { vendor: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The buyer's own parcels.
   *
   * Ownership is checked against `Order.userId` and a foreign order 404s
   * rather than 403s — the same "never confirm another owner's resource"
   * rule every other owner-scoped read in this codebase follows. Without
   * it, an order id is enough to read a stranger's rider's phone number.
   */
  async forOrderAsBuyer(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return (await this.forOrder(orderId)).map(publicConsignment);
  }

  /**
   * The HomeKrafter's own parcels for one of their orders — their lines,
   * their rider.
   *
   * Scoped to consignments whose `vendorId` is the caller's, so a
   * participant in a multi-kitchen order sees the parcel they packed and
   * not the other kitchen's. Mirrors `mapOrderForSeller` (M37).
   */
  async forOrderAsSeller(vendorId: string, orderId: string) {
    const owns = await this.prisma.orderItem.findFirst({
      where: { orderId, product: { vendorId } },
      select: { id: true },
    });
    if (!owns) throw new NotFoundException('Order not found');
    const rows = await this.prisma.consignment.findMany({
      where: { orderId, vendorId },
      include: { vendor: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(publicConsignment);
  }

  /**
   * Is a carrier actually holding this kitchen's parcel right now?
   *
   * `booked` counts: the AWB exists and a rider is coming, so the kitchen
   * has already handed the job over. `pending` and `failed` do not — those
   * are parcels nobody has collected, and a kitchen that decides to drive
   * it over itself must not be locked out of saying so.
   *
   * `false` whenever the module is switched off, so the pre-M57 manual
   * pipeline is bit-for-bit unchanged on a deployment with no carrier.
   */
  async hasParcelInFlight(orderId: string, vendorId?: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const count = await this.prisma.consignment.count({
      where: {
        orderId,
        ...(vendorId ? { vendorId } : {}),
        awbNumber: { not: null },
        status: {
          in: [
            ConsignmentStatus.booked,
            ConsignmentStatus.out_for_pickup,
            ConsignmentStatus.picked,
            ConsignmentStatus.in_transit,
            ConsignmentStatus.out_for_delivery,
            ConsignmentStatus.exception,
          ],
        },
      },
    });
    return count > 0;
  }

  /** Retry a booking an operator has fixed the cause of. */
  async retry(id: string) {
    const consignment = await this.prisma.consignment.findUnique({ where: { id } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    if (consignment.awbNumber) {
      throw new BadRequestException('This parcel is already booked with the carrier.');
    }
    await this.prisma.consignment.update({
      where: { id },
      data: { status: ConsignmentStatus.pending, failureReason: null },
    });
    return this.book(id);
  }

  /**
   * Call a booked parcel off.
   *
   * A carrier `queued` outcome (its 304 — the parcel is already moving and
   * will be stopped at the next facility) deliberately does **not** mark
   * the row cancelled. It is not cancelled until the carrier says so on a
   * callback, and recording it early would tell an operator a rider had
   * been stood down when one is still on the road.
   */
  async cancel(id: string, reason: string) {
    const consignment = await this.prisma.consignment.findUnique({ where: { id } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    if (!reason?.trim()) throw new BadRequestException('A cancellation needs a reason.');
    if (consignment.status === ConsignmentStatus.delivered) {
      throw new BadRequestException('This parcel has already been delivered.');
    }
    if (!consignment.awbNumber) {
      return this.prisma.consignment.update({
        where: { id },
        data: { status: ConsignmentStatus.cancelled, cancelledAt: new Date(), failureReason: reason.trim() },
      });
    }
    const result = await this.client.cancel(consignment.awbNumber, reason.trim());
    if (result.outcome === 'queued') {
      return this.prisma.consignment.update({
        where: { id },
        data: { statusNote: `Cancellation queued with the carrier: ${reason.trim()}` },
      });
    }
    return this.prisma.consignment.update({
      where: { id },
      data: { status: ConsignmentStatus.cancelled, cancelledAt: new Date(), statusNote: reason.trim() },
    });
  }
}
