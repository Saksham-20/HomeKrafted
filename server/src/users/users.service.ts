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

  async listAddresses(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  }

  async createAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      const count = await tx.address.count({ where: { userId } });
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

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await this.assertOwnedAddress(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    await this.assertOwnedAddress(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  private async assertOwnedAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }
  }
}
