import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthResult, AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';

/**
 * `POST /rider-enrolment` — the door from "signed-in shopper" to "rider",
 * D3/R1's one-question onboarding start.
 *
 * The role is re-read live from the database rather than trusted off the
 * JWT (same rule `SellerService.resolveSeller` follows): the token this
 * request arrived on was minted before any of this ran, so it cannot be
 * the source of truth for a decision this method is about to change.
 */
@Injectable()
export class RiderEnrolmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async enrol(caller: RequestUser): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: caller.userId } });
    if (!user) {
      // Only reachable if the account was deleted between the request
      // arriving and this lookup — same class of edge case `JwtAuthGuard`
      // already treats as "the session is over".
      throw new NotFoundException('Your account could not be found.');
    }

    if (user.role === 'seller' || user.role === 'admin') {
      throw new ConflictException(
        'This number already has a HomeKrafter/admin account — use a different number to ride.',
      );
    }

    if (user.role === 'rider') {
      // Idempotent: a rider retrying this call (a flaky connection, a
      // double-tap on the enrol button) gets a fresh token pair and
      // nothing else — no second `Rider` row, no error.
      await this.prisma.rider.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
      return this.auth.issueSessionForRoleChange(user);
    }

    // `user.role === 'consumer'` — the only remaining case, since `role`
    // is a closed enum. The flip and the row creation are one
    // transaction: a rider account that exists without a `Rider` row (or
    // a role flip with no account behind it) is a state nothing else in
    // this module expects.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({ where: { id: user.id }, data: { role: 'rider' } });
      await tx.rider.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
      return updatedUser;
    });

    return this.auth.issueSessionForRoleChange(updated);
  }
}
