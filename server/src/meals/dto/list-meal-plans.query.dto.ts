import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListMealPlansQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsIn(['breakfast', 'lunch', 'dinner'])
  mealType?: 'breakfast' | 'lunch' | 'dinner';

  @IsOptional()
  @IsIn(['veg', 'non-veg'])
  diet?: 'veg' | 'non-veg';

  /**
   * Buyer coordinates. Supplied together, plans are limited to kitchens whose
   * delivery radius reaches the buyer; omitted, the full list shows.
   * Location is never a gate — a visitor who declined the browser prompt must
   * still be able to see what is on offer (CLAUDE.md, M12).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
