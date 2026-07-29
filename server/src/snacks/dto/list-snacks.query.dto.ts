import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ListSnacksQueryDto {
  @IsOptional()
  @IsIn(['savoury', 'sweet', 'baked', 'namkeen'])
  category?: 'savoury' | 'sweet' | 'baked' | 'namkeen';

  /**
   * Buyer coordinates. Supplied together, snacks are limited to kitchens
   * whose delivery radius reaches the buyer, and each carries its distance.
   * Omitted (permission declined, no area picked yet) the full menu shows —
   * browsing is never blocked behind a location grant.
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
