import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/configuration';

/** The `.env.example` placeholder — matched exactly, so a real token (even a staging one) always takes the live path. Same convention as `PaymentsService.isMockMode`. */
const PLACEHOLDER_TOKEN = 'placeholder_shadowfax_token';

export interface ShadowfaxAddress {
  name: string;
  contact: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: number;
  latitude?: string;
  longitude?: string;
  alternate_contact?: string;
  email?: string;
}

export interface ShadowfaxCreateOrderPayload {
  order_type: 'marketplace';
  order_details: {
    client_order_id: string;
    product_value: number;
    cod_amount: number;
    payment_mode: 'Prepaid' | 'COD';
    total_amount?: number;
    actual_weight?: number;
    promised_delivery_date?: string;
    order_service?: string;
  };
  customer_details: ShadowfaxAddress;
  pickup_details: ShadowfaxAddress;
  rts_details: ShadowfaxAddress;
  product_details: Array<{
    sku_id?: string;
    sku_name: string;
    price: number;
    category?: string;
    additional_details?: { quantity?: number };
  }>;
}

export interface ShadowfaxCreateOrderResult {
  awbNumber: string;
  status?: string;
  raw: unknown;
}

/** The carrier's documented ceiling for one `bulk_track` call. */
export const BULK_TRACK_MAX = 50;

/** One row of a parcel's `tracking_details` history. */
export interface ShadowfaxTrackingEvent {
  created?: string;
  location?: string;
  status_id?: string;
  status?: string;
  remarks?: string;
  awb_number?: string;
}

/** One parcel as the v4 tracking endpoints describe it. */
export interface ShadowfaxTrackedOrder {
  awb_number?: string;
  client_order_id?: string;
  status?: string;
  status_display?: string;
  customer_track_url?: string;
  tracking_details?: ShadowfaxTrackingEvent[];
}

export interface ShadowfaxServiceabilityRow {
  code: number;
  services: string[];
}

/** Which leg of the journey a pincode question is about. */
export type ShadowfaxService = 'seller_pickup' | 'customer_delivery';

/**
 * Thin `fetch` wrapper over Shadowfax's Unified API (Forward
 * Integrations). No SDK — Shadowfax publishes none, and the four calls
 * this module needs are plain JSON over HTTPS.
 *
 * Auth is `Authorization: Token <token>`, and the literal word "Token" is
 * part of the value — a detail easy to lose and worth stating, because
 * getting it wrong returns the same 401 as a wrong token.
 *
 * **Stub mode**, when `SHADOWFAX_API_TOKEN` is the placeholder or unset:
 * every call is answered locally with a plausible shape and logged, so the
 * whole despatch flow stays exercisable on a laptop with no carrier
 * account. Identical convention to `RazorpayClient`/`WhatsAppService`, and
 * for the same reason — the real code path either way, minus the network.
 */
/**
 * Shadowfax's `errors` is a string on some refusals and a field-keyed
 * object on others (`{"customer_details": {"contact": ["…"]}}`), so it
 * cannot simply be interpolated — that is how an operator ends up reading
 * "[object Object]" as the reason a parcel did not book.
 */
function describeErrors(errors: unknown, fallback?: string): string {
  if (typeof errors === 'string' && errors.trim()) return errors.trim();
  if (errors && typeof errors === 'object') {
    try {
      const flat = JSON.stringify(errors);
      if (flat && flat !== '{}' && flat !== 'null') return flat.slice(0, 400);
    } catch {
      /* fall through to the message */
    }
  }
  return fallback?.trim() || 'no reason given';
}

