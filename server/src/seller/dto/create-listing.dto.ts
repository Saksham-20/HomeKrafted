import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class WeightOptionInputDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(0)
  mrp!: number;

  @IsNumber()
  @Min(0)
  stock!: number;
}

/**
 * Maker listing create/update — mirrors `client/lib/api/seller.ts`'s
 * `SellerListingInput` field-for-field. No `vendorId` field: the product's
 * owning vendor always comes from the resolved seller's own `vendorId`
 * (never a client-supplied id — see `SellerListingsService`). No `id`/
 * `slug`/`rating`/`reviewCount` either — server-generated, never
 * client-set.
 */
export class CreateListingDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  occasionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['vegetarian', 'vegan', 'gluten-free', 'sugar-free', 'contains-nuts'], { each: true })
  dietary?: string[];

  @IsString()
  @MinLength(1)
  description!: string;

  @BooleanField()
  isPackaged!: boolean;

  @IsNumber()
  @Min(0)
  @Max(100)
  cashbackPct!: number;

  @IsOptional()
  @IsArray()
  @IsIn(['Bestseller', 'New', 'Festive', 'Curated'], { each: true })
  tags?: string[];

  /** Real project asset path (e.g. "/images/products/your-product.jpg") — no upload backend yet; blank/absent keeps the `<ImageSlot>` placeholder. */
  @IsOptional()
  @IsString()
  imagePath?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => WeightOptionInputDto)
  weightOptions!: WeightOptionInputDto[];

  @IsString()
  @MinLength(1)
  defaultWeightSku!: string;
}
