import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * `POST /rider/me/consents` — §2.1 step 2's four separate, timestamped
 * checkboxes. Each is independent and optional in the request, because
 * the onboarding screen presents them as four checkboxes that can be
 * ticked in any order, not one combined "I agree" — a rider who accepts
 * the Rider Agreement today and comes back tomorrow for the background-
 * verification consent must not have to resend the first two.
 *
 * `agreementVersion`/`privacyVersion` double as the accept: sending a
 * version **is** accepting it, which is why there is no separate
 * `agreement: true` boolean next to it. R4 pins these against fixed
 * `RIDER_AGREEMENT_VERSION`/`RIDER_PRIVACY_VERSION` constants once
 * `docs/RIDER-APP.md §7`'s drafts exist; R1 accepts whatever version
 * string the caller sends and records it as-is.
 */
export class RiderConsentsDto {
  @IsOptional() @IsString() @MaxLength(20) agreementVersion?: string;
  @IsOptional() @IsString() @MaxLength(20) privacyVersion?: string;
  @IsOptional() @BooleanField() location?: boolean;
  @IsOptional() @BooleanField() bgv?: boolean;
}
