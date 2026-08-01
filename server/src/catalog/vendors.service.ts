import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from './mappers/product.mapper';
import { mapVendor } from './mappers/vendor.mapper';
import { VendorProfileService } from './vendor-profile.service';
import { VendorAvailabilityService } from './vendor-availability.service';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: VendorProfileService,
    private readonly availability: VendorAvailabilityService,
  ) {}

  /**
   * `q` searches the HomeKrafter's name, their bio and their area, so
   * "Sector 35" and "pickle" both surface kitchens on `/search`. AND
   * across terms, OR across fields — same rule as `ProductsService.list`.
   */
  async list(q?: string) {
    const terms = q ? q.trim().split(/\s+/).filter(Boolean).slice(0, 6) : [];
    const vendors = await this.prisma.vendor.findMany({
      where:
        terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { bio: { contains: term, mode: 'insensitive' as const } },
                  { area: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : undefined,
      orderBy: { name: 'asc' },
    });
    return vendors.map((v) => mapVendor(v));
  }

  async getBySlug(slug: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return mapVendor(vendor);
  }

  // -------------------------------------------------------------------
  // Follows (M15)
  //
  // `VendorFollow` had been in the schema since M8.1 with no endpoint
  // behind it: `FollowButton` was `useState` with a comment admitting it,
  // so the button lied every time it was pressed and `Vendor.followerCount`
  // was a seeded decoration. These four methods are the whole feature.
  //
  // Follow state is fetched separately from the storefront rather than
  // riding on `GET /vendors/:slug` — that route is `@Public()`, and the
  // global guard deliberately doesn't attach a user to a public route, so
  // there is no session there to answer "am *I* following this".
  // -------------------------------------------------------------------

  async followState(userId: string, slug: string) {
    const vendor = await this.requireVendor(slug);
    const follow = await this.prisma.vendorFollow.findUnique({
      where: { userId_vendorId: { userId, vendorId: vendor.id } },
    });
    return { following: Boolean(follow), followerCount: vendor.followerCount };
  }

  async follow(userId: string, slug: string) {
    const vendor = await this.requireVendor(slug);
    // Idempotent: pressing follow twice (double tap, retried request) is
    // the same state as pressing it once, not a 409.
    await this.prisma.vendorFollow.upsert({
      where: { userId_vendorId: { userId, vendorId: vendor.id } },
      create: { userId, vendorId: vendor.id },
      update: {},
    });
    return { following: true, followerCount: await this.syncFollowerCount(vendor.id) };
  }

  async unfollow(userId: string, slug: string) {
    const vendor = await this.requireVendor(slug);
    await this.prisma.vendorFollow.deleteMany({ where: { userId, vendorId: vendor.id } });
    return { following: false, followerCount: await this.syncFollowerCount(vendor.id) };
  }

  /** Storefronts the caller follows, newest follow first — `/account/following`. */
  async listFollowed(userId: string) {
    const follows = await this.prisma.vendorFollow.findMany({
      where: { userId },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
    });
    return follows.map((f) => ({ ...mapVendor(f.vendor), isFollowing: true }));
  }

  /** Counted from the rows rather than incremented — same reasoning as `ReviewAggregatesService`: a counter that drifts has nothing to notice it. */
  private async syncFollowerCount(vendorId: string): Promise<number> {
    const followerCount = await this.prisma.vendorFollow.count({ where: { vendorId } });
    await this.prisma.vendor.update({ where: { id: vendorId }, data: { followerCount } });
    return followerCount;
  }

  /** M16. Resolves the slug here so the profile service only ever deals in ids — it is also called by the seller and admin surfaces, which have a `vendorId` and no slug. */
  async profileBySlug(slug: string) {
    const vendor = await this.requireVendor(slug);
    return this.profiles.publicProfile(vendor.id);
  }

  /** M16 (M2) — what the pre-order picker needs to stop offering slots this kitchen can't cook. */
  async availabilityBySlug(slug: string) {
    const vendor = await this.requireVendor(slug);
    return this.availability.forVendor(vendor.id);
  }

  private async requireVendor(slug: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  /** Excludes `moderationStatus: "hidden"` — same rule `lib/api/products.ts#getProductsByVendor` applies (a storefront listing, not a single-item resolve). */
  async productsBySlug(slug: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { slug } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const products = await this.prisma.product.findMany({
      where: { vendorId: vendor.id, moderationStatus: { not: 'hidden' } },
      include: PRODUCT_INCLUDE,
    });
    return products.map((p) => mapProduct(p));
  }
}
