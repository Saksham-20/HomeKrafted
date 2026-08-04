import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * The cycle lengths on offer. A closed set rather than a free integer: the
 * buyer is paying up front out of wallet balance, and an open-ended count
 * lets somebody commit ₹40,000 to a home kitchen in one click. Thirty meals
 * is roughly a month of one meal a day, which is as far ahead as a home cook
 * can honestly promise.
 */
export const MEAL_COUNTS = [6, 12, 24, 30] as const;

export class CreateMealSubscriptionDto {
  @IsString()
  planId!: string;

  /** Must belong to the caller — checked in the service, not here. */
  @IsString()
  addressId!: string;

  /**
   * Start of the 30-minute window, `HH:MM`. Validated for *shape* here and
   * for whether the kitchen actually offers it in the service, which is the
   * only place that knows the kitchen's hours.
   */
  @Matches(/^\d{2}:\d{2}$/, { message: 'bracketStart must be a HH:MM time label' })
  bracketStart!: string;

  /** 0 = Sunday. At least one day, no duplicates, no more than a week's worth. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @Type(() => Number)
  @IsInt()
  @Min(Math.min(...MEAL_COUNTS))
  @Max(Math.max(...MEAL_COUNTS))
  mealCount!: number;
}
