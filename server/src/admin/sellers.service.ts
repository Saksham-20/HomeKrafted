import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Seller, SellerApplication, SellerApplicationCategory, VendorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { areaById } from '../common/geo';
import { AssignApplicationAreaDto } from './dto/assign-application-area.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { mapVendor } from '../catalog/mappers/vendor.mapper';
import { generateReferralCode } from '../auth/referral-code.util';
import { AdminAuditLogService } from './audit-log.service';
import { VendorProfileService } from '../catalog/vendor-profile.service';
import { SetVerificationDto } from './dto/set-verification.dto';
import { AdminSettingsService } from './settings.service';

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

function vendorTypeForCategory(category: SellerApplicationCategory): VendorType {
  return VENDOR_TYPE_BY_CATEGORY[category];
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
@Injectable()
export class AdminSellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notifications: NotificationsService,
    private readonly vendorProfiles: VendorProfileService,
    private readonly settings: AdminSettingsService,
  ) {}

  async listSellers() {
    const sellers = await this.prisma.seller.findMany({
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return sellers.map((s) => mapSeller(s, s.vendor?.name));
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
    return applications.map(mapApplication);
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
    return applications.map(mapApplication);
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
          type: vendorTypeForCategory(application.category),
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

    // Welcome the new HomeKrafter. Their account exists now, so this lands
    // in an inbox they can actually open.
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
      metadata: { sellerId: result.seller.id, vendorId: result.vendor.id },
    });

    return {
      application: mapApplication(result.application),
      seller: mapSeller(result.seller, result.vendor.name),
      vendor: mapVendor(result.vendor),
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
