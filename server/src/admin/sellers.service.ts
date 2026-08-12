import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Seller, SellerApplication, SellerApplicationCategory, SellerSpecialty, VendorType } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { PASSWORD_HASH_OPTIONS } from '../auth/hashing';
import { generateTemporaryPassword } from './temp-password.util';
import { areaById } from '../common/geo';
import { AssignApplicationAreaDto } from './dto/assign-application-area.dto';
import { ListAdminSellersQueryDto } from './dto/list-admin-sellers.query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { mapVendor } from '../catalog/mappers/vendor.mapper';
import { generateReferralCode } from '../auth/referral-code.util';
import { AdminAuditLogService } from './audit-log.service';
import { VendorProfileService } from '../catalog/vendor-profile.service';
import { SetVerificationDto } from './dto/set-verification.dto';
import { AdminSettingsService } from './settings.service';
import { SellerInviteService, type InviteDeliveryReport } from './seller-invite.service';
import { vendorTypeForSpecialties } from '../seller-applications/specialty-taxonomy';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Which storefront an application becomes.
 *
 * **An exhaustive `Record`, not a cast.** This used to be
 * `category === 'other' ? 'maker' : (category as unknown as VendorType)`,
 * which only worked because the two enums happened to be member-identical
 * apart from `other`. Adding `home_chef` to `SellerApplicationCategory`
 * compiled fine under that cast and would have thrown a Prisma
 * invalid-enum error at `tx.vendor.create` — **inside the approval
 * transaction**, so an admin clicking approve got a 500.
 *
 * Written this way, the next category added fails to compile here, which
 * is the moment you want to find out.
 */
const VENDOR_TYPE_BY_CATEGORY: Record<SellerApplicationCategory, VendorType> = {
  maker: 'maker',
  baker: 'baker',
  artist: 'artist',
  // Renders identically to a maker storefront. Deliberately not its own
  // `VendorType` — a new type would churn every discovery surface for
  // nothing a buyer sees.
  home_chef: 'maker',
  other: 'maker',
};

/**
 * M22: prefer what they said they **make** over the coarse category.
 *
 * `specialties` is the field with real resolution now that it covers both
 * halves of the marketplace, and it is the only one the apply form still
 * collects. The category map stays as the fallback for legacy rows and for
 * a native app still sending one, so no existing application changes the
 * storefront it would have produced.
 */
function vendorTypeForApplication(application: {
  category: SellerApplicationCategory;
  specialties: SellerSpecialty[];
}): VendorType {
  if (application.specialties.length > 0) {
    return vendorTypeForSpecialties(application.specialties);
  }
  return VENDOR_TYPE_BY_CATEGORY[application.category];
}

function mapSeller(seller: Seller, vendorName?: string) {
  return {
    id: seller.id,
    userId: seller.userId,
    specialties: seller.specialties,
    vendorId: seller.vendorId,
    vendorName,
    displayName: seller.displayName,
    status: seller.status,
    createdAt: seller.createdAt.toISOString(),
    rating: seller.rating !== null ? Number(seller.rating) : undefined,
    reviewCount: seller.reviewCount ?? undefined,
  };
}

/**
 * Where one HomeKrafter stands between "approved" and "using the site",
 * and the credentials to get them there if they are not (M32).
 *
 * `temporaryPassword` is present **only** while it is still the account's
 * password — the moment its owner chooses their own it is `null`ed in the
 * database, so this returns nothing rather than a stale secret. That is
 * the whole reason the panel can show it persistently without it becoming
 * a permanent credential store.
 */
function mapSignInState(user: {
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  mustChangePassword: boolean;
  tempPassword: string | null;
  tempPasswordIssuedAt: Date | null;
  credentialsClaimedAt: Date | null;
}) {
  // Three states, not two. `no_credentials` is every HomeKrafter approved
  // before M32: they have an account and have never had a password, so
  // calling them "onboarded" — which two states forced — would report the
  // people most in need of a phone call as the ones needing nothing.
  // Found by running this against production, where all thirteen existing
  // kitchens came back "onboarded" and none of them had ever signed in.
  const status = user.mustChangePassword
    ? ('awaiting' as const)
    : user.passwordHash
      ? ('onboarded' as const)
      : ('no_credentials' as const);

  return {
    status,
    username: user.email ?? user.phone,
    temporaryPassword: user.mustChangePassword ? user.tempPassword : null,
    issuedAt: user.tempPasswordIssuedAt?.toISOString() ?? null,
    claimedAt: user.credentialsClaimedAt?.toISOString() ?? null,
  };
}

