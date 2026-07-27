import { IsIn, IsString } from 'class-validator';

export class ListReviewsQueryDto {
  @IsIn(['product', 'vendor', 'service'])
  targetType!: 'product' | 'vendor' | 'service';

  @IsString()
  targetId!: string;
}
