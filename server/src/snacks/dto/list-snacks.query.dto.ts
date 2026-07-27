import { IsIn, IsOptional } from 'class-validator';

export class ListSnacksQueryDto {
  @IsOptional()
  @IsIn(['savoury', 'sweet', 'baked', 'namkeen'])
  category?: 'savoury' | 'sweet' | 'baked' | 'namkeen';
}
