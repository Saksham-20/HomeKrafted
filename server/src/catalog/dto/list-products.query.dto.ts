import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export type ProductSort = 'most-loved' | 'price-asc' | 'price-desc' | 'nearest';

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
  /**
   * Free-text search. Case-insensitive substring across the product name,
   * its description, its category name and its HomeKrafter's name — so
   * "pickle", "Sector 35" and a maker's own name all find something.
   *
   * Substring rather than full-text on purpose at this catalogue size:
   * Postgres FTS would need a tsvector column, a trigger to keep it fresh
   * and a migration, and would still lose to `ILIKE` on the two-word
   * queries people actually type ("mango pick"). Revisit when the
   * catalogue outgrows a sequential scan — recorded in
   * `docs/PRODUCTION-AUDIT.md` phase 4.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

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
  @BooleanField()
  featured?: boolean;

  /**
   * `true` for ready-made gift hampers only, `false` for everything else,
   * omitted for both.
   *
   * Three states rather than two: `/hamper` asks for `true`, and a caller
   * that wants an ordinary catalogue without hampers in it can ask for
   * `false`. Leaving it out returns everything, which is what `/shop`
   * wants — a hamper is a listing like any other and hiding it from the
   * main catalogue would cost a HomeKrafter sales.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @BooleanField()
  isHamper?: boolean;

  /**
   * `food` or `craft` (M20). Omitted returns both, which is what `/shop`
   * and search want — the split is a browse convenience, not a partition,
   * and a buyer searching "candle" should find one wherever they are.
   *
   * `/gifts` asks for `craft`.
   */
  @IsOptional()
  @IsIn(['food', 'craft'])
  kind?: 'food' | 'craft';

  /**
   * Buyer coordinates. When both are supplied, only listings from kitchens
   * whose `deliveryRadiusKm` reaches the buyer are returned, and each item
   * carries the distance so the UI can say "4.6 km away".
   *
   * Optional on purpose: a visitor who declines the browser location prompt
   * and hasn't picked an area yet still gets the full catalogue rather than
   * an empty page (see `docs/PRD.md` — nothing is hidden behind a
   * permission the user refused).
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

  /** Only items the HomeKrafter currently marks as available. Defaults to true for buyers. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @BooleanField()
  availableOnly?: boolean;

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
  @IsIn(['most-loved', 'price-asc', 'price-desc', 'nearest'])
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
