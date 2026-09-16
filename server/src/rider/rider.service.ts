import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Rider, RiderDocumentKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UpdateRiderApplicationDto } from './dto/update-rider-application.dto';
import { RiderConsentsDto } from './dto/rider-consents.dto';
import {
  checkAadhaarLast4,
  checkDateOfBirth,
  checkEmergencyPhone,
  checkHomePincode,
  checkIfsc,
  checkPan,
  normalizeVehicleNumber,
} from './application-fields';
import { requiredDocumentKinds } from './required-documents';
import { describeMissing } from './missing-item-labels';
import { mapOwnRider } from './rider.mapper';

/** A field that failed one of `application-fields.ts`'s checks. Same shape as the seller-application equivalent. */
interface FieldProblem {
  field: string;
  message: string;
}

/**
 * Statuses an applicant may still edit. Once a review has actually
 * started (`under_review`) or finished (`approved`/`suspended`/
 * `deactivated`) the form is closed — a `rejected` application is the
 * one way back in, because that is the whole point of a refusal: fix
 * what was wrong and resubmit.
 */
const EDITABLE_STATUSES: Rider['status'][] = ['applied', 'rejected'];

function conflictForStatus(status: Rider['status']): ConflictException {
  const sentences: Partial<Record<Rider['status'], string>> = {
    under_review: 'Your application is already under review and can’t be edited right now.',
    approved: 'Your application has already been approved — this form is for onboarding only.',
    suspended: 'Your account is suspended. Contact support to change anything here.',
    deactivated: 'This account has been deactivated. Contact support if that’s wrong.',
  };
  return new ConflictException(sentences[status] ?? 'This application can’t be edited right now.');
}

