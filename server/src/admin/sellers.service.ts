import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Seller, SellerApplication, SellerApplicationCategory, VendorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { areaById, TRICITY_CENTRE } from '../common/geo';
import { NotificationsService } from '../notifications/notifications.service';
import { mapVendor } from '../catalog/mappers/vendor.mapper';
import { generateReferralCode } from '../auth/referral-code.util';
import { AdminAuditLogService } from './audit-log.service';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** `SellerApplicationCategory` maps 1:1 onto `VendorType` except `"other"`, which becomes a plain `"maker"` storefront — the closest fit among the 3 real marketplace `VendorType`s an application can become (mirrors `client/lib/api/admin.ts#approveSellerApplication`'s doc comment). */
function vendorTypeForCategory(category: SellerApplicationCategory): VendorType {
  return category === 'other' ? 'maker' : (category as unknown as VendorType);
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
    deliveryRadiusKm: app.deliveryRadiusKm,
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
      // against. Falls back to the tricity centre only if an application
      // predates the area field.
      const area = areaById(application.area);
      const vendorSlug = await this.uniqueVendorSlug(tx, application.businessName);
      const vendor = await tx.vendor.create({
        data: {
          slug: vendorSlug,
          name: application.businessName,
          type: vendorTypeForCategory(application.category),
          bio: application.description,
          avatarPlaceholder: `${application.businessName} — AVATAR`,
          bannerPlaceholder: `${application.businessName} — BANNER`,
          location: area ? `${area.label}, ${area.city}` : application.city,
          area: application.area,
          lat: area?.lat ?? TRICITY_CENTRE.lat,
          lng: area?.lng ?? TRICITY_CENTRE.lng,
          deliveryRadiusKm: application.deliveryRadiusKm,
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
