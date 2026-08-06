import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerApplicationDto, OTHER_AREA } from './dto/create-seller-application.dto';
import { mapSellerApplication } from './seller-applications.mapper';
import { categoryForSpecialties } from './specialty-taxonomy';

/**
 * Public seller-onboarding intake (M9, closing the M8.4b-flagged gap) —
 * persists straight into the real admin approval queue
 * (`AdminSellersService.listApplications`/`listPendingApplications`,
 * `server/src/admin/sellers.service.ts`), the same `SellerApplication`
 * table `approveApplication` promotes into a live `Seller` + `Vendor`.
 * No `userId` FK, same as `CorporateInquiry` — an application may
 * predate an account. Starts at the schema's own default status
 * (`"new"`), a real review-queue entry rather than the M11a frontend
 * mock's synthetic `"waitlisted"` framing.
 */
@Injectable()
export class SellerApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSellerApplicationDto) {
    const application = await this.prisma.sellerApplication.create({
      data: {
        businessName: dto.businessName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        // Derived when the client doesn't send it (M22 — the form stopped
        // asking). An older native app that still sends one is honoured.
        category: dto.category ?? categoryForSpecialties(dto.specialties),
        specialties: dto.specialties,
        city: dto.city,
        area: dto.area,
        areaLabel: dto.area === OTHER_AREA ? dto.areaLabel : null,
        // No `?? 10` (M19). It used to be here, and combined with the
        // column's own `@default(10)` it meant `approveApplication`'s
        // `deliveryRadiusKm || defaultRadiusKm` always saw a truthy 10 —
        // so `PlatformSetting.defaultDeliveryRadiusKm` could never apply.
        // Undefined stays NULL, which is how "they didn't say" reaches
        // approval intact.
        deliveryRadiusKm: dto.deliveryRadiusKm,
        description: dto.description,
        // An area nobody can deliver to is a waitlist entry, not a queue
        // entry. Setting it here rather than leaving it `new` keeps the
        // approval queue honest: an admin filtering for pending work
        // shouldn't see rows that cannot be approved as-is.
        ...(dto.area === OTHER_AREA ? { status: 'waitlisted' as const } : {}),
      },
    });
    return mapSellerApplication(application);
  }
}
