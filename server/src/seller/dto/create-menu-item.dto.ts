import { IsIn, IsNumber, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

/** Snack seller menu create/update — mirrors `client/lib/api/seller.ts`'s `SellerMenuInput`. No `sellerId`: always the resolved seller's own id. */
export class CreateMenuItemDto {
  /** Capped for the same reason as `CreateListingDto.name` — see there. */
  @TrimmedString(1, 120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsIn(['savoury', 'sweet', 'baked', 'namkeen'])
  category!: 'savoury' | 'sweet' | 'baked' | 'namkeen';

  @IsIn(['veg', 'non-veg'])
  diet!: 'veg' | 'non-veg';

  /** Real project asset path — no upload backend yet; blank/absent keeps the `<ImageSlot>` placeholder. */
  @IsOptional()
  @IsString()
  imagePath?: string;

  @BooleanField()
  available!: boolean;
}
