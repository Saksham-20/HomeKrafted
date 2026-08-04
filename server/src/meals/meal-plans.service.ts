import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { distanceKm, formatDistanceKm } from '../common/geo';
import { ListMealPlansQueryDto } from './dto/list-meal-plans.query.dto';
import { mapMealPlan } from './meals.mapper';

/**
 * Meal plans — the browsable half of subscriptions, `@Public()`.
 *
 * Two switches decide whether a buyer sees a plan, and they are kept apart
 * for the same reason `Product.isAvailable` and `Product.moderationStatus`
 * are: `isActive` is the kitchen saying "I am taking subscribers", and
 * `moderationStatus` is the admin's. Both must pass. Merging them would let
 * a cook toggling their own availability silently undo a moderator.
 */
@Injectable()
export class MealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListMealPlansQueryDto) {
    const terms = query.q ? query.q.split(/\s+/).filter(Boolean).slice(0, 6) : [];

    const plans = await this.prisma.mealPlan.findMany({
      where: {
        isActive: true,
        moderationStatus: 'active',
        mealType: query.mealType,
        diet: query.diet === 'non-veg' ? 'non_veg' : query.diet,
        ...(terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { description: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      include: {
        vendor: { include: { profile: true } },
        // Only the subscriptions that occupy a seat. A cancelled one has
        // given its seat back; a paused one has not — somebody away for a
        // week still expects their tiffin to be there when they return.
        _count: { select: { subscriptions: { where: { status: { in: ['active', 'paused'] } } } } },
      },
      orderBy: { pricePerMeal: 'asc' },
    });

    const buyer =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined;

    const mapped = plans.map((plan) => ({
      plan,
      payload: mapMealPlan(plan, {
        vendor: plan.vendor,
        opensAt: plan.vendor.profile?.opensAt,
        closesAt: plan.vendor.profile?.closesAt,
        subscriberCount: plan._count.subscriptions,
      }),
    }));

    // No coordinates → the whole list, and the UI says so. Location is never
    // a gate: most people decline the prompt, and one who declines must
    // still be able to see what is on offer.
    if (!buyer) return mapped.map((m) => m.payload);

    return mapped
      .map(({ plan, payload }) => {
        const km = distanceKm(buyer, { lat: plan.vendor.lat, lng: plan.vendor.lng });
        if (km > plan.vendor.deliveryRadiusKm) return null;
        return {
          ...payload,
          distanceKm: Math.round(km * 10) / 10,
          distanceLabel: formatDistanceKm(km),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async getBySlug(slug: string) {
    const plan = await this.prisma.mealPlan.findUnique({
      where: { slug },
      include: {
        vendor: { include: { profile: true } },
        _count: { select: { subscriptions: { where: { status: { in: ['active', 'paused'] } } } } },
      },
    });

    // A hidden or withdrawn plan is a 404, not a 403. Telling an anonymous
    // caller that a plan exists but is hidden leaks a moderation decision.
    if (!plan || !plan.isActive || plan.moderationStatus !== 'active') {
      throw new NotFoundException('Meal plan not found');
    }

    return mapMealPlan(plan, {
      vendor: plan.vendor,
      opensAt: plan.vendor.profile?.opensAt,
      closesAt: plan.vendor.profile?.closesAt,
      subscriberCount: plan._count.subscriptions,
    });
  }
}
