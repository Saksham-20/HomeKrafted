import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAttributesService } from '../../src/admin/attributes.service';

/**
 * Two concurrent `create()` calls for the same attribute key — finding
 * [20]. The duplicate-key pre-check and the `create` were two separate,
 * non-transactional steps: a second request racing the first passes the
 * pre-check (nothing has been written yet) and then hits `AttributeDefinition
 * .key`'s DB-level unique constraint on `create`, which surfaced as a raw,
 * uncaught `PrismaClientKnownRequestError` (P2002) — a 500 — instead of the
 * same actionable `ConflictException` the pre-check throws in the common
 * case.
 */

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`key`)', {
    code: 'P2002',
    clientVersion: '5.0.0',
    meta: { target: ['key'] },
  });
}

function serviceWith(options: { createThrows?: unknown } = {}) {
  const prisma = {
    attributeDefinition: {
      // The pre-check finds nothing — this is exactly the race: the
      // other request's row does not exist yet when this one checks.
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(() => {
        if (options.createThrows) return Promise.reject(options.createThrows);
        return Promise.resolve({ id: 'attr-1', key: 'metal', label: 'Metal', kind: 'select' });
      }),
    },
  };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminAttributesService(prisma as never, auditLog as never);
  return { service, auditLog };
}

describe('AdminAttributesService.create — the P2002 race', () => {
  it('translates a unique-constraint violation on create into a 409, not a raw 500', async () => {
    const { service, auditLog } = serviceWith({ createThrows: p2002() });

    await expect(
      service.create('admin-1', { key: 'metal', label: 'Metal', kind: 'select' as never }),
    ).rejects.toBeInstanceOf(ConflictException);

    // No audit row for a create that never actually happened.
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('still lets an unrelated database error propagate unmodified', async () => {
    const boom = new Error('connection lost');
    const { service } = serviceWith({ createThrows: boom });

    await expect(
      service.create('admin-1', { key: 'metal', label: 'Metal', kind: 'select' as never }),
    ).rejects.toBe(boom);
  });

  it('creates normally when there is no collision', async () => {
    const { service } = serviceWith();
    const definition = await service.create('admin-1', { key: 'metal', label: 'Metal', kind: 'select' as never });
    expect(definition.key).toBe('metal');
  });
});
