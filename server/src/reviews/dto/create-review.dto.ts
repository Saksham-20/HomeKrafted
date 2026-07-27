import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  @IsIn(['product', 'vendor', 'service'])
  targetType!: 'product' | 'vendor' | 'service';

  @IsString()
  targetId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: 1 | 2 | 3 | 4 | 5;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
