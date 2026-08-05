import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCorporateInquiryDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(1)
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
