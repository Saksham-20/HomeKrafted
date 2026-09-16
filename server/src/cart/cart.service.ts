import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cart } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCashback, computeShipping } from '../common/pricing/pricing.util';
import { resolveCartLines } from '../common/pricing/resolve-cart-line';
import { isPurchasable } from '../catalog/moderation';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { AddHamperItemDto } from './dto/add-hamper-item.dto';
import { otherMakerConflict } from './one-maker-cart';
import { AdminSettingsService } from '../admin/settings.service';
import { foodComingSoon } from '../common/food-orders';

/**
 * Owner-scoped (auth): `Cart` is 1:1 per user (`userId @unique`), so
 * `GET /cart` can only ever resolve the caller's own cart — there's no
 * `:userId`/`:cartId` route param to guess. Every item-level mutation
 * additionally re-checks the parent cart's `userId` in
 * `assertOwnedItem` before touching a row, so a client can't
 * update/remove/reassign another account's line by guessing a `CartItem`
 * id either. Every price is recomputed server-side via
 * `resolveCartLine`/`common/pricing` — nothing here ever trusts a
 * client-submitted amount.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AdminSettingsService,
  ) {}

  private async getOrCreateCart(userId: string): Promise<Cart> {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const [rawItems, settings, rate] = await Promise.all([
      this.prisma.cartItem.findMany({ where: { cartId: cart.id }, orderBy: { id: 'asc' } }),
      this.settings.get(),
      this.settings.getCommissionRate(),
    ]);
    const lines = await resolveCartLines(this.prisma, rawItems, rate);

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingFee = computeShipping(subtotal, settings);

    return {
      id: cart.id,
      userId: cart.userId,
      updatedAt: cart.updatedAt.toISOString(),
      items: lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      cashbackEstimate: computeCashback(subtotal),
    };
  }

  /**
   * Refuse a product from a maker other than the one already in the cart.
   *
   * Reads the vendor off the products the cart holds rather than caching
   * it on `Cart`: a denormalised column would be one more thing to keep in
   * step on every remove, and the cart is small enough that the join
   * costs nothing. The name comes back with the refusal because the
   * shopper has to be told whose basket they already have.
   *
   * An empty cart accepts anything, which is what makes "empty it and
   * start again" the way out.
   */
  private async assertSameMaker(cartId: string, vendorId: string) {
    const held = await this.prisma.cartItem.findFirst({
      where: { cartId, product: { vendorId: { not: vendorId } } },
      select: { product: { select: { vendorId: true, vendor: { select: { name: true } } } } },
    });
    if (held?.product) {
      throw new ConflictException(
        otherMakerConflict(held.product.vendorId, held.product.vendor.name),
      );
    }

    /*
     * A hamper line carries `hamperId` and a NULL `productId`, so the
     * query above cannot see it — leaving "add a hamper, then add
     * anything" as the way round the rule the retired builder was already
     * warned about in `addHamperItem`. Its maker is the maker of the
     * products inside it, which `addHamperItem` now forces to be one.
     */
    const heldHamper = await this.prisma.cartItem.findFirst({
      where: {
        cartId,
        hamper: { items: { some: { product: { vendorId: { not: vendorId } } } } },
      },
      select: {
        hamper: {
          select: {
            items: {
              where: { product: { vendorId: { not: vendorId } } },
              take: 1,
              select: { product: { select: { vendorId: true, vendor: { select: { name: true } } } } },
            },
          },
        },
      },
    });
    const other = heldHamper?.hamper?.items[0]?.product;
    if (other) {
      throw new ConflictException(otherMakerConflict(other.vendorId, other.vendor.name));
    }
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { weightOptions: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    // M22. This check did not exist before — `addItem` resolved a product
    // by id and never looked at its moderation state, so a hidden or
    // taken-down listing could be added to a cart and bought by anyone who
    // still had its id. With `pending` in the enum that gap becomes the
    // whole gate: an unreviewed listing would be purchasable by API the
    // moment it was saved.
    if (!isPurchasable(product.moderationStatus)) {
      throw new NotFoundException('Product not found');
    }
    // Food is browsable but not buyable while it is "coming soon". Before
    // the maker and stock checks: nothing else about the basket matters.
    if (product.kind === 'food' && !(await this.settings.get()).foodOrdersOpen) {
      throw foodComingSoon();
    }
    const weight = product.weightOptions.find((w) => w.sku === dto.sku);
    if (!weight) throw new NotFoundException('Weight option not found for this product');

    // One basket, one maker (`one-maker-cart.ts`). Checked before the
    // stock arithmetic so somebody adding another kitchen's dish is told
    // about the basket, not about a stock level that is not their problem.
    await this.assertSameMaker(cart.id, product.vendorId);

    const quantityToAdd = dto.quantity ?? 1;
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: dto.productId, sku: dto.sku },
    });

    const newQuantity = (existing?.quantity ?? 0) + quantityToAdd;
    if (newQuantity > weight.stock) {
      throw new BadRequestException(`Only ${weight.stock} in stock for ${dto.sku}`);
    }

    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId: dto.productId, sku: dto.sku, quantity: quantityToAdd },
      });
    }

    await this.touch(cart.id);
    return this.getCart(userId);
  }

  async addHamperItem(userId: string, dto: AddHamperItemDto) {
    const box = await this.prisma.hamperBox.findUnique({ where: { id: dto.boxId } });
    if (!box) throw new NotFoundException('Hamper box not found');

    const totalQuantity = dto.items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalQuantity > box.maxItems) {
      throw new BadRequestException(`The ${box.name} box fits up to ${box.maxItems} items`);
    }
    // Same gates as `addItem` — the retired hamper builder is still a way
    // to put a product id into a cart, so it needs every check `addItem`
    // has or it is the way round them.
    const makers = new Map<string, string>();
    for (const line of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId },
        select: { moderationStatus: true, vendorId: true, vendor: { select: { name: true } } },
      });
      if (!product || !isPurchasable(product.moderationStatus)) {
        throw new NotFoundException(`Product ${line.productId} not found`);
      }
      makers.set(product.vendorId, product.vendor.name);
    }
    /*
     * One basket, one maker — so a hamper assembled here cannot span two
     * of them either, or a single cart line would quietly hold what the
     * rule exists to prevent. The first entry is named, which is enough
     * for a shopper to see what to take out.
     */
    if (makers.size > 1) {
      const [vendorId, vendorName] = [...makers.entries()][0];
      throw new ConflictException(otherMakerConflict(vendorId, vendorName));
    }
    if (dto.recipientAddressId) {
      const address = await this.prisma.address.findUnique({ where: { id: dto.recipientAddressId } });
      if (!address || address.userId !== userId || address.archivedAt) {
        throw new NotFoundException('Recipient address not found');
      }
    }

    const cart = await this.getOrCreateCart(userId);
    const [hamperVendorId] = [...makers.keys()];
    if (hamperVendorId) await this.assertSameMaker(cart.id, hamperVendorId);
    const hamper = await this.prisma.hamper.create({
      data: {
        userId,
        boxId: dto.boxId,
        giftNote: dto.giftNote,
        wrap: dto.wrap,
        ribbon: dto.ribbon,
        nameCard: dto.nameCard,
        recipientAddressId: dto.recipientAddressId,
        hidePrice: dto.hidePrice ?? false,
        items: { create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
      },
    });
    await this.prisma.cartItem.create({ data: { cartId: cart.id, hamperId: hamper.id, quantity: 1 } });

    await this.touch(cart.id);
    return this.getCart(userId);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const item = await this.assertOwnedItem(userId, itemId);

    if (item.productId && item.sku) {
      const weight = await this.prisma.weightOption.findUnique({ where: { sku: item.sku } });
      if (weight && quantity > weight.stock) {
        throw new BadRequestException(`Only ${weight.stock} in stock for ${item.sku}`);
      }
    }

    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    await this.touch(item.cartId);
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.assertOwnedItem(userId, itemId);
    // The linked `Hamper` row (if any) is intentionally left in place — it
    // can still be referenced by an `OrderItem` later even after its
    // `CartItem` is gone (see `schema.prisma`'s `Hamper` model comment).
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touch(item.cartId);
    return this.getCart(userId);
  }

  async assignAddress(userId: string, itemId: string, addressId: string | undefined) {
    const item = await this.assertOwnedItem(userId, itemId);
    if (addressId) {
      const address = await this.prisma.address.findUnique({ where: { id: addressId } });
      // An archived address is gone as far as this account is concerned,
      // so assigning a cart line to one 404s like a stranger's would.
      if (!address || address.userId !== userId || address.archivedAt) {
        throw new NotFoundException('Address not found');
      }
    }
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { addressId: addressId ?? null } });
    await this.touch(item.cartId);
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.touch(cart.id);
  }

  /** Cross-user isolation: 404s (never 403 — doesn't leak that the id exists) if `itemId` doesn't belong to `userId`'s cart. */
  private async assertOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Cart item not found');
    const cart = await this.prisma.cart.findUnique({ where: { id: item.cartId } });
    if (!cart || cart.userId !== userId) throw new NotFoundException('Cart item not found');
    return item;
  }

  private async touch(cartId: string): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }
}
