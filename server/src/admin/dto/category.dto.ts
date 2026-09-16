import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';
import { ProductKind } from '@prisma/client';

const GROUPS = Object.values(ProductKind);

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  /**
   * Which half of the catalogue. **Ignored when `parentId` is set** — a
   * subcategory always follows its parent, because "For Her" under a food
   * shelf is not a thing anybody meant and the header's food/gifts split
   * would then render it on the wrong side.
   */
  @IsOptional()
  @IsIn(GROUPS)
  group?: ProductKind;

  /** `null`/absent creates a top-level shelf. */
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageSrc?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  /** Pass `null` to promote a subcategory back to the top level. */
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsIn(GROUPS)
  group?: ProductKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageSrc?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /**
   * G1 — the committed icon id this shelf renders with
   * (`client/lib/icons/registry.ts`). A blank clears it back to the
   * wrapped-gift fallback. It is a column rather than a slug-to-icon map
   * in code, which is what left 17 of 26 live tiles on the same basket.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string | null;

  /** G1 — one buyer-facing sentence, also the grounding text for a later suggestion. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  /** G1 — other words for this shelf: "achaar", "kada", "diya". */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  synonyms?: string[];
}

/** G1 — retire a shelf without deleting it; every existing link keeps resolving. */
export class ArchiveCategoryDto {
  @BooleanField()
  archived!: boolean;
}

/** G1 — fold one shelf into another (the live "Home Décor"/"Home Decor" pair). */
export class MergeCategoryDto {
  @IsString()
  @MinLength(1)
  intoId!: string;
}