@Injectable()
export class ShadowfaxClient {
  private readonly logger = new Logger(ShadowfaxClient.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  isStubMode(): boolean {
    const token = this.config.get('shadowfax.apiToken', { infer: true });
    return !token || token === PLACEHOLDER_TOKEN;
  }

  private get baseUrl(): string {
    return (this.config.get('shadowfax.baseUrl', { infer: true }) || '').replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Token ${this.config.get('shadowfax.apiToken', { infer: true })}`,
    };
  }

  /**
   * `timeoutMs` matters more here than it looks. This runs inside a
   * request that a HomeKrafter is waiting on (marking an order packed), so
   * a carrier having a bad day must not become our latency. The caller
   * treats a timeout as a booking that has not happened yet and is
   * retryable — never as a booking that failed.
   */
  private async call<T>(path: string, init: RequestInit, timeoutMs = 15_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers(),
        signal: controller.signal,
      });
      const text = await res.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { message: text };
      }
      if (!res.ok) {
        const message =
          (body as { message?: string; detail?: string })?.message ??
          (body as { detail?: string })?.detail ??
          `HTTP ${res.status}`;
        throw new ServiceUnavailableException(`Shadowfax ${path} failed (${res.status}): ${message}`);
      }
      return body as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if ((err as Error)?.name === 'AbortError') {
        throw new ServiceUnavailableException(`Shadowfax ${path} timed out after ${timeoutMs}ms`);
      }
      throw new ServiceUnavailableException(`Shadowfax ${path} unreachable: ${(err as Error)?.message ?? 'unknown'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Which of these pincodes the carrier will serve for this leg.
   *
   * The endpoint answers with **only the serviceable ones** — a pincode
   * absent from the response is a pincode it will not serve. Callers must
   * read absence that way rather than expecting a `false`.
   *
   * In stub mode every pincode asked about comes back serviceable. That is
   * the honest stub: it keeps the flow exercisable, and the alternative
   * (guessing at a coverage map) would be inventing carrier data.
   */
  async serviceability(pincodes: number[], service: ShadowfaxService): Promise<ShadowfaxServiceabilityRow[]> {
    if (!pincodes.length) return [];
    if (this.isStubMode()) {
      this.logger.debug(`[SHADOWFAX STUB] serviceability(${service}) -> all of ${pincodes.join(',')} serviceable`);
      return pincodes.map((code) => ({ code, services: ['Regular'] }));
    }
    const qs = new URLSearchParams({
      service,
      page: '1',
      count: String(Math.max(pincodes.length, 10)),
      pincodes: pincodes.join(','),
    });
    const rows = await this.call<ShadowfaxServiceabilityRow[]>(`/v1/clients/serviceability/?${qs}`, { method: 'GET' });
    return Array.isArray(rows) ? rows : [];
  }

  /** Places one seller-pickup parcel and returns its AWB. */
  async createOrder(payload: ShadowfaxCreateOrderPayload): Promise<ShadowfaxCreateOrderResult> {
    if (this.isStubMode()) {
      const awbNumber = `SFSTUB${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      this.logger.debug(`[SHADOWFAX STUB] createOrder(${payload.order_details.client_order_id}) -> ${awbNumber}`);
      return { awbNumber, status: 'new', raw: { stub: true } };
    }
    const body = await this.call<{
      message?: string;
      errors?: unknown;
      data?: { awb_number?: string; status?: string };
    }>('/v3/clients/orders/', { method: 'POST', body: JSON.stringify(payload) });

    const awbNumber = body?.data?.awb_number;
    if (!awbNumber) {
      // Shadowfax refuses a booking with **HTTP 200** and
      // `{"message":"Failure","errors":"…"}` — so `res.ok` is not the
      // check, the presence of an AWB is. A 200 with no AWB is not a
      // booking, and treating it as one leaves a parcel we believe is with
      // a carrier that has never heard of it.
      //
      // `errors` carries the only useful sentence — measured against
      // staging: `"Invalid Pickup Pincode. Pickup pincode 160022 is not
      // serviceable"`, against `message` which is the bare word
      // "Failure". Surfaced verbatim, because it lands on
      // `Consignment.failureReason` and is the whole of what tells an
      // operator what to fix.
      throw new ServiceUnavailableException(`Shadowfax refused the booking: ${describeErrors(body?.errors, body?.message)}`);
    }
    return { awbNumber, status: body?.data?.status, raw: body };
  }

  /** Latest carrier-side state for one AWB — the single-parcel poll. */
  async track(awbNumber: string): Promise<ShadowfaxTrackedOrder | null> {
    if (this.isStubMode()) {
      this.logger.debug(`[SHADOWFAX STUB] track(${awbNumber})`);
      return null;
    }
    const body = await this.call<{ order_details?: ShadowfaxTrackedOrder; tracking_details?: ShadowfaxTrackingEvent[] }>(
      `/v4/clients/orders/${encodeURIComponent(awbNumber)}/track/`,
      { method: 'GET' },
    );
    if (!body?.order_details) return null;
    // The single-parcel endpoint returns the history as a **sibling** of
    // `order_details`, while `bulk_track` nests it inside each row. Folded
    // together here so callers get one shape and the difference stops
    // being something every caller has to remember.
    return { ...body.order_details, tracking_details: body.tracking_details ?? [] };
  }

  /**
   * The reconciliation poll: up to 50 AWBs per call, which is the
   * carrier's documented ceiling and is enforced here rather than
   * discovered as a 400.
   *
   * This is what makes status auto-update without the PUSH callback being
   * registered in Shadowfax's client portal — a portal setting nobody can
   * make from inside this codebase. Push is faster; poll is the one that
   * works on day one.
   */
  async bulkTrack(awbNumbers: string[]): Promise<ShadowfaxTrackedOrder[]> {
    if (!awbNumbers.length) return [];
    if (this.isStubMode()) {
      this.logger.debug(`[SHADOWFAX STUB] bulkTrack(${awbNumbers.length} awbs)`);
      return [];
    }
    if (awbNumbers.length > BULK_TRACK_MAX) {
      throw new ServiceUnavailableException(`bulkTrack takes at most ${BULK_TRACK_MAX} AWBs per call`);
    }
    const body = await this.call<{ message?: string; data?: ShadowfaxTrackedOrder[] }>('/v4/clients/bulk_track/', {
      method: 'POST',
      body: JSON.stringify({ awb_numbers: awbNumbers }),
    });
    return Array.isArray(body?.data) ? body.data : [];
  }

  /**
   * Asks the carrier to call a parcel off.
   *
   * Shadowfax answers **304** for a parcel already in motion — the request
   * is queued and executed at the next facility. That is not an error and
   * not a completed cancellation, so it is reported back as `queued` and
   * the consignment is left alone until a callback confirms it.
   */
  async cancel(awbNumber: string, remarks: string): Promise<{ outcome: 'cancelled' | 'queued'; raw: unknown }> {
    if (this.isStubMode()) {
      this.logger.debug(`[SHADOWFAX STUB] cancel(${awbNumber}) -> cancelled`);
      return { outcome: 'cancelled', raw: { stub: true } };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl}/v3/clients/orders/cancel/`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ request_id: awbNumber, cancel_remarks: remarks }),
        signal: controller.signal,
      });
      const text = await res.text();
      let raw: unknown;
      try {
        raw = text ? JSON.parse(text) : {};
      } catch {
        raw = { message: text };
      }
      if (res.status === 304) return { outcome: 'queued', raw };
      if (!res.ok) {
        const message = (raw as { message?: string })?.message ?? `HTTP ${res.status}`;
        throw new ServiceUnavailableException(`Shadowfax cancel failed (${res.status}): ${message}`);
      }
      return { outcome: 'cancelled', raw };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(`Shadowfax cancel unreachable: ${(err as Error)?.message ?? 'unknown'}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
