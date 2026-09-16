import { VehicleType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * `PUT /rider/me/application` — every field is optional because the
 * onboarding form saves a screen at a time (§2.1), so a partial payload
 * is the normal request, not an edge case. This DTO checks **shape**
 * only (is it a string, is it short enough); whether a value is
 * *usable* — 18+, a real pincode, a PAN that parses, an emergency number
 * that isn't the rider's own — is `RiderOnboardingService`'s job, via
 * `application-fields.ts`, so the applicant gets a sentence rather than
 * a decorator's stock message.
 *
 * `RiderOnboardingService.updateApplication` builds the Prisma payload
 * field-by-field rather than spreading this object (same reasoning as
 * `UpdateSellerProfileDto`): a field added here can never silently reach
 * a column — like `status` or `cashLimit` — that only an admin route may
 * write.
 */
export class UpdateRiderApplicationDto {
  @IsOptional() @IsString() @MaxLength(120) fullName?: string;

  /** Validated for real (18+) in the service — this only checks it parses as a date. */
  @IsOptional() @IsISO8601() dateOfBirth?: string;

  @IsOptional() @IsString() @MaxLength(30) gender?: string;
  @IsOptional() @IsEmail() email?: string;

  @IsOptional() @IsString() @MaxLength(200) homeLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) homeLine2?: string;
  @IsOptional() @IsString() @MaxLength(80) homeCity?: string;
  @IsOptional() @IsString() @MaxLength(10) homePincode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];

  @IsOptional() @IsString() @MaxLength(80) emergencyName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyRelation?: string;
  @IsOptional() @IsString() @MaxLength(20) emergencyPhone?: string;

  @IsOptional() @IsEnum(VehicleType) vehicleType?: VehicleType;
  @IsOptional() @IsString() @MaxLength(20) vehicleNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) dlNumber?: string;
  @IsOptional() @IsISO8601() dlExpiry?: string;

  /** Shape checked (12 digits refused with its own message) in the service — see D12. */
  @IsOptional() @IsString() @MaxLength(12) aadhaarLast4?: string;
  @IsOptional() @IsString() @MaxLength(10) panNumber?: string;

  @IsOptional() @IsString() @MaxLength(120) bankAccountName?: string;
  @IsOptional() @IsString() @MaxLength(30) bankAccountNumber?: string;
  @IsOptional() @IsString() @MaxLength(11) bankIfsc?: string;
  @IsOptional() @IsString() @MaxLength(120) upiId?: string;

  @IsOptional() @IsString() @MaxLength(10) tshirtSize?: string;
  @IsOptional() @IsString() homeZoneId?: string;
}
