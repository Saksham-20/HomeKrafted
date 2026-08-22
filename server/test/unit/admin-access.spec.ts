import { BadRequestException } from '@nestjs/common';
import { AdminUsersService } from '../../src/admin/users.service';

/**
 * Sub-admins (M47) — the four guardrails.
 *
 * Each exists because the failure it prevents is silent or irreversible:
 * an operator quietly giving themselves the money screen, or the platform
 * ending up with nobody who can hand out access at all. None of them show
 * up on the happy path, which is why they are tested rather than reviewed.
 */

interface Row {
  id: string;
  role: 'consumer' | 'seller' | 'admin';
  adminScopes: string[];
}

function serviceWith(rows: Row[], otherUsersScopeHolders = 0) {
  const writes: Record<string, unknown>[] = [];
  const audited: Record<string, unknown>[] = [];

  const prisma = {
    user: {
      findUnique: jest.fn().mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === args.where.id) ?? null),
      ),
      count: jest.fn().mockResolvedValue(otherUsersScopeHolders),
      update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        writes.push(args.data);
        return Promise.resolve({ id: 'u1', role: args.data.role });
      }),
    },
  };
  const auditLog = {
    log: jest.fn().mockImplementation((entry: Record<string, unknown>) => {
      audited.push(entry);
      return Promise.resolve(undefined);
    }),
  };

  return {
    service: new AdminUsersService(prisma as never, auditLog as never),
    writes,
    audited,
  };
}

const CONSUMER: Row = { id: 'u1', role: 'consumer', adminScopes: [] };
const FULL_ADMIN: Row = {
  id: 'u1',
  role: 'admin',
  adminScopes: ['catalog', 'users', 'finance'],
};

describe('AdminUsersService.setAdminAccess', () => {
  it('promotes a consumer to a scoped sub-admin', async () => {
    const { service, writes } = serviceWith([CONSUMER]);
    await service.setAdminAccess('admin-9', 'u1', {
      isAdmin: true,
      scopes: ['catalog', 'support'] as never,
    });
    expect(writes[0]).toEqual({ role: 'admin', adminScopes: ['catalog', 'support'] });
  });

  it('refuses an admin with no sections, because that account can reach nothing', async () => {
    const { service, writes } = serviceWith([CONSUMER]);
    await expect(
      service.setAdminAccess('admin-9', 'u1', { isAdmin: true, scopes: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writes).toHaveLength(0);
  });

  it('refuses an admin changing their own access — no self-elevation, no self-lockout', async () => {
    const { service, writes } = serviceWith([FULL_ADMIN]);
    await expect(
      service.setAdminAccess('u1', 'u1', { isAdmin: true, scopes: ['finance'] as never }),
    ).rejects.toThrow(/your own admin access/i);
    expect(writes).toHaveLength(0);
  });

  it('refuses removing the last admin who can grant access', async () => {
    const { service, writes } = serviceWith([FULL_ADMIN], 0);
    await expect(
      service.setAdminAccess('admin-9', 'u1', { isAdmin: false, scopes: [] }),
    ).rejects.toThrow(/last admin/i);
    expect(writes).toHaveLength(0);
  });

  it('allows it once somebody else holds the users scope', async () => {
    const { service, writes } = serviceWith([FULL_ADMIN], 1);
    await service.setAdminAccess('admin-9', 'u1', { isAdmin: false, scopes: [] });
    expect(writes[0]).toEqual({ role: 'consumer', adminScopes: [] });
  });

  it('also refuses dropping just the users scope from the last holder', async () => {
    const { service } = serviceWith([FULL_ADMIN], 0);
    await expect(
      service.setAdminAccess('admin-9', 'u1', {
        isAdmin: true,
        scopes: ['catalog', 'finance'] as never,
      }),
    ).rejects.toThrow(/last admin/i);
  });

  it('clears the scopes when admin access is removed, not just the role', async () => {
    const { service, writes } = serviceWith([FULL_ADMIN], 1);
    await service.setAdminAccess('admin-9', 'u1', {
      isAdmin: false,
      scopes: ['finance'] as never,
    });
    // The scopes in the payload are ignored: a demoted account keeping a
    // list of sections is a row that reads as an admin to anything that
    // looks at scopes rather than role.
    expect(writes[0]).toEqual({ role: 'consumer', adminScopes: [] });
  });

  it('audits the change with what it was and what it became', async () => {
    const { service, audited } = serviceWith([CONSUMER]);
    await service.setAdminAccess('admin-9', 'u1', {
      isAdmin: true,
      scopes: ['support'] as never,
    });
    expect(audited[0]).toMatchObject({ actorId: 'admin-9', action: 'user.admin_access_set' });
    expect(audited[0].metadata).toMatchObject({
      previousRole: 'consumer',
      previousScopes: [],
      scopes: ['support'],
    });
  });
});