@Injectable()
export class RiderOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every `/rider/*` controller method resolves the caller's `Rider`
   * through here — never a `riderId` the client supplies. There is no
   * `riderId` JWT claim (unlike `sellerId`): `Rider.userId` is unique, so
   * a live lookup by the verified `userId` costs one indexed query and
   * needs no token change.
   */
  async resolveRider(user: RequestUser) {
    const rider = await this.prisma.rider.findUnique({
      where: { userId: user.userId },
      include: { documents: true },
    });
    if (!rider) {
      throw new NotFoundException('No rider profile found for this account.');
    }
    return rider;
  }

  async me(user: RequestUser) {
    const rider = await this.resolveRider(user);
    const balance = await this.cashBalance(rider.id);
    return mapOwnRider(rider, balance);
  }

  /** `SUM(RiderCashEntry.amount)` — never a stored counter (the cross-cutting rule). Always 0 in R1: nothing writes a row yet. */
  private async cashBalance(riderId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.riderCashEntry.aggregate({
      where: { riderId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  async listZones() {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      city: zone.city,
      centerLat: zone.centerLat,
      centerLng: zone.centerLng,
      radiusKm: zone.radiusKm,
    }));
  }

  /**
   * `PUT /rider/me/application` — a partial save, one onboarding screen
   * at a time. Every present field is validated for real usability
   * (`application-fields.ts`) before anything is written; an invalid
   * field refuses the *whole* request with every problem found, rather
   * than saving the good fields and silently dropping the bad ones —
   * partial silent acceptance is how a rider ends up believing a field
   * saved when it didn't.
   */
  async updateApplication(user: RequestUser, dto: UpdateRiderApplicationDto) {
    const rider = await this.resolveRider(user);
    if (!EDITABLE_STATUSES.includes(rider.status)) {
      throw conflictForStatus(rider.status);
    }

    const problems: FieldProblem[] = [];
    const data: Prisma.RiderUpdateInput = {};

    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.homeLine1 !== undefined) data.homeLine1 = dto.homeLine1;
    if (dto.homeLine2 !== undefined) data.homeLine2 = dto.homeLine2;
    if (dto.homeCity !== undefined) data.homeCity = dto.homeCity;
    if (dto.languages !== undefined) data.languages = dto.languages;
    if (dto.emergencyName !== undefined) data.emergencyName = dto.emergencyName;
    if (dto.emergencyRelation !== undefined) data.emergencyRelation = dto.emergencyRelation;
    if (dto.vehicleType !== undefined) data.vehicleType = dto.vehicleType;
    if (dto.dlNumber !== undefined) data.dlNumber = dto.dlNumber;
    if (dto.panNumber !== undefined) {
      const panProblem = checkPan(dto.panNumber);
      if (panProblem) problems.push({ field: 'panNumber', message: panProblem });
      else data.panNumber = dto.panNumber.toUpperCase().trim();
    }
    if (dto.bankAccountName !== undefined) data.bankAccountName = dto.bankAccountName;
    if (dto.bankAccountNumber !== undefined) data.bankAccountNumber = dto.bankAccountNumber;
    if (dto.upiId !== undefined) data.upiId = dto.upiId;
    if (dto.tshirtSize !== undefined) data.tshirtSize = dto.tshirtSize;

    if (dto.dateOfBirth !== undefined) {
      const result = checkDateOfBirth(dto.dateOfBirth, new Date());
      if ('error' in result) problems.push({ field: 'dateOfBirth', message: result.error });
      else data.dateOfBirth = result.date;
    }

    if (dto.homePincode !== undefined) {
      const problem = checkHomePincode(dto.homePincode);
      if (problem) problems.push({ field: 'homePincode', message: problem });
      else data.homePincode = dto.homePincode.trim();
    }

    if (dto.emergencyPhone !== undefined) {
      // The rider's own sign-in phone lives on `User`, not `Rider` —
      // fetched only when this field is actually present.
      const ownPhone = await this.ownPhone(user.userId);
      const result = checkEmergencyPhone(dto.emergencyPhone, ownPhone);
      if ('error' in result) problems.push({ field: 'emergencyPhone', message: result.error });
      else data.emergencyPhone = result.phone;
    }

    if (dto.vehicleNumber !== undefined) {
      const result = normalizeVehicleNumber(dto.vehicleNumber);
      if ('error' in result) problems.push({ field: 'vehicleNumber', message: result.error });
      else data.vehicleNumber = result.value;
    }

    if (dto.dlExpiry !== undefined) {
      const date = new Date(dto.dlExpiry);
      if (Number.isNaN(date.getTime())) problems.push({ field: 'dlExpiry', message: 'That does not look like a date.' });
      else data.dlExpiry = date;
    }

    if (dto.aadhaarLast4 !== undefined) {
      const result = checkAadhaarLast4(dto.aadhaarLast4);
      if ('error' in result) problems.push({ field: 'aadhaarLast4', message: result.error });
      else data.aadhaarLast4 = result.value;
    }

    if (dto.bankIfsc !== undefined) {
      const problem = checkIfsc(dto.bankIfsc);
      if (problem) problems.push({ field: 'bankIfsc', message: problem });
      else data.bankIfsc = dto.bankIfsc.toUpperCase().trim();
    }

    if (dto.homeZoneId !== undefined) {
      const zone = await this.prisma.deliveryZone.findUnique({ where: { id: dto.homeZoneId } });
      if (!zone || !zone.isActive) problems.push({ field: 'homeZoneId', message: 'Pick a zone from the list.' });
      else data.homeZone = { connect: { id: zone.id } };
    }

    if (problems.length > 0) {
      throw new BadRequestException({
        message: problems.map((p) => p.message).join(' '),
        problems,
      });
    }

    const updated = await this.prisma.rider.update({
      where: { id: rider.id },
      data,
      include: { documents: true },
    });
    const balance = await this.cashBalance(rider.id);
    return mapOwnRider(updated, balance);
  }

  private async ownPhone(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    return user?.phone ?? null;
  }

  /** `POST /rider/me/consents` — see `RiderConsentsDto`'s doc comment for why each of the four is independent. */
  async recordConsents(user: RequestUser, dto: RiderConsentsDto) {
    const rider = await this.resolveRider(user);
    const now = new Date();
    const data: Prisma.RiderUpdateInput = {};

    if (dto.agreementVersion !== undefined) {
      data.agreementVersion = dto.agreementVersion;
      data.agreementAcceptedAt = now;
    }
    if (dto.privacyVersion !== undefined) {
      data.privacyVersion = dto.privacyVersion;
      data.privacyAcceptedAt = now;
    }
    if (dto.location === true) data.locationConsentAt = now;
    if (dto.bgv === true) data.bgvConsentAt = now;

    const updated = await this.prisma.rider.update({
      where: { id: rider.id },
      data,
      include: { documents: true },
    });
    const balance = await this.cashBalance(rider.id);
    return mapOwnRider(updated, balance);
  }

  /**
   * `POST /rider/me/submit` — `applied|rejected -> under_review`, only
   * once every field §2.1 asks for is filled in, every required document
   * (per `vehicleType`) is uploaded, and all four consents are recorded.
   * Refuses with a 400 naming exactly what's missing — see
   * `describeMissing`'s doc comment for why that arrives as a
   * `message: string[]` rather than the brief's literal `{ message,
   * missing }` shape.
   */
  async submit(user: RequestUser) {
    const rider = await this.resolveRider(user);
    if (!EDITABLE_STATUSES.includes(rider.status)) {
      throw conflictForStatus(rider.status);
    }

    const missing = this.missingForSubmit(rider);
    if (missing.length > 0) {
      throw new BadRequestException(missing.map(describeMissing));
    }

    const updated = await this.prisma.rider.update({
      where: { id: rider.id },
      data: { status: 'under_review', submittedAt: new Date(), statusNote: null },
      include: { documents: true },
    });
    const balance = await this.cashBalance(rider.id);
    return mapOwnRider(updated, balance);
  }

  private missingForSubmit(rider: Rider & { documents: { kind: RiderDocumentKind }[] }): string[] {
    const missing: string[] = [];
    const need = (present: unknown, field: string) => {
      if (present === null || present === undefined || present === '') missing.push(field);
    };

    need(rider.fullName, 'fullName');
    need(rider.dateOfBirth, 'dateOfBirth');
    need(rider.homeLine1, 'homeLine1');
    need(rider.homeCity, 'homeCity');
    need(rider.homePincode, 'homePincode');
    need(rider.emergencyName, 'emergencyName');
    need(rider.emergencyRelation, 'emergencyRelation');
    need(rider.emergencyPhone, 'emergencyPhone');
    need(rider.vehicleType, 'vehicleType');
    need(rider.aadhaarLast4, 'aadhaarLast4');
    need(rider.panNumber, 'panNumber');
    need(rider.homeZoneId, 'homeZoneId');
    need(rider.tshirtSize, 'tshirtSize');

    // Bicycle/ev_bike carry no registration or licence (the required-
    // documents rule again) — asking for the fields here would strand
    // exactly the riders that rule exists to unblock.
    const needsMotorFields = rider.vehicleType === 'scooter' || rider.vehicleType === 'motorcycle';
    if (needsMotorFields) {
      need(rider.vehicleNumber, 'vehicleNumber');
      need(rider.dlNumber, 'dlNumber');
      need(rider.dlExpiry, 'dlExpiry');
    }

    // A payment route: either full bank details, or a UPI id.
    const hasBank = Boolean(rider.bankAccountName && rider.bankAccountNumber && rider.bankIfsc);
    if (!hasBank && !rider.upiId) {
      missing.push('bankAccountNumber');
    }

    need(rider.agreementAcceptedAt, 'agreementVersion');
    need(rider.privacyAcceptedAt, 'privacyVersion');
    need(rider.locationConsentAt, 'locationConsent');
    need(rider.bgvConsentAt, 'bgvConsent');

    if (rider.vehicleType) {
      const uploaded = new Set(rider.documents.map((d) => d.kind));
      for (const kind of requiredDocumentKinds(rider.vehicleType)) {
        if (!uploaded.has(kind)) missing.push(kind);
      }
    }

    return missing;
  }
}
