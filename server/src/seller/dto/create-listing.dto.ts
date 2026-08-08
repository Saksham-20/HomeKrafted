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
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

export class WeightOptionInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
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
  /**
   * Capped as of the 2026-08-07 audit. `name` and `description` had a
   * `@MinLength(1)` and no upper bound at all, so a 5,000-character
   * product name was accepted and stored — and this string is rendered on
   * every card, every grid, the admin queue and every order line. The
   * only thing that had ever bounded it was Express's 100 KB body limit.
   */
  @TrimmedString(1, 120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
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
  @MaxLength(4000)
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
