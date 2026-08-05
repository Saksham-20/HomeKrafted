import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * What a HomeKrafter fills in to offer a subscription.
 *
 * `mealType` is optional. A plan used to have to be breakfast, lunch or
 * dinner; a kitchen that wants to sell a monthly pickle box should not have
 * to wait for us to ship an enum value, so `slotLabel` takes free text and
 * the delivery windows fall back to the kitchen's own hours.
 */
export class CreateMealPlanDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(600)
  description!: string;

  /** One of the three meals, or omitted for any other cadence. */
  @IsOptional()
  @IsIn(['breakfast', 'lunch', 'dinner'])
  mealType?: 'breakfast' | 'lunch' | 'dinner';

  /** "Monthly pickle box". Used when `mealType` is absent. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slotLabel?: string;

  /** Back this plan with one of the kitchen's existing listings. */
  @IsOptional()
  @IsString()
  productId?: string;

  @IsIn(['veg', 'non-veg'])
  diet!: 'veg' | 'non-veg';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  pricePerMeal!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  servingSize?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  weeklyMenu?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imagePlaceholder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageSrc?: string;

  /**
   * The kitchen's own ceiling. Omitted means uncapped — a choice they make
   * rather than a default they never saw. This is the first place a home
   * cook's stated capacity is actually enforced.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxSubscribers?: number;

  /** `@BooleanField` because the global pipe turns any non-empty string into `true`. */
  @IsOptional()
  @BooleanField()
  isActive?: boolean;
}

export class UpdateMealPlanDto extends CreateMealPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare name: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  declare description: string;

  @IsOptional()
  @IsIn(['veg', 'non-veg'])
  declare diet: 'veg' | 'non-veg';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  declare pricePerMeal: number;
}
