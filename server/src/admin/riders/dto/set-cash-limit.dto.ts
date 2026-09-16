import { IsNumber, Max, Min } from 'class-validator';

/** `PATCH /admin/riders/:id/cash-limit`. §8 Q2's placeholder default is ₹1,500; an admin may raise (or lower) it per rider. */
export class SetCashLimitDto {
  @IsNumber()
  @Min(0)
  @Max(20000)
  amount!: number;
}
