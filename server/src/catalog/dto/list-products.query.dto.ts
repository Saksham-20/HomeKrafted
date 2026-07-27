import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export type ProductSort = 'most-loved' | 'price-asc' | 'price-desc';

/**
 * Mirrors `ShopClient.tsx`'s filter/sort semantics exactly: `category`/
 * `occasion`/`dietary`/`vendor` are comma-separated slug (or, for
 * `dietary`, frontend-tag) lists matched with OR-within/AND-across-groups
 * — the same rule `ShopClient`'s `filtered` memo applies for its
 * multi-select checkboxes. `minPrice`/`maxPrice` and `sort` compare
 * against the same basis `ShopClient`'s local `priceOf()` uses: the
 * product's `defaultWeightSku` price, not any/every weight option.
 */
export class ListProductsQueryDto {
  /** Comma-separated category slugs, OR-matched. */
  @IsOptional()
  @IsString()
  category?: string;

  /** Comma-separated occasion slugs, OR-matched. */
  @IsOptional()
  @IsString()
  occasion?: string;

  /** Comma-separated vendor slugs, OR-matched. */
  @IsOptional()
  @IsString()
  vendor?: string;

  /** Comma-separated frontend dietary tags (e.g. "vegetarian,gluten-free"), OR-matched. */
  @IsOptional()
  @IsString()
  dietary?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(['most-loved', 'price-asc', 'price-desc'])
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
