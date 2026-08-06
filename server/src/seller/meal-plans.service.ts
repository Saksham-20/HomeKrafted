import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapMealPlan } from '../meals/meals.mapper';
import { initialSubmission, requeueOnEdit } from '../catalog/moderation';
import { CreateMealPlanDto, UpdateMealPlanDto } from './dto/meal-plan.dto';

/** `"Monthly Pickle Box"` → `"monthly-pickle-box"`. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A HomeKrafter's own subscription plans.
 *
 * Everything here is scoped to the caller's `sellerId`. Until this existed a
 * kitchen could not create a plan at all — the three on production were
 * inserted by a script — so "HomeKrafters decide what they sell on
 * subscription" was not true of the software, only of the intention.
 *
 * Note what a seller **cannot** set: `moderationStatus`. That is the
 * admin's switch, and it is absent from both DTOs so
 * `forbidNonWhitelisted` turns an attempt into a 400 — the same rule that
 * keeps a seller from awarding themselves a verification badge (M16).
 */
@Injectable()
export class SellerMealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(sellerId: string) {
    const plans = await this.prisma.mealPlan.findMany({
      where: { sellerId },
      include: {
        vendor: { include: { profile: true } },
        _count: { select: { subscriptions: { where: { status: { in: ['active', 'paused'] } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((plan) => ({
      ...mapMealPlan(plan, {
        vendor: plan.vendor,
        opensAt: plan.vendor.profile?.opensAt,
        closesAt: plan.vendor.profile?.closesAt,
        subscriberCount: plan._count.subscriptions,
      }),
      /**
       * Only on the kitchen's own list, never on the public payload.
       * `seatsLeft` is `null` for an uncapped plan, so adding the raw count
       * to `mapMealPlan` would publish how many subscribers every kitchen
       * has to anyone who can read `GET /meal-plans`.
       */
      subscriberCount: plan._count.subscriptions,
    }));
  }

  async create(sellerId: string, vendorId: string, dto: CreateMealPlanDto) {
    await this.assertProductIsOwned(vendorId, dto.productId);

    // Slug collisions are real — two kitchens both calling a plan "Lunch".
    // Prefixing with the vendor keeps them apart without asking a cook to
    // invent a unique name.
    const vendor = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    const base = `${vendor.slug}-${slugify(dto.name)}`;
    const slug = await this.uniqueSlug(base);

    const plan = await this.prisma.mealPlan.create({
      data: {
        slug,
        vendorId,
        sellerId,
        name: dto.name,
        description: dto.description,
        mealType: dto.mealType,
        slotLabel: dto.slotLabel,
        productId: dto.productId,
        diet: dto.diet === 'non-veg' ? 'non_veg' : 'veg',
        pricePerMeal: dto.pricePerMeal,
        servingSize: dto.servingSize,
        weeklyMenu: dto.weeklyMenu ?? [],
        imagePlaceholder: dto.imagePlaceholder ?? `${slugify(dto.name)}.jpg`,
        imageSrc: dto.imageSrc,
        maxSubscribers: dto.maxSubscribers,
        isActive: dto.isActive ?? true,
        // M22 — a plan waits for review like a listing. Without this a
        // kitchen refused a listing could publish the same thing as a
        // subscription and the gate would be theatre.
        ...initialSubmission(),
      },
    });

    return mapMealPlan(plan);
  }

  async update(sellerId: string, id: string, dto: UpdateMealPlanDto) {
    const existing = await this.findOwned(sellerId, id);
    await this.assertProductIsOwned(existing.vendorId, dto.productId);

    /**
     * A price change applies to **new** subscribers only. Every existing
     * `MealSubscription` snapshotted `pricePerMeal` when it was bought, and
     * nothing here re-reads it — that is what stops a rise from silently
     * changing what somebody already paid for mid-cycle.
     */
    // Same materiality rule as a listing (see `requeueOnEdit`). The weekly
    // menu counts: it is the substance of what a subscriber is buying, and
    // on a food product it is the field most worth reviewing.
    const requeue = requeueOnEdit(
      existing.moderationStatus,
      (dto.name !== undefined && dto.name !== existing.name) ||
        (dto.description !== undefined && dto.description !== existing.description) ||
        (dto.weeklyMenu !== undefined && dto.weeklyMenu.join('\n') !== existing.weeklyMenu.join('\n')) ||
        (dto.imageSrc !== undefined && dto.imageSrc !== existing.imageSrc),
    );

    const plan = await this.prisma.mealPlan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        mealType: dto.mealType,
        slotLabel: dto.slotLabel,
        productId: dto.productId,
        diet: dto.diet ? (dto.diet === 'non-veg' ? 'non_veg' : 'veg') : undefined,
        pricePerMeal: dto.pricePerMeal,
        servingSize: dto.servingSize,
        weeklyMenu: dto.weeklyMenu,
        imagePlaceholder: dto.imagePlaceholder,
        imageSrc: dto.imageSrc,
        maxSubscribers: dto.maxSubscribers,
        isActive: dto.isActive,
        ...requeue,
      },
    });

    return mapMealPlan(plan);
  }

  /**
   * Closing a plan stops new subscribers. It does **not** touch the people
   * already on it — they paid for a run of meals, and a kitchen changing
   * its mind cannot cancel a prepaid commitment. Those cycles finish.
   */
  async close(sellerId: string, id: string) {
    await this.findOwned(sellerId, id);
    const plan = await this.prisma.mealPlan.update({
      where: { id },
      data: { isActive: false },
    });
    return mapMealPlan(plan);
  }

  /** Everything this kitchen owes, soonest first — the cook's work queue. */
  async deliveries(sellerId: string, days = 14) {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + days);

    const deliveries = await this.prisma.mealDelivery.findMany({
      where: {
        scheduledFor: { gte: from, lt: to },
        status: 'scheduled',
        subscription: { plan: { sellerId }, status: 'active' },
      },
      include: {
        subscription: {
          include: { plan: true, address: true, user: { select: { name: true, phone: true } } },
        },
      },
      orderBy: [{ scheduledFor: 'asc' }, { bracketStart: 'asc' }],
    });

    return deliveries.map((delivery) => ({
      id: delivery.id,
      scheduledFor: delivery.scheduledFor.toISOString().slice(0, 10),
      bracketStart: delivery.bracketStart,
      planName: delivery.subscription.plan.name,
      customerName: delivery.subscription.user.name,
      customerPhone: delivery.subscription.user.phone ?? undefined,
      address: {
        line1: delivery.subscription.address.line1,
        line2: delivery.subscription.address.line2 ?? undefined,
        city: delivery.subscription.address.city,
        pincode: delivery.subscription.address.pincode,
      },
    }));
  }

  /** Marks one meal delivered. Decrements the cycle — the only place that does. */
  async markDelivered(sellerId: string, deliveryId: string) {
    const delivery = await this.prisma.mealDelivery.findFirst({
      where: { id: deliveryId, subscription: { plan: { sellerId } } },
      include: { subscription: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'scheduled') {
      throw new ConflictException(`That meal is already ${delivery.status}.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mealDelivery.update({
        where: { id: deliveryId },
        data: { status: 'delivered', deliveredAt: new Date() },
      });
      // `mealsRemaining` moves here and nowhere else. A skipped meal is
      // still owed, so only an actual delivery spends one.
      await tx.mealSubscription.update({
        where: { id: delivery.subscriptionId },
        data: { mealsRemaining: { decrement: 1 } },
      });

      const after = await tx.mealSubscription.findUniqueOrThrow({
        where: { id: delivery.subscriptionId },
      });
      if (after.mealsRemaining <= 0) {
        await tx.mealSubscription.update({
          where: { id: after.id },
          data: { status: 'expired' },
        });
      }
    });

    return { ok: true };
  }

  private async findOwned(sellerId: string, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({ where: { id, sellerId } });
    if (!plan) throw new NotFoundException('Meal plan not found');
    return plan;
  }

  /**
   * A plan may only reference a listing from the same kitchen. Without this
   * a seller could attach somebody else's product to their own plan and
   * borrow its name and photo.
   */
  private async assertProductIsOwned(vendorId: string, productId?: string) {
    if (!productId) return;
    const product = await this.prisma.product.findFirst({ where: { id: productId, vendorId } });
    if (!product) {
      throw new BadRequestException('That listing is not one of yours.');
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    for (let n = 2; await this.prisma.mealPlan.findUnique({ where: { slug } }); n += 1) {
      slug = `${base}-${n}`;
    }
    return slug;
  }
}
