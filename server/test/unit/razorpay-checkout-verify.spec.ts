import { createHmac } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../../src/payments/payments.service';
import { verifyCheckoutSignature } from '../../src/payments/razorpay-signature.util';

const SECRET = 'unit_test_key_secret';
const sign = (orderId: string, paymentId: string, secret = SECRET) =>
  createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

describe('verifyCheckoutSignature', () => {
  it('accepts Razorpay’s order_id|payment_id HMAC', () => {
    expect(verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_B'), SECRET)).toBe(true);
  });

  it('refuses a signature made for another payment, another secret, or nothing', () => {
    expect(verifyCheckoutSignature('order_A', 'pay_C', sign('order_A', 'pay_B'), SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_B', 'other'), SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_A', 'pay_B', undefined, SECRET)).toBe(false);
    expect(verifyCheckoutSignature('order_A', 'pay_B', sign('order_A', 'pay_B'), '')).toBe(false);
  });
});

describe('PaymentsService.verifyCheckout', () => {
  function build(opts: {
    rpOrder?: Record<string, unknown> | null;
    payment?: Record<string, unknown>;
    keyId?: string;
  }) {
    const settled: string[] = [];
    const rpOrder =
      opts.rpOrder === undefined
        ? { id: 'ro1', razorpayOrderId: 'order_A', userId: 'u1', amount: 50, status: 'created', purpose: 'order', orderId: 'o1' }
        : opts.rpOrder;
    const prisma = {
      razorpayOrder: { findUnique: jest.fn().mockResolvedValue(rpOrder) },
    };
    const config = {
      get: (key: string) =>
        ({ 'razorpay.keyId': opts.keyId ?? 'rzp_test_real', 'razorpay.keySecret': SECRET })[key],
    };
    const client = {
      fetchPayment: jest.fn().mockResolvedValue(
        opts.payment ?? { id: 'pay_B', order_id: 'order_A', amount: 5000, currency: 'INR', status: 'captured' },
      ),
    };
    const service = new PaymentsService(prisma as never, config as never, client as never, {} as never, {} as never);
    jest
      .spyOn(service as unknown as { settleCapture: (o: string, p: string) => Promise<string> }, 'settleCapture')
      .mockImplementation(async (o: string, p: string) => {
        settled.push(`${o}:${p}`);
        return 'applied';
      });
    return { service, settled, client };
  }

  const body = (paymentId = 'pay_B', signature = sign('order_A', 'pay_B')) => ({
    razorpay_order_id: 'order_A',
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  });

  it('settles a captured payment whose signature, owner and amount all match', async () => {
    const { service, settled } = build({});
    await expect(service.verifyCheckout('u1', body())).resolves.toEqual({ verified: true, status: 'captured' });
    expect(settled).toEqual(['order_A:pay_B']);
  });

  it('refuses a bad signature with 400 and marks nothing paid', async () => {
    const { service, settled, client } = build({});
    await expect(service.verifyCheckout('u1', body('pay_B', 'deadbeef'))).rejects.toBeInstanceOf(BadRequestException);
    expect(settled).toEqual([]);
    expect(client.fetchPayment).not.toHaveBeenCalled();
  });

  it('answers 404 for somebody else’s Razorpay order', async () => {
    const { service, settled } = build({});
    await expect(service.verifyCheckout('someone-else', body())).rejects.toBeInstanceOf(NotFoundException);
    expect(settled).toEqual([]);
  });

  it('refuses a payment for a different amount', async () => {
    const { service, settled } = build({
      payment: { id: 'pay_B', order_id: 'order_A', amount: 100, currency: 'INR', status: 'captured' },
    });
    await expect(service.verifyCheckout('u1', body())).rejects.toBeInstanceOf(BadRequestException);
    expect(settled).toEqual([]);
  });

  it('leaves an authorized-not-captured payment to the webhook', async () => {
    const { service, settled } = build({
      payment: { id: 'pay_B', order_id: 'order_A', amount: 5000, currency: 'INR', status: 'authorized' },
    });
    await expect(service.verifyCheckout('u1', body())).resolves.toEqual({ verified: true, status: 'pending' });
    expect(settled).toEqual([]);
  });

  it('refuses a failed payment', async () => {
    const { service, settled } = build({
      payment: { id: 'pay_B', order_id: 'order_A', amount: 5000, currency: 'INR', status: 'failed' },
    });
    await expect(service.verifyCheckout('u1', body())).rejects.toBeInstanceOf(BadRequestException);
    expect(settled).toEqual([]);
  });

  it('does not call Razorpay again for an order already captured', async () => {
    const { service, settled, client } = build({
      rpOrder: { id: 'ro1', razorpayOrderId: 'order_A', userId: 'u1', amount: 50, status: 'captured' },
    });
    await expect(service.verifyCheckout('u1', body())).resolves.toEqual({ verified: true, status: 'captured' });
    expect(client.fetchPayment).not.toHaveBeenCalled();
    expect(settled).toEqual([]);
  });

  it('is refused outright on a server with placeholder keys', async () => {
    const { service } = build({ keyId: 'rzp_test_placeholder' });
    await expect(service.verifyCheckout('u1', body())).rejects.toBeInstanceOf(BadRequestException);
  });
});
