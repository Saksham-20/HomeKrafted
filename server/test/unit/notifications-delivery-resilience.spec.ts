import { NotificationsDeliveryService } from '../../src/notifications/notifications-delivery.service';

/**
 * Finding [36]: the class doc promises that one channel's provider
 * throwing "never throws back to the caller" — but the `prisma.notification
 * .create` call that persists a sent channel's inbox row was unguarded,
 * and `getOrCreatePreference` rethrew any non-P2002 Prisma error. Either
 * one turns a transient DB error mid-fan-out into a dropped remainder of
 * the batch, or an unexpected rejection out of `deliver()`.
 */

function baseUser() {
  return { id: 'u1', name: 'Asha', phone: '9999999999', email: 'asha@example.test' };
}

function notificationRow(channel: string) {
  return {
    id: `n-${channel}`,
    userId: 'u1',
    channel,
    category: 'account',
    title: 'Order packed',
    body: 'On its way',
    refType: null,
    refId: null,
    read: false,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
  };
}

function serviceWith(prisma: Record<string, unknown>) {
  const sms = { send: jest.fn().mockResolvedValue(undefined) };
  const whatsapp = { sendText: jest.fn().mockResolvedValue(undefined) };
  const email = { sendTemplate: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://homekrafted.in') };
  const service = new NotificationsDeliveryService(prisma as never, sms as never, whatsapp as never, email as never, config as never);
  return { service, sms, whatsapp, email };
}

describe('NotificationsDeliveryService.deliver — a failed inbox-row write never aborts the rest of the fan-out', () => {
  it('keeps attempting and persisting the remaining channels after one notification.create rejects', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser()) },
      notificationPreference: {
        // sms, whatsapp and inapp all on; channels are attempted in that order.
        findUnique: jest
          .fn()
          .mockResolvedValue({ userId: 'u1', category: 'account', sms: true, whatsapp: true, email: false, inapp: true }),
      },
      notification: {
        create: jest
          .fn()
          .mockRejectedValueOnce(new Error('connection reset')) // sms row persist fails
          .mockResolvedValueOnce(notificationRow('whatsapp'))
          .mockResolvedValueOnce(notificationRow('inapp')),
      },
    };
    const { service, sms, whatsapp } = serviceWith(prisma);

    const result = await service.deliver({ userId: 'u1', category: 'account', title: 'Order packed', body: 'On its way' });

    // Every enabled channel was still attempted — the failure to persist
    // the sms row must not have short-circuited whatsapp/inapp.
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);
    // Only the two that actually persisted come back — the failed one is
    // logged and skipped, not thrown.
    expect(result.map((r) => r.channel)).toEqual(['whatsapp', 'inapp']);
  });
});

describe('NotificationsDeliveryService.deliver — a broken preference read degrades to defaults', () => {
  it('falls back to defaultChannelsFor(category) instead of rejecting when the preference lookup throws', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser()) },
      notificationPreference: {
        findUnique: jest.fn().mockRejectedValue(new Error('pool exhausted')),
        create: jest.fn(),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data }: { data: { channel: string } }) =>
          Promise.resolve(notificationRow(data.channel)),
        ),
      },
    };
    const { service, sms, whatsapp, email } = serviceWith(prisma);

    const result = await service.deliver({ userId: 'u1', category: 'account', title: 'Order packed', body: 'On its way' });

    // `account`'s documented default (defaultChannelsFor): sms off,
    // whatsapp/email/inapp on.
    expect(sms.send).not.toHaveBeenCalled();
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(email.sendTemplate).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.channel).sort()).toEqual(['email', 'inapp', 'whatsapp']);
    // Never attempted to persist a preference row off a lookup it couldn't trust.
    expect(prisma.notificationPreference.create).not.toHaveBeenCalled();
  });
});
