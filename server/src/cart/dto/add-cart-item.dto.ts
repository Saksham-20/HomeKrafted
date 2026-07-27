import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
