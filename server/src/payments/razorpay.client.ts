import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

/**
 * Thin fetch-based wrapper over Razorpay's Orders API — no `razorpay` npm
 * dependency needed (root `CLAUDE.md`'s "don't add Razorpay early" applies
 * to the frontend mock layer; here in M8.2 it *is* the real integration,
 * but Node 20's built-in `fetch` covers the one call this milestone needs
 * without pulling in an SDK). Basic-auth per Razorpay's documented
 * server-side API convention: `key_id:key_secret` base64.
 */
@Injectable()
export class RazorpayClient {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async createOrder(params: { amountPaise: number; currency: string; receipt: string }): Promise<RazorpayOrderResponse> {
    const keyId = this.config.get('razorpay.keyId', { infer: true });
    const keySecret = this.config.get('razorpay.keySecret', { infer: true });
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: params.amountPaise, currency: params.currency, receipt: params.receipt }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new InternalServerErrorException(`Razorpay order creation failed (${res.status}): ${body}`);
    }
    return (await res.json()) as RazorpayOrderResponse;
  }
}
