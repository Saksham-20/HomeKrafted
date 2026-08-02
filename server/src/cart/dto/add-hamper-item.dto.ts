import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class HamperLineItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/** Hands an assembled hamper off as one cart line — mirrors `CartContext.addHamperItem`. Creates a real `Hamper` row + one `CartItem{hamperId}` line. */
export class AddHamperItemDto {
  @IsString()
  @MinLength(1)
  boxId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HamperLineItemDto)
  items!: HamperLineItemDto[];

  @IsOptional()
  @IsString()
  giftNote?: string;

  @IsOptional()
  @IsIn(['kraft', 'floral', 'festive', 'minimal'])
  wrap?: 'kraft' | 'floral' | 'festive' | 'minimal';

  @IsOptional()
  @IsIn(['gold', 'terracotta', 'pine', 'ivory'])
  ribbon?: 'gold' | 'terracotta' | 'pine' | 'ivory';

  @IsOptional()
  @IsString()
  nameCard?: string;

  @IsOptional()
  @IsString()
  recipientAddressId?: string;

  @IsOptional()
  @BooleanField()
  hidePrice?: boolean;
}
