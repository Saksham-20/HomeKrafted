import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { lookupPincode } from '../common/pincodes';
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

    // Where they are (M36). Shape is the DTO's job; this is existence,
    // and the two get different messages because they are different
    // problems to the person typing: a typo they can fix by retyping,
    // versus a pincode we genuinely don't hold, which retyping won't fix.
    //
    // One of `pincode`/`area` is required rather than `pincode` alone —
    // a pre-M36 native client still sends only `area`, and 400ing it on a
    // field it has never heard of would break a shipped app.
    let pincode: string | null = null;
    if (dto.pincode?.trim()) {
      const value = dto.pincode.trim();
      if (!lookupPincode(value)) {
        problems.push({
          field: 'pincode',
          message: `We don't recognise the pincode ${value}. Check it against the address you post from.`,
        });
      } else {
        pincode = value;
      }
    } else if (!dto.area) {
      problems.push({
        field: 'pincode',
        message: 'Enter the 6-digit pincode you work from.',
      });
    }

    // The city, derived rather than asked (M32's rule, M36's source).
    //
    // India Post's district beats anything typed in a hurry, so it wins
    // where there is one. `dto.city` is the fallback for the legacy
    // `area`-only path, and for the case that made this a real bug: the
    // form derives its city from our own `/pincodes/:pincode` lookup, so
    // when that endpoint is unreachable it sends `""` while telling the
    // applicant the application will still go through. Refusing on the
    // empty string made our outage look like their mistake.
    //
    // `Vendor.city` is non-null, so this must resolve to something — it
    // refuses only when neither source has anything, which by the guard
    // above means a request carrying no pincode and no area at all.
    const city = (pincode ? lookupPincode(pincode)?.district : undefined) ?? dto.city?.trim() ?? '';
    if (!city) {
      problems.push({
        field: 'city',
        message: 'Tell us which city or town you work from.',
      });
    }

    // Where a rider collects (M36b). Required, because a pickup address
    // that "usually" exists is one a rider cannot be dispatched to — but
    // checked here rather than by a decorator so the message names the
    // box and says what to put in it, like every other field on this
    // public form.
    //
    // Only line 1 is compulsory. A landmark and a second line genuinely
    // are optional, and demanding them would turn a real address in a
    // village into an unfillable form.
    const addressLine1 = dto.addressLine1?.trim() ?? '';
    if (!addressLine1) {
      problems.push({
        field: 'addressLine1',
        message: 'Add the address a rider should collect from — house or shop number, and the street.',
      });
    } else if (addressLine1.length < 6) {
      // "A" or "12" is not an address anybody can drive to. Shape only,
      // never taste — the same line `checkBusinessName` holds.
      problems.push({
        field: 'addressLine1',
        message: 'That looks too short to find. Include the house or shop number and the street.',
      });
    }

    let pickupPhone: string | null = null;
    if (dto.pickupPhone?.trim()) {
      const parsed = normalizePhone(dto.pickupPhone);
      if ('error' in parsed) problems.push({ field: 'pickupPhone', message: parsed.error });
      else pickupPhone = parsed.phone;
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
      pincode,
      city,
      addressLine1,
      addressLine2: dto.addressLine2?.trim() || null,
      landmark: dto.landmark?.trim() || null,
      pickupPhone,
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
        // Derived in `normalize` — India Post's district where there is
        // one, the client's own value otherwise, and a refusal if neither
        // has anything. The M32 form already stopped asking for a city on
        // the same reasoning: the field that decides anything is the
        // location field, not a free text label next to it.
        city: clean.city,
        area: dto.area ?? null,
        pincode: clean.pincode,
        // The pickup address. Private by contract — see the schema doc
        // comment; the form promises buyers never see it.
        addressLine1: clean.addressLine1,
        addressLine2: clean.addressLine2,
        landmark: clean.landmark,
        pickupPhone: clean.pickupPhone,
        areaLabel: dto.area === OTHER_AREA ? dto.areaLabel : null,
        // No `?? 10` (M19). It used to be here, and combined with the
        // column's own `@default(10)` it meant `approveApplication`'s
        // `deliveryRadiusKm || defaultRadiusKm` always saw a truthy 10 —
        // so `PlatformSetting.defaultDeliveryRadiusKm` could never apply.
        // Undefined stays NULL, which is how "they didn't say" reaches
        // approval intact.
        deliveryRadiusKm: dto.deliveryRadiusKm,
        description: dto.description,
        // The waitlist, which now only a pre-M36 client can land on.
        //
        // It exists because an area nobody could deliver to was not a
        // queue entry, and an admin filtering for pending work should not
        // see rows that cannot be approved as-is. **A pincode application
        // is never waitlisted**: every valid Indian pincode is
        // approvable, which is the entire point of M36. Whether we
        // currently *deliver* there is a separate question, answered by
        // `servicedPincodePrefixes` on the buyer side, and it must never
        // be answered here — gating supply on the launch city is the bug
        // this milestone removes.
        ...(!clean.pincode && dto.area === OTHER_AREA ? { status: 'waitlisted' as const } : {}),
      },
    });
    return mapSellerApplication(application);
  }
}
