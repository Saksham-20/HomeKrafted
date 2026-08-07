import { IsOptional, IsPhoneNumber, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * An address is the one thing on this platform a person physically goes
 * to. Until the 2026-08-07 audit, `phone` and `pincode` were validated as
 * "a non-empty string" and nothing else — `POST /users/me/addresses` with
 * `phone: "not-a-phone"` and `pincode: "ABCDEF"` was accepted and stored,
 * and neither the address book nor checkout objected.
 *
 * The cost lands on the HomeKrafter, not the platform: a delivery is
 * routed by pincode and rescued by phone, so a malformed pair is a home
 * cook who has cooked the food, set out to deliver it, and has no way to
 * find or call the buyer. `UpdateProfileDto` had already been validating
 * exactly these two fields properly since M8; the address form was simply
 * never brought in line.
 */
export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipientName!: string;

  /**
   * `'IN'`, not the region-less form. Without a region class-validator
   * demands strict E.164, so a bare `9845012345` — the way an Indian
   * number is actually typed — is rejected while `+919845012345` passes.
   * Refusing the common format would be a worse bug than the one this
   * validation exists to fix. Measured against `class-validator`:
   * `'IN'` accepts `9845012345`, `+919845012345`, `098450 12345` and
   * `98450-12345`, and still refuses `not-a-phone` and `12345`.
   *
   * Region-locked deliberately. This is a *delivery* address in the
   * tricity, and the number's job is to let a home cook standing outside
   * a gate reach the buyer; a US mobile cannot do that.
   */
  @IsPhoneNumber('IN', {
    message: 'Enter a valid phone number, e.g. 98450 12345',
  })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  state!: string;

  /**
   * An Indian PIN code is exactly six digits and never starts with zero —
   * the leading digit is the postal region, numbered 1–8 (9 is Army
   * Postal Service). Deliberately a format check, not a lookup against a
   * list of real codes: a new code should not be undeliverable because
   * our table is stale, and this platform delivers to four cities it
   * could enumerate but has no business hard-coding here.
   */
  @Matches(/^[1-9][0-9]{5}$/, {
    message: 'Enter a valid 6-digit pincode',
  })
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;

  @IsOptional()
  @BooleanField()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}
