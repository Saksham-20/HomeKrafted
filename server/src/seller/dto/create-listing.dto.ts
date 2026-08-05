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

  /**
   * "This listing is a ready-made gift hamper."
   *
   * Optional so every existing caller keeps working and an unset field
   * means "an ordinary listing" rather than a validation error.
   * `@BooleanField()` rather than `@IsBoolean()` — the global pipe's
   * `enableImplicitConversion` reads the string `"false"` as `true`, which
   * would put every listing on the hamper page.
   */
  @IsOptional()
  @BooleanField()
  isHamper?: boolean;

  /**
   * Food or craft (M20). Optional, defaulting to `food` — every listing
   * that existed before the gifts vertical was food, and an unset field has
   * to keep meaning that rather than becoming a validation error.
   *
   * This decides which vertical the listing appears in, so it is the
   * maker's to set. Without it here `/gifts` could only ever be filled by
   * a script, which is what it was.
   */
  @IsOptional()
  @IsIn(['food', 'craft'])
  kind?: 'food' | 'craft';

  /**
   * Whether the listing goes in the post or is driven over (M20).
   *
   * Deliberately **not** derived from `kind`: a kitchen posting pickles
   * across India is a real case, and deriving would forbid it. A `national`
   * listing skips the delivery-radius gate entirely
   * (`ProductsService.list`), so this is the field that decides whether a
   * buyer 300km away can see it at all.
   */
  @IsOptional()
  @IsIn(['local', 'national'])
  shippingScope?: 'local' | 'national';

  /**
   * Put this listing on the WhatsApp snacks menu (M20).
   *
   * `@BooleanField()` for the same reason as `isHamper`: the global pipe's
   * `enableImplicitConversion` reads the string `"false"` as `true`.
   */
  @IsOptional()
  @BooleanField()
  isSnack?: boolean;

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
