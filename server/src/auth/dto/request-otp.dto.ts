import { IsOptional } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

/**
 * Ask for a verification code.
 *
 * `identifier` (M25) is a mobile number **or** an email address — the
 * service parses it. `phone` is the pre-M25 field name and is still
 * accepted: the native apps send it, and narrowing a request value that
 * shipped is how you break a client you cannot redeploy. Exactly one has
 * to be present; the service says so if neither is.
 *
 * Neither carries `@IsPhoneNumber()` any more, because the same field now
 * legitimately holds an address. Shape is decided in
 * `identifier.util.ts`, which is the only place that knows both forms.
 */
export class RequestOtpDto {
  @IsOptional()
  @TrimmedString(1, 254)
  identifier?: string;

  /** @deprecated Send `identifier`. Kept for the native clients. */
  @IsOptional()
  @TrimmedString(1, 254)
  phone?: string;
}
