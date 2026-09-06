import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Address } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
      suspended: user.suspended,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      avatarSrc: user.avatarSrc,
      // M32 — `GET /users/me` is what a reload reads, so this is what
      // makes the forced password change survive one.
      mustChangePassword: user.mustChangePassword,
      // M47 — the admin shell hides sections a sub-admin cannot reach.
      adminScopes: user.adminScopes,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    if (dto.email) {
      const clash = await this.prisma.user.findFirst({ where: { email: dto.email, NOT: { id: userId } } });
      if (clash) throw new ConflictException('Another account already uses this email');
    }
    if (dto.phone) {
      const clash = await this.prisma.user.findFirst({ where: { phone: dto.phone, NOT: { id: userId } } });
      if (clash) throw new ConflictException('Another account already uses this phone number');
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.getMe(user.id);
  }

  /**
   * The buyer's live addresses.
   *
   * `archivedAt: null` because a deleted address is archived rather than
   * removed — eight tables reference `Address` under `Restrict`, so the
   * row has to survive for a two-year-old order to keep saying where it
   * went. See the column's own comment in `schema.prisma`.
   */
  async listAddresses(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      // Archived rows do not count: somebody who deleted their only
      // address and added a new one should get a default, not an
      // account whose default is a row nothing can see.
      const count = await tx.address.count({ where: { userId, archivedAt: null } });
      return tx.address.create({
        data: { ...dto, userId, isDefault: dto.isDefault ?? count === 0 },
      });
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto): Promise<Address> {
    await this.assertOwnedAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId, NOT: { id: addressId } }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id: addressId }, data: dto });
    });
  }

  /**
   * Delete an address, as far as the buyer is concerned.
   *
   * **It archives; it does not delete.** `prisma.address.delete` raised a
   * foreign-key violation for any address that had ever been in a cart or
   * on an order — which is every address anybody actually wants to tidy
   * away — and the global filter turns a `P2003` into a bare 500 with a
   * reference number. So the one thing this endpoint was for was the one
   * thing it could not do.
   *
   * The row stays because eight tables point at it under `Restrict`, and
   * that is the right relation: an order has to keep saying where it went.
   *
   * If the archived address was the default, the oldest surviving one
   * takes over. Leaving the account with no default at all is worse than
   * picking for them — checkout falls back to it, so "no default" turns
   * into "we could not work out where to send this" at the till.
   */
  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.assertOwnedAddress(userId, addressId);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: addressId },
        // `isDefault: false` in the same write: a default flag on an
        // archived row would make `findFirst({ isDefault: true })` — how
        // checkout resolves a fallback — return an address the buyer
        // cannot see and did not choose.
        data: { archivedAt: new Date(), isDefault: false },
      });
      if (!address.isDefault) return;
      const next = await tx.address.findFirst({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    });
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    await this.assertOwnedAddress(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  /**
   * The caller's own, live address — or a 404.
   *
   * An archived one 404s exactly like somebody else's, and deliberately:
   * to this account it is gone, so editing it, re-defaulting it or
   * deleting it twice must all answer the same way. Returns the row so
   * callers that need a field off it (`deleteAddress` needs `isDefault`)
   * do not fetch it a second time.
   */
  private async assertOwnedAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId || address.archivedAt) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }
}