function mapApplication(app: SellerApplication) {
  return {
    id: app.id,
    businessName: app.businessName,
    contactName: app.contactName,
    email: app.email,
    phone: app.phone,
    category: app.category,
    specialties: app.specialties,
    city: app.city,
    area: app.area,
    // Surfaced so an admin can see an out-of-area applicant *before*
    // clicking approve, rather than discovering it from the refusal.
    areaLabel: app.areaLabel ?? undefined,
    deliveryRadiusKm: app.deliveryRadiusKm ?? undefined,
    description: app.description,
    status: app.status,
    decisionNote: app.decisionNote ?? undefined,
    createdAt: app.createdAt.toISOString(),
  };
}

export interface ApproveSellerApplicationResult {
  application: ReturnType<typeof mapApplication>;
  seller: ReturnType<typeof mapSeller>;
  vendor: ReturnType<typeof mapVendor>;
  /**
   * Whether the new HomeKrafter was actually reached, and on which
   * channel. Part of the response rather than a log line because the
   * admin who clicked approve is the only person positioned to do
   * something about a failure — and until M21 the screen showed a
   * confident success for someone who had been sent nothing they could
   * open. Carries `fallbackLink` **only** when nothing was delivered.
   */
  invite: InviteDeliveryReport;
  /**
   * The sign-in details issued alongside the invite (M32) — a username
   * and a short temporary password an admin can read out, since no
   * provider key is set and the link reaches nobody.
   *
   * Also readable later from the HomeKrafter's row, until they replace
   * it. See `User.tempPassword` for why the plaintext exists at all and
   * when to retire it.
   */
  signIn: TemporarySignInDetails;
}

/** What an admin needs in order to get a new HomeKrafter signed in (M32). */
export interface TemporarySignInDetails {
  email: string | null;
  phone: string | null;
  displayName: string;
  temporaryPassword: string;
}

/**
 * Unscoped — every read spans every seller/application, unlike
 * `SellerService` (owner-scoped to the caller's own `Seller` row).
 * `approveSellerApplication` is the one write here that touches 4 tables
 * (`User`, `Wallet`, `LoyaltyAccount`, `Vendor`, `Seller`) atomically —
 * see that method's doc comment for why a real `User` account is minted
 * here (unlike the M11a mock's synthetic placeholder id, `Seller.userId`
 * is a real FK in this schema, so a live account must exist to point at).
 */
const DEFAULT_SELLER_PAGE_SIZE = 25;

