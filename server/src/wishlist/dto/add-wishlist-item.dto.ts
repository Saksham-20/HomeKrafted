import { IsString, MinLength } from 'class-validator';

export class AddWishlistItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;
}
