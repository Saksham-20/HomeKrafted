import { UserRole } from '@prisma/client';
import { SupportService } from '../../src/support/support.service';

/**
 * Finding [37]: `addMessage()` reused the `status` snapshot read at the
 * top of the method — via `getOwned()` — to decide the ticket's new
 * status, rather than re-reading it just before the write. A status
 * change racing the message (an admin resolving the ticket through the
 * admin queue, or a second concurrent message) could be silently
 * overwritten by a write built from the stale snapshot.
 *
 * The fix makes the `resolved -> in_progress` reopen a single atomic
 * conditional `updateMany` keyed on the *current* committed `status`, and
 * never writes a `status` value derived from the earlier read.
 */

function ticketStub(status: 'open' | 'in_progress' | 'resolved' | 'closed') {
  return {
    id: 't1',
    userId: 'u1',
    subject: 'Where is my order',
    channel: 'app',
    status,
    orderRef: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    messages: [],
  };
}

function serviceWith(opts: { snapshotStatus: string; updateManyCount: number }) {
  const prisma = {
    supportTicket: {
      // Every call returns the same *stale* snapshot on purpose — the
      // fix must never trust this for the status it writes.
      findUnique: jest.fn().mockResolvedValue(ticketStub(opts.snapshotStatus as never)),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateManyCount }),
      update: jest.fn().mockResolvedValue(ticketStub(opts.snapshotStatus as never)),
    },
    supportMessage: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new SupportService(prisma as never);
  return { service, prisma };
}

describe('SupportService.addMessage — the resolved-reopen race', () => {
  it('reopens atomically when the ticket is actually resolved right now, and never issues a second stale status write', async () => {
    const { service, prisma } = serviceWith({ snapshotStatus: 'resolved', updateManyCount: 1 });

    await service.addMessage('u1', UserRole.consumer, 't1', { body: 'still broken' } as never);

    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: 'resolved' },
      data: { status: 'in_progress' },
    });
    // The updateMany already reopened + bumped updatedAt — no follow-up
    // write is needed, and none should carry a status field at all.
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('never writes back the stale snapshot status when the conditional reopen finds nothing to reopen', async () => {
    // The snapshot read at the top says "resolved" — under the old code
    // this alone decided `nextStatus`. Here the atomic updateMany reports
    // 0 rows matched, meaning the ticket's *real* current status is no
    // longer `resolved` (e.g. a concurrent admin action already moved it
    // on). The fix must not fall back to writing the stale value.
    const { service, prisma } = serviceWith({ snapshotStatus: 'resolved', updateManyCount: 0 });

    await service.addMessage('u1', UserRole.consumer, 't1', { body: 'still broken' } as never);

    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: 'resolved' },
      data: { status: 'in_progress' },
    });
    // Only the updatedAt-bump call is issued, and it never touches `status`.
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: {} });
  });

  it('does not attempt the conditional reopen for an agent reply, only the updatedAt bump', async () => {
    const { service, prisma } = serviceWith({ snapshotStatus: 'resolved', updateManyCount: 0 });

    await service.addMessage('u1', UserRole.admin, 't1', { body: 'refund issued' } as never);

    expect(prisma.supportTicket.updateMany).not.toHaveBeenCalled();
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: {} });
  });

  it('bumps updatedAt without touching status for an ordinary (non-resolved) user reply', async () => {
    const { service, prisma } = serviceWith({ snapshotStatus: 'open', updateManyCount: 0 });

    await service.addMessage('u1', UserRole.consumer, 't1', { body: 'any update?' } as never);

    expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: 'resolved' },
      data: { status: 'in_progress' },
    });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: {} });
  });
});
