import { Injectable, NotFoundException } from '@nestjs/common';
import { Wishlist, WishlistItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDirectlyResolvable } from '../catalog/moderation';

type WishlistWithItems = Wishlist & { items: WishlistItem[] };

function mapWishlist(wishlist: WishlistWithItems) {
  return {
    id: wishlist.id,
    userId: wishlist.userId,
    items: wishlist.items.map((i) => ({ productId: i.productId, addedAt: i.addedAt.toISOString() })),
  };
}

/**
 * Owner-scoped (auth) — every method takes `userId` from `@CurrentUser()`,
 * never a route param, so there's no way to read/mutate another account's
 * wishlist. `Wishlist` is 1:1 per user (`userId @unique`); lazily created
 * on first read/write rather than at registration, mirroring how the mock
 * `WishlistContext` starts empty.
 */
@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreate(userId: string): Promise<WishlistWithItems> {
    const existing = await this.prisma.wishlist.findUnique({ where: { userId }, include: { items: true } });
    if (existing) return existing;
    return this.prisma.wishlist.create({ data: { userId }, include: { items: true } });
  }

  async get(userId: string) {
    return mapWishlist(await this.getOrCreate(userId));
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    // Saving something is not buying it, so `isDirectlyResolvable` rather
    // than `isPurchasable`: a wishlist entry for a listing an admin later
    // hid stays, the same way an order line does. What must not happen is
    // saving a listing that was never public in the first place.
    if (!product || !isDirectlyResolvable(product.moderationStatus)) {
      throw new NotFoundException('Product not found');
    }

    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      update: {},
      create: { wishlistId: wishlist.id, productId },
    });
    return this.get(userId);
  }

  async remove(userId: string, productId: string): Promise<void> {
    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productId } });
  }
}
