import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

/**
 * `companyName` and `contactName` gained an upper bound here (200 and 120)
 * where they previously had none at all — the same unbounded-text hole the
 * 2026-08-07 audit closed on listings. Both are rendered on the admin
 * inquiry queue and carried into a quote, so the only thing that had ever
 * limited them was Express's 100 KB body cap.
 */
export class CreateCorporateInquiryDto {
  @TrimmedString(1, 200)
  companyName!: string;

  @TrimmedString(1, 120)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsInt()
  @Min(1)
  estimatedQuantity!: number;

  @IsOptional()
  @IsString()
  budgetRange?: string;

  @IsString()
  @MinLength(1)
  message!: string;

  /**
   * "50 hampers for Diwali clients" and "20 kg of namkeen for a wedding"
   * are different conversations. Optional, defaulting to `corporate` — the
   * form only asked about client gifting before M20, so an absent value
   * means what every existing row means.
   */
  @IsOptional()
  @IsIn(['corporate', 'bulk'])
  orderType?: 'corporate' | 'bulk';
}
