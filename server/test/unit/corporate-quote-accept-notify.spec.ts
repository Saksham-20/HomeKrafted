import { CorporateQuotesService } from '../../src/corporate/corporate-quotes.service';

/**
 * Finding [35]: `CorporateController.accept()`/`decline()` discarded
 * `justAccepted`/`justDeclined` entirely, so a real five-figure commercial
 * acceptance produced no signal for an admin to actually fulfil it — the
 * class's own doc comment says the caller uses that flag "to decide
 * whether to notify".
 *
 * The fix has `CorporateQuotesService.accept()`/`decline()` themselves
 * notify every active admin exactly when the calling request is the one
 * that actually made the claim (`justAccepted`/`justDeclined`), the same
 * `NotificationsDeliveryService.deliver()` fan-out `CorporateService
 * .notifyAdmins` already uses — never for the loser of a race against a
 * link opened twice at once.
 */

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function quoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'q1',
    inquiryId: 'inq-1',
    status: 'sent',
    tokenHash: 'hash',
    revokedAt: null,
    acceptedAt: null,
    acceptedName: null,
    declinedAt: null,
    validUntil: new Date(Date.now() + 86_400_000),
    notes: null,
    subtotal: 1000,
    taxAmount: 0,
    deliveryFee: 0,
    total: 1000,
    sentAt: new Date(),
    createdAt: new Date(),
    lines: [],
    inquiry: {
      id: 'inq-1',
      companyName: 'Acme Corp',
      contactName: 'Rita',
      email: 'rita@acme.test',
      phone: '9999999999',
      occasion: null,
      estimatedQuantity: 50,
      budgetRange: null,
      message: 'Diwali hampers for the team',
      status: 'quoted',
      orderType: 'corporate',
      internalNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

function serviceWith(opts: { claimedCount: number; resultStatus: 'accepted' | 'declined' | 'sent' }) {
  const prisma = {
    corporateQuote: {
      findUnique: jest.fn().mockResolvedValue(quoteRow()),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimedCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(quoteRow({ status: opts.resultStatus })),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
    },
  };
  const notifications = { deliver: jest.fn().mockResolvedValue([]) };
  const service = new CorporateQuotesService(prisma as never, notifications as never);
  return { service, prisma, notifications };
}

describe('CorporateQuotesService.accept — notifies admins only when this request made the claim', () => {
  it('notifies every active admin when this request is the one that accepted', async () => {
    const { service, notifications, prisma } = serviceWith({ claimedCount: 1, resultStatus: 'accepted' });

    await service.accept('tok', 'Rita');
    await flush();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'admin', suspended: false } }),
    );
    expect(notifications.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        category: 'account',
        refType: 'corporateInquiry',
        refId: 'inq-1',
        title: expect.stringContaining('Acme Corp'),
      }),
    );
  });

  it('does not notify anybody when this request lost the acceptance race', async () => {
    // Zero rows claimed but the quote is already `accepted` — the ordinary
    // "clicked the emailed link twice" case, handled as a receipt, not an
    // error, and not a second notification.
    const { service, notifications, prisma } = serviceWith({ claimedCount: 0, resultStatus: 'accepted' });

    await service.accept('tok', 'Rita');
    await flush();

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(notifications.deliver).not.toHaveBeenCalled();
  });
});

describe('CorporateQuotesService.decline — notifies admins only when this request made the claim', () => {
  it('notifies every active admin when this request is the one that declined', async () => {
    const { service, notifications } = serviceWith({ claimedCount: 1, resultStatus: 'declined' });

    await service.decline('tok');
    await flush();

    expect(notifications.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        category: 'account',
        refType: 'corporateInquiry',
        refId: 'inq-1',
        title: expect.stringContaining('Acme Corp'),
      }),
    );
  });

  it('does not notify anybody when this request lost the decline race', async () => {
    const { service, notifications } = serviceWith({ claimedCount: 0, resultStatus: 'declined' });

    await service.decline('tok');
    await flush();

    expect(notifications.deliver).not.toHaveBeenCalled();
  });
});
