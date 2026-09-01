import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
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
}
