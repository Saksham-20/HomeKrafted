import { IsOptional, IsString, Length } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

/**
 * Submit a verification code. See `RequestOtpDto` for why `identifier`
 * and `phone` are both accepted and neither is shape-validated here.
 */
export class VerifyOtpDto {
  @IsOptional()
  @TrimmedString(1, 254)
  identifier?: string;

  /** @deprecated Send `identifier`. Kept for the native clients. */
  @IsOptional()
  @TrimmedString(1, 254)
  phone?: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  /** Optional — lets a first-time OTP signup capture a display name. */
  @IsOptional()
  @IsString()
  name?: string;
}
