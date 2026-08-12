import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSellerApplicationDto, OTHER_AREA } from './dto/create-seller-application.dto';
import { mapSellerApplication } from './seller-applications.mapper';
import { categoryForSpecialties, supplyMix } from './specialty-taxonomy';
import {
  checkBusinessName,
  checkContactName,
  checkFssaiNumber,
  normalizeInstagram,
  normalizePhone,
  normalizeWebsite,
} from './application-fields';

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

  /**
   * Field checks that class-validator cannot express, run before the row
   * is written (M32).
   *
   * They live in the service rather than in custom decorators so the
   * *message* is the product: this is a public form filled in by a home
   * cook on a phone, and "businessName must match /.../" is not a thing
   * anybody can act on. Every one names the box and says what to put in
   * it.
   *
   * Reported together, not one at a time — a form that rejects three
   * fields one round trip at a time is a form people abandon.
   */
  private normalize(dto: CreateSellerApplicationDto) {
    const problems: { field: string; message: string }[] = [];

    const businessName = dto.businessName.trim();
    const businessNameError = checkBusinessName(businessName);
    if (businessNameError) problems.push({ field: 'businessName', message: businessNameError });

    const contactName = dto.contactName.trim();
    const contactNameError = checkContactName(contactName);
    if (contactNameError) problems.push({ field: 'contactName', message: contactNameError });

    const phone = normalizePhone(dto.phone);
    if ('error' in phone) problems.push({ field: 'phone', message: phone.error });

    let instagramUrl: string | null = null;
    if (dto.instagramUrl?.trim()) {
      const instagram = normalizeInstagram(dto.instagramUrl);
      if ('error' in instagram) problems.push({ field: 'instagramUrl', message: instagram.error });
      else instagramUrl = instagram.url || null;
    }

    let websiteUrl: string | null = null;
    if (dto.websiteUrl?.trim()) {
      const website = normalizeWebsite(dto.websiteUrl);
      if ('error' in website) problems.push({ field: 'websiteUrl', message: website.error });
      else websiteUrl = website.url || null;
    }

    // Only asked of somebody who says they make food, and only stored for
    // them: a candle maker who typed something into a box that should not
    // have been shown does not get a food licence recorded against their
    // name.
    const { makesFood } = supplyMix(dto.specialties);
    let fssaiNumber: string | null = null;
    if (makesFood && dto.fssaiNumber?.trim()) {
      const fssaiError = checkFssaiNumber(dto.fssaiNumber);
      if (fssaiError) problems.push({ field: 'fssaiNumber', message: fssaiError });
      else fssaiNumber = dto.fssaiNumber.replace(/\s/g, '');
    }

    if (problems.length) {
      throw new BadRequestException({
        code: 'APPLICATION_INVALID',
        message: problems[0].message,
        problems,
      });
    }

    return {
      businessName,
      contactName,
      phone: 'phone' in phone ? phone.phone : dto.phone,
      instagramUrl,
      websiteUrl,
      fssaiNumber,
    };
  }

  async create(dto: CreateSellerApplicationDto) {
    const clean = this.normalize(dto);
    const application = await this.prisma.sellerApplication.create({
      data: {
        businessName: clean.businessName,
        contactName: clean.contactName,
        email: dto.email.trim().toLowerCase(),
        phone: clean.phone,
        instagramUrl: clean.instagramUrl,
        websiteUrl: clean.websiteUrl,
        fssaiNumber: clean.fssaiNumber,
        yearsMaking: dto.yearsMaking,
        capacityPerDay: dto.capacityPerDay,
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