@Injectable()
export class AdminSellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly sellerInvite: SellerInviteService,
    private readonly notifications: NotificationsService,
    private readonly vendorProfiles: VendorProfileService,
    private readonly settings: AdminSettingsService,
  ) {}

  /**
   * One page of HomeKrafters, newest first.
   *
   * The slowest-growing list in the admin panel — it is bounded by supply
   * headcount rather than by customers or orders — but it is still a
   * `findMany` with no limit, and "small today" is what every one of these
   * had in common.
   */
  async listSellers(query: ListAdminSellersQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_SELLER_PAGE_SIZE;

    const where: Prisma.SellerWhereInput = {};
    // `has`, not equality: `specialties` is a list, so a HomeKrafter who
    // bakes and pickles shows under both tags.
    if (query.specialty) where.specialties = { has: query.specialty };
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      where.OR = [{ displayName: contains }, { vendor: { name: contains } }];
    }
    // "Has this kitchen actually arrived?" — expressed as a filter on the
    // account, since the evidence is a password they chose themselves
    // (M32). `awaiting` is the working queue; `onboarded` is the receipt.
    if (query.onboarding === 'awaiting') where.user = { mustChangePassword: true };
    if (query.onboarding === 'onboarded') {
      where.user = { mustChangePassword: false, passwordHash: { not: null } };
    }
    if (query.onboarding === 'no_credentials') {
      where.user = { mustChangePassword: false, passwordHash: null };
    }

    const [sellers, total] = await Promise.all([
      this.prisma.seller.findMany({
        where,
        include: {
          vendor: { select: { name: true } },
          user: {
            select: {
              email: true,
              phone: true,
              passwordHash: true,
              mustChangePassword: true,
              tempPassword: true,
              tempPasswordIssuedAt: true,
              credentialsClaimedAt: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.seller.count({ where }),
    ]);

    return {
      items: sellers.map((s) => ({
        ...mapSeller(s, s.vendor?.name),
        signIn: mapSignInState(s.user),
      })),
      page,
      pageSize,
      total,
    };
  }

  async getSellerById(id: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id }, include: { vendor: { select: { name: true } } } });
    if (!seller) throw new NotFoundException('Seller not found');
    return mapSeller(seller, seller.vendor?.name);
  }

  /**
   * The verification badge (M16). This is the only write path to
   * `VendorProfile`'s three verified flags — `PATCH /seller/profile`
   * cannot reach them, by construction. Audit-logged with the before/after
   * state, because "who said this kitchen's licence was real" is exactly
   * the question that gets asked after something goes wrong.
   */
  async setVerification(adminUserId: string, sellerId: string, dto: SetVerificationDto) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const before = await this.prisma.vendorProfile.findUnique({
      where: { vendorId: seller.vendorId },
    });

    const flags = {
      identityVerified: dto.identityVerified,
      addressVerified: dto.addressVerified,
      fssaiVerified: dto.fssaiVerified,
      fssaiExpiry: dto.fssaiExpiry ? new Date(dto.fssaiExpiry) : undefined,
      verificationNote: dto.note,
      // Stamped on any decision, including a revocation — the question is
      // "when was this last looked at", not "when was it approved".
      verifiedAt: new Date(),
    };

    const profile = await this.prisma.vendorProfile.upsert({
      where: { vendorId: seller.vendorId },
      create: { vendorId: seller.vendorId, ...flags },
      update: flags,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'seller.verification',
      targetType: 'Seller',
      targetId: sellerId,
      metadata: {
        vendorId: seller.vendorId,
        before: {
          identityVerified: before?.identityVerified ?? false,
          addressVerified: before?.addressVerified ?? false,
          fssaiVerified: before?.fssaiVerified ?? false,
        },
        after: {
          identityVerified: profile.identityVerified,
          addressVerified: profile.addressVerified,
          fssaiVerified: profile.fssaiVerified,
        },
        note: dto.note,
      },
    });

    // Tell them. A badge that appears silently teaches a HomeKrafter
    // nothing about what earned it, and a revoked one that appears
    // silently is how a support ticket starts.
    const granted = [
      dto.identityVerified === true && 'identity',
      dto.addressVerified === true && 'address',
      dto.fssaiVerified === true && 'FSSAI licence',
    ].filter(Boolean) as string[];
    const revoked = [
      dto.identityVerified === false && 'identity',
      dto.addressVerified === false && 'address',
      dto.fssaiVerified === false && 'FSSAI licence',
    ].filter(Boolean) as string[];

    if (granted.length > 0 || revoked.length > 0) {
      await this.notifications.notify({
        userId: seller.userId,
        category: 'account',
        title: granted.length > 0 ? 'Your verification is through' : 'A verification was withdrawn',
        body: [
          granted.length > 0 ? `Verified: ${granted.join(', ')}. Buyers now see this on your storefront.` : '',
          revoked.length > 0 ? `Withdrawn: ${revoked.join(', ')}.` : '',
          dto.note ?? '',
        ]
          .filter(Boolean)
          .join(' '),
        refType: 'seller',
        refId: sellerId,
      });
    }

    return this.getSellerProfile(sellerId);
  }

  /**
   * Everything about one HomeKrafter on one screen (M32).
   *
   * The list row carries a name, a status and three buttons. Anything an
   * admin actually needs in order to decide something about a kitchen —
   * who they are, how to reach them, where they sell from, what they have
   * listed, what they have sold, what they were approved on — was spread
   * across five screens or nowhere at all.
   *
   * One wave of aggregates, following the M31 rule for the seller
   * dashboard: nothing here pulls rows in order to count them in JS,
   * except the line-item revenue sum, which Prisma cannot express as an
   * aggregate over `price * quantity` and which therefore goes to SQL
   * directly.
   *
   * Contact details (email, phone) are on this payload deliberately —
   * this is the admin surface, and reaching a kitchen by phone is the
   * whole onboarding path while no provider key is set. It appears on no
   * buyer-facing route.
   */
  async getSellerDetail(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: {
        vendor: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            emailVerified: true,
            phoneVerified: true,
            suspended: true,
            authProviders: true,
            createdAt: true,
            passwordHash: true,
            mustChangePassword: true,
            tempPassword: true,
            tempPasswordIssuedAt: true,
            credentialsClaimedAt: true,
          },
        },
      },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const vendorId = seller.vendorId;
    const [
      listingsTotal,
      listingsAvailable,
      listingsPending,
      snacksTotal,
      mealPlansTotal,
      orderAgg,
      unitsAgg,
      lastOrder,
      snackAgg,
      payoutAgg,
      reviewCount,
      followerCount,
      revenueRows,
      application,
    ] = await Promise.all([
      this.prisma.product.count({ where: { vendorId } }),
      this.prisma.product.count({ where: { vendorId, isAvailable: true } }),
      this.prisma.product.count({ where: { vendorId, moderationStatus: 'pending' } }),
      this.prisma.snack.count({ where: { sellerId } }),
      this.prisma.mealPlan.count({ where: { vendorId } }),
      this.prisma.order.count({ where: { items: { some: { product: { vendorId } } } } }),
      this.prisma.orderItem.aggregate({
        where: { product: { vendorId } },
        _sum: { quantity: true },
      }),
      this.prisma.order.findFirst({
        where: { items: { some: { product: { vendorId } } } },
        orderBy: { placedAt: 'desc' },
        select: { placedAt: true },
      }),
      this.prisma.snackOrder.aggregate({
        where: { sellerId },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.payout.aggregate({
        where: { sellerId, status: 'pending' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Reviews are polymorphic (`targetType`/`targetId`), so a vendor's
      // are addressed by target, not by a foreign key.
      this.prisma.review.count({
        where: { targetType: 'vendor', targetId: vendorId, hidden: false },
      }),
      this.prisma.vendorFollow.count({ where: { vendorId } }),
      // The kitchen's **line-item share**, never the order total — an
      // order can span several kitchens, and crediting each with the whole
      // thing overstates what a home cook earned and disagrees with what
      // they are paid (`analytics.service.ts`, same rule). No status
      // filter, matching that service.
      this.prisma.$queryRaw<{ revenue: number | null }[]>`
        SELECT COALESCE(SUM(oi."price" * oi."quantity"), 0)::float AS revenue
        FROM "OrderItem" oi
        JOIN "Product" p ON p."id" = oi."productId"
        WHERE p."vendorId" = ${vendorId}
      `,
      // What they were approved on. Matched by email, the same key
      // `approveApplication` reuses an account by — so a kitchen created
      // by hand, or one whose applicant later changed their address,
      // simply has none, which is why this is nullable rather than an
      // empty object.
      seller.user.email
        ? this.prisma.sellerApplication.findFirst({
            where: { email: seller.user.email },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    return {
      seller: mapSeller(seller, seller.vendor.name),
      vendor: {
        id: seller.vendor.id,
        name: seller.vendor.name,
        slug: seller.vendor.slug,
        type: seller.vendor.type,
        bio: seller.vendor.bio ?? undefined,
        location: seller.vendor.location,
        area: seller.vendor.area ?? undefined,
        deliveryRadiusKm: seller.vendor.deliveryRadiusKm ?? undefined,
        rating: seller.vendor.rating !== null ? Number(seller.vendor.rating) : undefined,
        reviewCount: seller.vendor.reviewCount ?? undefined,
        followerCount,
      },
      contact: {
        name: seller.user.name,
        email: seller.user.email ?? undefined,
        phone: seller.user.phone ?? undefined,
        emailVerified: seller.user.emailVerified,
        phoneVerified: seller.user.phoneVerified,
        suspended: seller.user.suspended,
        authProviders: seller.user.authProviders,
        accountCreatedAt: seller.user.createdAt.toISOString(),
      },
      signIn: mapSignInState(seller.user),
      activity: {
        listings: { total: listingsTotal, available: listingsAvailable, awaitingReview: listingsPending },
        snacks: snacksTotal,
        mealPlans: mealPlansTotal,
        orderCount: orderAgg,
        unitsSold: unitsAgg._sum.quantity ?? 0,
        revenue: Number(revenueRows[0]?.revenue ?? 0),
        lastOrderAt: lastOrder?.placedAt.toISOString(),
        snackOrderCount: snackAgg._count._all,
        snackRevenue: Number(snackAgg._sum.total ?? 0),
        pendingPayoutCount: payoutAgg._count._all,
        pendingPayoutAmount: Number(payoutAgg._sum.amount ?? 0),
        reviewCount,
      },
      application: application
        ? {
            ...mapApplication(application),
            // Deliberately not `existingSeller`-decorated: on this page the
            // existing seller is the page.
          }
        : undefined,
    };
  }

  /** Everything the admin panel shows about one HomeKrafter's profile, including the submitted FSSAI number an admin has to read in order to check it. */
  async getSellerProfile(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: { vendor: { select: { slug: true } } },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    const profile = await this.prisma.vendorProfile.findUnique({
      where: { vendorId: seller.vendorId },
    });
    const own = await this.vendorProfiles.ownProfile(seller.vendorId);
    return {
      sellerId,
      vendorId: seller.vendorId,
      // So the admin can open the page they are deciding about, without
      // the panel needing a second round trip to resolve a slug.
      vendorSlug: seller.vendor.slug,
      displayName: seller.displayName,
      ...own,
      fssaiNumber: profile?.fssaiNumber ?? undefined,
      fssaiExpiry: profile?.fssaiExpiry?.toISOString(),
      verifiedAt: profile?.verifiedAt?.toISOString(),
      verificationNote: profile?.verificationNote ?? undefined,
    };
  }

  /** Suspend an active seller, or reactivate a suspended one. */
  async setSellerStatus(adminUserId: string, id: string, status: 'approved' | 'suspended') {
    const existing = await this.prisma.seller.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Seller not found');

    const updated = await this.prisma.seller.update({
      where: { id },
      data: { status },
      include: { vendor: { select: { name: true } } },
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: status === 'suspended' ? 'seller.suspend' : 'seller.reactivate',
      targetType: 'Seller',
      targetId: id,
    });

    return mapSeller(updated, updated.vendor?.name);
  }

  // -----------------------------------------------------------------
  // Onboarding approval queue — closes the `/sell` -> admin -> seller
  // access loop: a pending `SellerApplication` becomes an active
  // `Seller` (+ `Vendor` storefront) once approved.
  // -----------------------------------------------------------------

  async listApplications(status?: string) {
    const applications = await this.prisma.sellerApplication.findMany({
      where: status ? { status: status as SellerApplication['status'] } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return this.withExistingAccounts(applications);
  }

  /**
   * Assigns a real tricity area to a waitlisted application (M19).
   *
   * This is the way out of the `'other'` waitlist. Without it the waitlist
   * is a dead end: the public form accepts an out-of-area applicant,
   * `approveApplication` refuses any area that doesn't resolve, and a real
   * kitchen would sit unapprovable forever with nothing anywhere able to
   * change it.
   *
   * Moves the row back to `reviewing` so it re-enters the approval queue —
   * leaving it `waitlisted` would fix the data and still hide the row from
   * the admin who just fixed it.
   */
  async assignApplicationArea(adminUserId: string, applicationId: string, dto: AssignApplicationAreaDto) {
    const application = await this.prisma.sellerApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('Seller application not found');
    if (application.status === 'approved' || application.status === 'rejected') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    const area = areaById(dto.area);
    if (!area) {
      // Belt and braces: the DTO already restricts this to TRICITY_AREAS,
      // but the two lists must not be able to drift apart silently.
      throw new ConflictException(`"${dto.area}" is not a serviced area`);
    }

    const updated = await this.prisma.sellerApplication.update({
      where: { id: applicationId },
      data: {
        area: dto.area,
        // The typed locality is kept, not cleared: it is what the applicant
        // actually said about where they are, and an admin overriding it
        // with a nearby sector shouldn't erase the original claim.
        status: 'reviewing',
        decisionNote: dto.note ?? application.decisionNote,
      },
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'seller_application.assign_area',
      targetType: 'SellerApplication',
      targetId: applicationId,
      metadata: {
        from: application.area,
        fromLabel: application.areaLabel ?? undefined,
        to: dto.area,
      },
    });

    return mapApplication(updated);
  }

  /** Applications still awaiting a decision — every status short of the two terminal ones. */
  async listPendingApplications() {
    const applications = await this.prisma.sellerApplication.findMany({
      where: { status: { notIn: ['approved', 'rejected'] } },
      orderBy: { createdAt: 'asc' },
    });
    return this.withExistingAccounts(applications);
  }

  /**
   * Marks the applications whose applicant is already a HomeKrafter.
   *
   * `approveApplication` has refused these since M19 — `Seller.userId` is
   * unique — but the refusal arrived *after* the click, on the one screen
   * where a click sends somebody a welcome message. Somebody who does not
   * hear back and applies again is the ordinary way this happens, so the
   * queue fills with rows that look decidable and are not.
   *
   * Matched on **email**, which is what the approval guard matches on. A
   * phone match would flag more rows than the server would actually
   * refuse, and a badge that disagrees with the button is worse than no
   * badge. One query for the whole page, not one per row.
   */
  private async withExistingAccounts(applications: SellerApplication[]) {
    const emails = [...new Set(applications.map((a) => a.email))];
    const sellers = emails.length
      ? await this.prisma.seller.findMany({
          where: { user: { email: { in: emails } } },
          select: {
            id: true,
            displayName: true,
            status: true,
            createdAt: true,
            user: { select: { email: true } },
          },
        })
      : [];
    const byEmail = new Map(sellers.map((s) => [s.user.email ?? '', s]));

    return applications.map((app) => {
      const existing = byEmail.get(app.email);
      return {
        ...mapApplication(app),
        existingSeller: existing
          ? {
              id: existing.id,
              displayName: existing.displayName,
              status: existing.status,
              since: existing.createdAt.toISOString(),
            }
          : undefined,
      };
    });
  }

  async approveApplication(adminUserId: string, applicationId: string): Promise<ApproveSellerApplicationResult> {
    const application = await this.prisma.sellerApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('Seller application not found');
    if (application.status === 'approved' || application.status === 'rejected') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    // An application whose area doesn't resolve cannot be approved (M19).
    //
    // The guard is on **resolvability**, not on the literal string
    // `'other'`, on purpose: `areaById` also returns undefined for legacy
    // rows written before the area field existed, for typos, and for any
    // id later removed from `TRICITY_AREAS`. Checking `area === 'other'`
    // would leave all of those falling through to the old
    // `?? TRICITY_CENTRE` fallback — which planted the kitchen at
    // Chandigarh's exact centre, so it sorted ~0 km from every buyer and
    // passed every radius filter. That fallback is now gone entirely, so
    // there is no second path to be tempted by.
    //
    // Placed before the transaction opens: cheaper than a rollback, and it
    // matches the status checks above.
    const resolvedArea = areaById(application.area);
    if (!resolvedArea) {
      const where = application.areaLabel ?? application.area;
      throw new ConflictException(
        `Cannot approve: "${where}" is not a serviced area. Assign a tricity area to this application before approving.`,
      );
    }

    // Somebody who already has a HomeKrafter account cannot be given a
    // second one — `Seller.userId` is unique, so the `seller.create` below
    // threw a raw unique violation and the admin got a 500 with nothing
    // actionable in it. Reachable without doing anything strange: an
    // applicant who does not hear back and applies again leaves two rows
    // in the queue, and approving the second one hits this. Refused here,
    // by name, before the transaction opens.
    const existingSeller = await this.prisma.seller.findFirst({
      where: { user: { email: application.email } },
      include: { vendor: { select: { name: true } } },
    });
    if (existingSeller) {
      throw new ConflictException(
        `${application.email} already has a HomeKrafter account (${existingSeller.vendor.name}). ` +
          `Reject this duplicate application, or re-send their sign-in link from that account.`,
      );
    }

    const { defaultDeliveryRadiusKm: defaultRadiusKm } = await this.settings.get();

    const result = await this.prisma.$transaction(async (tx) => {
      // Reuse an existing account by email if one already exists (e.g. the
      // applicant already has a consumer account); otherwise mint a fresh
      // `role: "seller"` account with no password — phone-OTP is the login
      // path for an admin-provisioned account (mirrors `AuthService.verifyOtp`'s
      // first-time-phone account creation: wallet + loyalty account together).
      let user = await tx.user.findUnique({ where: { email: application.email } });
      if (user) {
        if (user.role === 'consumer') {
          user = await tx.user.update({ where: { id: user.id }, data: { role: 'seller' } });
        }
      } else {
        const referralCode = await this.uniqueReferralCode(tx, application.contactName);
        user = await tx.user.create({
          data: {
            name: application.contactName,
            email: application.email,
            phone: application.phone,
            authProviders: ['phone'],
            referralCode,
            role: 'seller',
          },
        });
        await tx.wallet.create({ data: { userId: user.id } });
        await tx.loyaltyAccount.create({ data: { userId: user.id } });
      }

      // The applicant's chosen tricity area decides where their kitchen sits
      // on the map, which is what every buyer's distance filter measures
      // against. Guaranteed to resolve — the guard above refuses anything
      // that doesn't, so there is no centroid fallback here any more.
      const area = resolvedArea;
      const vendorSlug = await this.uniqueVendorSlug(tx, application.businessName);
      const vendor = await tx.vendor.create({
        data: {
          slug: vendorSlug,
          name: application.businessName,
          type: vendorTypeForApplication(application),
          bio: application.description,
          avatarPlaceholder: `${application.businessName} — AVATAR`,
          bannerPlaceholder: `${application.businessName} — BANNER`,
          location: `${area.label}, ${area.city}`,
          area: application.area,
          lat: area.lat,
          lng: area.lng,
          // M16 (M5): the platform default when an application didn't
          // state one, rather than a constant nobody could change.
          deliveryRadiusKm: application.deliveryRadiusKm || defaultRadiusKm,
        },
      });

      // One role: an approved application always produces a full
      // HomeKrafter with a storefront and every module. What they said they
      // make becomes `specialties`, which is discovery metadata only.
      const seller = await tx.seller.create({
        data: {
          userId: user.id,
          specialties: application.specialties.length ? application.specialties : ['homemade_food'],
          vendorId: vendor.id,
          displayName: application.businessName,
          status: 'approved',
        },
      });

      const decidedApplication = await tx.sellerApplication.update({
        where: { id: applicationId },
        data: { status: 'approved' },
      });

      return { application: decidedApplication, seller, vendor };
    });

    // Get them a way in, **out of band**, before anything else.
    //
    // The in-app welcome below used to be the only thing approval sent,
    // and it is delivered to an inbox behind the login this account cannot
    // pass: it is minted with `authProviders: ['phone']` and no
    // credential, and phone OTP needs an SMS provider. An approved
    // HomeKrafter therefore could not sign in at all — the standing
    // blocker in `CLAUDE.md` that capped supply growth.
    const invite = await this.sellerInvite.sendApprovalInvite({
      userId: result.seller.userId,
      displayName: result.seller.displayName,
      email: application.email,
      phone: application.phone,
    });

    // And a password, issued in the same breath (M32).
    //
    // This reverses the M21 rule that approval mints an account with no
    // credential at all. That rule was right when the invite link was
    // expected to arrive; it is not right today, when no provider key is
    // set and the link reaches nobody, because it left every approved
    // kitchen with an account and no door. An admin now has something
    // short enough to read down a phone, on the row, from the moment
    // approval happens.
    //
    // The safety properties are the ones documented on
    // `issueTemporaryPassword` and on `User.tempPassword`: forced
    // rotation at first sign-in, cleared the moment the owner chooses
    // their own, never in an audit row or a public payload. Revisit once
    // SendGrid/Twilio exist — with real delivery, the link is better and
    // this should go back to being nothing.
    const signIn = await this.issueTemporaryPassword(adminUserId, result.seller.id, {
      audit: false,
    });

    // Kept, but it is now the second copy rather than the only one. It is
    // what they find waiting once the invite has got them inside.
    await this.notifications.notify({
      userId: result.seller.userId,
      category: 'account',
      title: 'You are a HomeKrafter',
      body: `${result.seller.displayName} is approved and live. Add your first items from the Listings or Menu tab, then switch them on when you are ready to take orders.`,
      refType: 'seller',
      refId: result.seller.id,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'seller_application.approve',
      targetType: 'SellerApplication',
      targetId: applicationId,
      metadata: {
        sellerId: result.seller.id,
        vendorId: result.vendor.id,
        // Whether the person was actually contacted is part of the record
        // of approving them. **Never the link itself** — that is a live
        // single-use credential, and the audit log is read by more people
        // than the one it belongs to.
        inviteReached: invite.reached,
        inviteEmail: { attempted: invite.email.attempted, delivered: invite.email.delivered },
        inviteSms: { attempted: invite.sms.attempted, delivered: invite.sms.delivered },
      },
    });

    return {
      application: mapApplication(result.application),
      seller: mapSeller(result.seller, result.vendor.name),
      vendor: mapVendor(result.vendor),
      // Surfaced so the admin screen can say "approved, but we could not
      // reach them" instead of a confident success. `fallbackLink` is
      // present only when nothing was delivered, and is what an admin
      // passes on by hand.
      invite,
      // The credentials themselves, so the admin has something to read
      // out the moment approval lands rather than hunting for a button.
      // They also stay on the HomeKrafter's row until claimed.
      signIn,
    };
  }

  async rejectApplication(adminUserId: string, applicationId: string) {
    const application = await this.prisma.sellerApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('Seller application not found');
    if (application.status === 'approved' || application.status === 'rejected') {
      throw new ConflictException(`Application is already ${application.status}`);
    }

    const updated = await this.prisma.sellerApplication.update({
      where: { id: applicationId },
      data: { status: 'rejected' },
    });

    // Only reachable if they already have an account — an application can
    // predate one (there's no userId FK), so this is best-effort.
    const applicantUser = await this.prisma.user.findUnique({ where: { email: application.email } });
    if (applicantUser) {
      await this.notifications.notify({
        userId: applicantUser.id,
        category: 'account',
        title: 'About your HomeKrafter application',
        body: 'We could not take your application forward this time. Reply to this and we will explain what would change our mind.',
        refType: 'seller_application',
        refId: applicationId,
      });
    }

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'seller_application.reject',
      targetType: 'SellerApplication',
      targetId: applicationId,
    });

    return mapApplication(updated);
  }

  private async uniqueReferralCode(tx: Prisma.TransactionClient, nameSeed: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateReferralCode(nameSeed, attempt);
      const clash = await tx.user.findUnique({ where: { referralCode: code } });
      if (!clash) return code;
    }
    throw new ConflictException('Could not allocate a unique referral code — please retry');
  }

  /**
   * Re-sends the sign-in invite for an already-approved HomeKrafter.
   *
   * Needed the moment approval started sending one: the message goes to an
   * email address somebody typed into a form, it expires in a week, and
   * the most common support request on any invite flow is "it never
   * arrived". Without this the only remedy is a second application, which
   * the duplicate guard above now correctly refuses.
   *
   * Issuing a new invite **burns the previous one** (see
   * `SellerInviteService.createInviteLink`) — a re-send must not leave the
   * older link alive, or a forwarded message still opens the account.
   */
  async resendInvite(adminUserId: string, sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: { user: { select: { id: true, email: true, phone: true, suspended: true } } },
    });
    if (!seller) throw new NotFoundException('HomeKrafter not found');
    if (seller.status !== 'approved') {
      throw new ConflictException('Only an approved HomeKrafter has an account to sign in to.');
    }
    // A suspended account must not be handed a fresh way in — same rule
    // `forgotPassword` already applies.
    if (seller.user.suspended) {
      throw new ConflictException('This account is suspended. Un-suspend it before re-sending a sign-in link.');
    }

    const invite = await this.sellerInvite.sendApprovalInvite({
      userId: seller.userId,
      displayName: seller.displayName,
      email: seller.user.email,
      phone: seller.user.phone,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'seller.invite_resent',
      targetType: 'Seller',
      targetId: sellerId,
      metadata: { inviteReached: invite.reached },
    });

    return { invite };
  }

  /**
   * Mints a temporary password for an approved HomeKrafter and returns it
   * to the admin **once** (M32).
   *
   * This exists because the invite link cannot be delivered: SendGrid and
   * Twilio are unset in production, so `sendApprovalInvite` degrades to a
   * logged stub and the only way a real kitchen gets in is an admin
   * reading something out over the phone. A link is 200 characters of
   * base16; a password is sixteen characters in four groups. That is the
   * whole difference, and it is the difference between an onboarding call
   * that works and one that doesn't.
   *
   * **Why this does not reopen "an admin must never set a HomeKrafter's
   * password" (CLAUDE.md).** That rule protects against an admin holding
   * a working credential for an account that can change payout details.
   * Three things keep that true here, and none may be removed:
   *
   * 1. **The password is never stored.** Only its argon2 hash is written;
   *    the plaintext exists in one HTTP response and nowhere else — not
   *    in the audit row, not in a column, not in a log line.
   * 2. **It dies on first use.** `mustChangePassword` is set, and
   *    `JwtAuthGuard` refuses every route except the change-password
   *    screen until the owner replaces it. The admin's copy stops working
   *    the moment the real HomeKrafter arrives.
   * 3. **It is deliberate and audited.** Approval still mints an account
   *    with no password at all — an admin has to choose this, on the
   *    record, per account.
   *
   * Worth stating plainly: between minting and first use, an admin can
   * sign in as this HomeKrafter. That was **already** true before this
   * endpoint — `resendInvite` returns a working set-password link to the
   * same admin whenever delivery is stubbed — so this does not add a
   * capability, it adds a forced rotation and an audit trail to one that
   * existed. Revisit the whole shape once real provider keys are set.
   */
  async issueTemporaryPassword(
    adminUserId: string,
    sellerId: string,
    options: { audit?: boolean } = {},
  ) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      include: { user: { select: { id: true, email: true, phone: true, suspended: true } } },
    });
    if (!seller) throw new NotFoundException('HomeKrafter not found');
    if (seller.status !== 'approved') {
      throw new ConflictException('Only an approved HomeKrafter has an account to sign in to.');
    }
    if (seller.user.suspended) {
      throw new ConflictException(
        'This account is suspended. Un-suspend it before issuing sign-in details.',
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, PASSWORD_HASH_OPTIONS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: seller.userId },
        data: {
          passwordHash,
          mustChangePassword: true,
          // Kept legible until its owner replaces it, so the admin can
          // read it out again tomorrow — see the field's doc comment for
          // why that exception is bounded and when to retire it.
          tempPassword: temporaryPassword,
          tempPasswordIssuedAt: new Date(),
        },
      }),
      // Any session already open on this account dies with the old
      // credential — including one an admin opened with a previous
      // temporary password.
      this.prisma.refreshToken.updateMany({
        where: { userId: seller.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    // The invite link is deliberately **left alive**. An earlier draft
    // burned it here, on "two working ways in is one too many" — which is
    // wrong on this flow: the link goes to the HomeKrafter's own inbox
    // and the password goes through an admin, so they are two routes to
    // the same person, not a widened attack surface. Killing the link
    // would break the good case (their email works) to tidy up the bad
    // one. Both are single-use in effect: the link consumes itself, and
    // the password is force-rotated at first sign-in.

    // Skipped when this runs as part of approval, which writes its own
    // row a moment later — two entries for one admin action reads as two
    // actions.
    if (options.audit !== false) {
      await this.auditLog.log({
        actorId: adminUserId,
        action: 'seller.temp_password_issued',
        targetType: 'Seller',
        targetId: sellerId,
        // Never the password itself. Same rule as the approve audit row,
        // which deliberately omits the invite link.
        metadata: { userId: seller.userId, mustChangePassword: true },
      });
    }

    return {
      // The identifier half of "sign-in details" — an admin reading this
      // out needs both, and the account may be phone-only.
      email: seller.user.email,
      phone: seller.user.phone,
      temporaryPassword,
      displayName: seller.displayName,
    };
  }

  private async uniqueVendorSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const exists = await tx.vendor.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
