import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class QuoteLineDto {
  /** Optional — half of corporate gifting is a custom hamper with no catalogue row. */
  @IsOptional()
  @IsString()
  productId?: string;

  /**
   * **Required even on a custom line.** Every downstream path resolves a
   * kitchen through the vendor; a line naming none is work nobody can see
   * and money nobody can be paid.
   */
  @IsString()
  @MinLength(1)
  vendorId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateQuoteDto {
  @IsISO8601()
  validUntil!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Separate columns rather than a note beside the figure. Nobody can
   * accept a number that is not the number they will be invoiced.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}

export class UpdateQuoteDto {
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines?: QuoteLineDto[];
}

/**
 * Accepting takes a typed name.
 *
 * For a five-figure commitment reached through a link that can be
 * forwarded to anyone, `acceptedAt` alone is not evidence of who agreed.
 * The two-step confirm is the house pattern (`PayoutsClient`).
 *
 * There is deliberately no `acceptedIp`: nginx fronts the API and Express
 * needs `trust proxy` configured for `X-Forwarded-For` to mean anything.
 * Storing an unverified one would be a fake audit trail, which is worse
 * than none.
 */
export class AcceptQuoteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  acceptedName!: string;
}

export class SetInquiryStatusDto {
  @IsString()
  @MinLength(1)
  status!: string;
}

export class UpdateInquiryNotesDto {
  @IsString()
  @MaxLength(4000)
  internalNotes!: string;
}
