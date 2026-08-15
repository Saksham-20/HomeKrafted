import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * One date's menu (M37). `lines: []` clears the override — the date
 * falls back to the weekly rotation. Shared by the seller route and the
 * admin override so the two doors cannot drift.
 */
export class SetDayMenuDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMaxSize(10)
  lines!: string[];
}
