import { Injectable, NotFoundException } from '@nestjs/common';
import { Vendor, VendorPhoto, VendorProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { supplyMix } from '../seller-applications/specialty-taxonomy';

/**
 * M16 (H5) — the HomeKrafter profile behind `/storefront/[vendor]`,
 * `/seller/profile` and the admin verification panel.
 *
 * **Nothing this service returns as a signal is stored.** Trust, badges
 * and completion are all computed on read from rows that already exist
 * (verification flags, review aggregates, delivered orders, tenure,
 * cancellations). That is the same rule M15 set for rating aggregates,
 * for the same reason: a stored trust score is a number with no owner,
 * and it stops being true the first time a kitchen's behaviour changes
 * without anyone remembering to recompute it.
 *
 * **The badge is the product.** A buyer ordering food from a stranger's
 * kitchen is trusting the badge, so the write path for verification is
 * admin-only (`AdminSellersService.setVerification`). This service is
 * careful to distinguish *claimed* from *verified* — `fssaiNumber` set
 * with `fssaiVerified` false is a claim, and `publicProfile` never
 * publishes the number itself, only the verified fact.
 */

export interface TrustSignal {
  key: string;
  label: string;
  /** Whether this kitchen has it. Unearned signals are still returned — a seller needs to see what is missing. */
  earned: boolean;
  /** Human detail, e.g. "142 orders delivered". Present whether earned or not. */
  detail: string;
  /** Points this signal contributes when earned, out of 100. */
  weight: number;
}

export type TrustTier = 'new' | 'building' | 'established' | 'trusted';

export interface TrustSummary {
  score: number;
  tier: TrustTier;
  signals: TrustSignal[];
}

export interface Achievement {
  key: string;
  label: string;
  detail: string;
}

export interface CompletionSummary {
  percent: number;
  /** Sections still empty, in the order the seller editor lists them. */
  missing: { key: string; label: string }[];
}

/** What the storefront renders. Deliberately excludes `fssaiNumber` — see the class doc. */
export interface PublicVendorProfile {
  tagline?: string;
  story?: string;
  knownFor: string[];
  languages: string[];
  prepTimeMins?: number;
  responseTimeMins?: number;
  capacityPerDay?: number;
  minOrderValue?: number;
  workingDays: number[];
  opensAt?: string;
  closesAt?: string;
  cancellationPolicy?: string;
  returnPolicy?: string;
  customOrderPolicy?: string;
  acceptsCustomOrders: boolean;
  packagingNote?: string;
  hygieneNote?: string;
  fssaiVerified: boolean;
  identityVerified: boolean;
  addressVerified: boolean;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  photos: { id: string; url: string; caption?: string; kind: string; sortOrder: number }[];
  trust: TrustSummary;
  achievements: Achievement[];
  stats: VendorStats;
}

export interface VendorStats {
  ordersDelivered: number;
  cancellationRate: number | null;
  monthsActive: number;
  rating: number;
  reviewCount: number;
  followerCount: number;
}

function optional(value: string | null): string | undefined {
  return value ?? undefined;
}

@Injectable()
export class VendorProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The storefront payload. Returns a fully-shaped profile even when the
   * `VendorProfile` row doesn't exist yet — a HomeKrafter approved five
   * minutes ago still has real trust signals (tenure, verification) and
   * still needs a storefront that renders. Absence is an empty profile,
   * never a 404.
   */
  async publicProfile(vendorId: string): Promise<PublicVendorProfile> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { profile: true, photos: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const stats = await this.stats(vendor);
    const profile = vendor.profile;

    return {
      tagline: optional(profile?.tagline ?? null),
      story: optional(profile?.story ?? null),
      knownFor: profile?.knownFor ?? [],
      languages: profile?.languages ?? [],
      prepTimeMins: profile?.prepTimeMins ?? undefined,
      responseTimeMins: profile?.responseTimeMins ?? undefined,
      capacityPerDay: profile?.capacityPerDay ?? undefined,
      minOrderValue: profile?.minOrderValue != null ? Number(profile.minOrderValue) : undefined,
      workingDays: profile?.workingDays ?? [],
      opensAt: optional(profile?.opensAt ?? null),
      closesAt: optional(profile?.closesAt ?? null),
      cancellationPolicy: optional(profile?.cancellationPolicy ?? null),
      returnPolicy: optional(profile?.returnPolicy ?? null),
      customOrderPolicy: optional(profile?.customOrderPolicy ?? null),
      acceptsCustomOrders: profile?.acceptsCustomOrders ?? false,
      packagingNote: optional(profile?.packagingNote ?? null),
      hygieneNote: optional(profile?.hygieneNote ?? null),
      // Verified facts only. The submitted FSSAI number is a licence
      // identifier belonging to the HomeKrafter; publishing it on a page
      // anyone can scrape buys the buyer nothing the badge doesn't.
      fssaiVerified: profile?.fssaiVerified ?? false,
      identityVerified: profile?.identityVerified ?? false,
      addressVerified: profile?.addressVerified ?? false,
      instagramUrl: optional(profile?.instagramUrl ?? null),
      facebookUrl: optional(profile?.facebookUrl ?? null),
      youtubeUrl: optional(profile?.youtubeUrl ?? null),
      websiteUrl: optional(profile?.websiteUrl ?? null),
      photos: vendor.photos.map(mapPhoto),
      trust: this.trust(profile, stats),
      achievements: this.achievements(profile, stats),
      stats,
    };
  }

  /**
   * The seller's own view — everything in the public profile plus the
   * things only they should see: the FSSAI number they submitted, whether
   * an admin has acted on it, and how complete the profile is.
   */
  async ownProfile(vendorId: string) {
    const publicPart = await this.publicProfile(vendorId);
    const [profile, seller] = await Promise.all([
      this.prisma.vendorProfile.findUnique({ where: { vendorId } }),
      // Only for `makesFood` below — the completion meter must not ask a
      // candle maker for a food licence (M22).
      this.prisma.seller.findFirst({ where: { vendorId }, select: { specialties: true } }),
    ]);
    return {
      ...publicPart,
      fssaiNumber: optional(profile?.fssaiNumber ?? null),
      fssaiExpiry: profile?.fssaiExpiry?.toISOString(),
      verifiedAt: profile?.verifiedAt?.toISOString(),
      verificationNote: optional(profile?.verificationNote ?? null),
      completion: this.completion(
        profile,
        publicPart.photos.length,
        supplyMix(seller?.specialties ?? []).makesFood,
      ),
    };
  }

  // -------------------------------------------------------------------
  // Signals — every number below is counted, none is stored
  // -------------------------------------------------------------------

  private async stats(vendor: Vendor): Promise<VendorStats> {
    const productIds = (
      await this.prisma.product.findMany({ where: { vendorId: vendor.id }, select: { id: true } })
    ).map((p) => p.id);

    // A vendor's orders are the orders containing one of its products —
    // the same scoping `SellerOrdersService` uses, so "142 delivered" here
    // and the seller's own order list can never disagree.
    const scope = { items: { some: { productId: { in: productIds } } } };
    const [ordersDelivered, ordersCancelled, ordersSettled] =
      productIds.length === 0
        ? [0, 0, 0]
        : await Promise.all([
            this.prisma.order.count({ where: { ...scope, status: 'delivered' } }),
            this.prisma.order.count({ where: { ...scope, status: 'cancelled' } }),
            this.prisma.order.count({ where: { ...scope, status: { in: ['delivered', 'cancelled'] } } }),
          ]);

    const monthsActive = Math.max(
      0,
      Math.floor((Date.now() - vendor.joinedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
    );

    return {
      ordersDelivered,
      // Null rather than 0 when nothing has closed yet: a brand-new
      // kitchen has an *unknown* cancellation rate, and rendering "0%
      // cancelled" for someone who has never taken an order is a claim we
      // haven't earned the right to make.
      cancellationRate: ordersSettled === 0 ? null : ordersCancelled / ordersSettled,
      monthsActive,
      rating: Number(vendor.rating),
      reviewCount: vendor.reviewCount,
      followerCount: vendor.followerCount,
    };
  }

  private trust(profile: VendorProfile | null, stats: VendorStats): TrustSummary {
    const signals: TrustSignal[] = [
      {
        key: 'identity',
        label: 'Identity verified',
        earned: profile?.identityVerified ?? false,
        detail: profile?.identityVerified
          ? 'Homekrafted has checked who runs this kitchen'
          : 'Not checked yet',
        weight: 15,
      },
      {
        key: 'address',
        label: 'Address verified',
        earned: profile?.addressVerified ?? false,
        detail: profile?.addressVerified ? 'Kitchen address confirmed' : 'Not confirmed yet',
        weight: 10,
      },
      {
        key: 'fssai',
        label: 'FSSAI registered',
        earned: profile?.fssaiVerified ?? false,
        detail: profile?.fssaiVerified
          ? 'Food licence checked by Homekrafted'
          : profile?.fssaiNumber
            ? 'Licence submitted, awaiting check'
            : 'No licence on file',
        weight: 20,
      },
      {
        key: 'reviews',
        label: 'Well reviewed',
        earned: stats.reviewCount >= 5 && stats.rating >= 4,
        detail:
          stats.reviewCount === 0
            ? 'No reviews yet'
            : `${stats.rating.toFixed(1)} from ${stats.reviewCount} review${stats.reviewCount === 1 ? '' : 's'}`,
        weight: 20,
      },
      {
        key: 'volume',
        label: 'Proven track record',
        earned: stats.ordersDelivered >= 25,
        detail: `${stats.ordersDelivered} order${stats.ordersDelivered === 1 ? '' : 's'} delivered`,
        weight: 15,
      },
      {
        key: 'tenure',
        label: 'Established',
        earned: stats.monthsActive >= 6,
        detail:
          stats.monthsActive < 1
            ? 'Joined this month'
            : `${stats.monthsActive} month${stats.monthsActive === 1 ? '' : 's'} on Homekrafted`,
        weight: 10,
      },
      {
        key: 'reliability',
        label: 'Rarely cancels',
        // Unknown is not earned, but it is also not a black mark — the
        // detail line says so rather than showing a punitive 0.
        earned: stats.cancellationRate !== null && stats.cancellationRate <= 0.05,
        detail:
          stats.cancellationRate === null
            ? 'Not enough orders to say yet'
            : `${Math.round(stats.cancellationRate * 100)}% of orders cancelled`,
        weight: 10,
      },
    ];

    const score = signals.reduce((sum, signal) => sum + (signal.earned ? signal.weight : 0), 0);
    return { score, tier: tierFor(score), signals };
  }

  /**
   * Badges, derived. Each one is a fact a buyer could verify from the page
   * itself — no "Top seller" that means nothing, and no achievement that
   * survives the behaviour that earned it going away.
   */
  private achievements(profile: VendorProfile | null, stats: VendorStats): Achievement[] {
    const earned: Achievement[] = [];

    if (stats.monthsActive < 1 && stats.ordersDelivered < 10) {
      earned.push({
        key: 'new',
        label: 'New kitchen',
        detail: 'Just opened on Homekrafted',
      });
    }
    if (profile?.fssaiVerified) {
      earned.push({ key: 'fssai', label: 'FSSAI registered', detail: 'Food licence verified' });
    }
    for (const milestone of [500, 250, 100, 50]) {
      if (stats.ordersDelivered >= milestone) {
        earned.push({
          key: `orders-${milestone}`,
          label: `${milestone}+ orders`,
          detail: `${stats.ordersDelivered} delivered so far`,
        });
        break;
      }
    }
    if (stats.rating >= 4.7 && stats.reviewCount >= 10) {
      earned.push({
        key: 'top-rated',
        label: 'Top rated',
        detail: `${stats.rating.toFixed(1)} across ${stats.reviewCount} reviews`,
      });
    }
    if (stats.followerCount >= 50) {
      earned.push({
        key: 'loved',
        label: 'Local favourite',
        detail: `${stats.followerCount} people follow this kitchen`,
      });
    }
    if (stats.monthsActive >= 12) {
      const years = Math.floor(stats.monthsActive / 12);
      earned.push({
        key: 'tenure',
        label: `${years} year${years === 1 ? '' : 's'} on Homekrafted`,
        detail: 'Still cooking',
      });
    }

    return earned;
  }

  /**
   * What the seller's nudge counts. Weighted by what a buyer actually
   * reads before ordering, not by field count — a story and kitchen
   * photos move a purchase decision; a YouTube link does not, so social
   * links are one small section rather than four fields.
   *
   * **`makesFood` drops the FSSAI section entirely for a craft-only
   * HomeKrafter (M33).** M22 established that a food licence is only ever
   * *asked of* somebody who makes food — asking a candle maker for one
   * reads as a requirement they cannot meet, on the screen that decides
   * whether they finish setting up. The verification card and the
   * profile editor both honoured that; this meter did not, so a candle
   * maker was told in plain words that their profile was incomplete until
   * they supplied a food licence. It was invisible until M33, because
   * until then nothing could make an existing account craft-only.
   *
   * The percentage is therefore a **fraction of the sections that apply**,
   * not a sum of fixed weights. Dropping a 5-point section from a
   * hardcoded /100 would cap a craft maker at 95% forever, which is the
   * same bug wearing a different number.
   */
  private completion(
    profile: VendorProfile | null,
    photoCount: number,
    makesFood: boolean,
  ): CompletionSummary {
    const sections: { key: string; label: string; done: boolean; weight: number }[] = [
      { key: 'tagline', label: 'A one-line tagline', done: Boolean(profile?.tagline), weight: 10 },
      { key: 'story', label: 'Your story', done: Boolean(profile?.story), weight: 20 },
      { key: 'photos', label: 'Kitchen photos', done: photoCount > 0, weight: 15 },
      {
        key: 'knownFor',
        label: 'What you are known for',
        done: (profile?.knownFor?.length ?? 0) > 0,
        weight: 10,
      },
      {
        key: 'hours',
        label: 'Working days and hours',
        done: (profile?.workingDays?.length ?? 0) > 0 && Boolean(profile?.opensAt),
        weight: 10,
      },
      {
        key: 'prep',
        label: 'How long you need to prepare an order',
        done: profile?.prepTimeMins != null,
        weight: 10,
      },
      {
        key: 'hygiene',
        label: 'How you handle hygiene and packaging',
        done: Boolean(profile?.hygieneNote) || Boolean(profile?.packagingNote),
        weight: 10,
      },
      {
        key: 'policies',
        label: 'Cancellation and return policy',
        done: Boolean(profile?.cancellationPolicy) && Boolean(profile?.returnPolicy),
        weight: 10,
      },
      ...(makesFood
        ? [
            {
              key: 'fssai',
              label: 'Your FSSAI licence number',
              // Submitted is enough here — verification is the admin's job,
              // and a seller must not be stuck at 95% waiting on us.
              done: Boolean(profile?.fssaiNumber),
              weight: 5,
            },
          ]
        : []),
    ];

    const total = sections.reduce((sum, s) => sum + s.weight, 0);
    const earned = sections.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0);
    return {
      // Rounded, so a full craft profile reads 100 and not 99.99. `total`
      // is 100 for a food kitchen, so nothing changes for them.
      percent: total === 0 ? 0 : Math.round((earned / total) * 100),
      missing: sections.filter((s) => !s.done).map((s) => ({ key: s.key, label: s.label })),
    };
  }
}

function tierFor(score: number): TrustTier {
  if (score >= 75) return 'trusted';
  if (score >= 45) return 'established';
  if (score >= 20) return 'building';
  return 'new';
}

export function mapPhoto(photo: VendorPhoto) {
  return {
    id: photo.id,
    url: photo.url,
    caption: photo.caption ?? undefined,
    kind: photo.kind,
    sortOrder: photo.sortOrder,
  };
}
