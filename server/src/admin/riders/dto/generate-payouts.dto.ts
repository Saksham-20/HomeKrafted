import { IsISO8601 } from 'class-validator';

/** `POST /admin/rider-payouts/generate` — the period to cut payouts for. Both bounds inclusive of that calendar day, same as `AdminPayoutsService`'s seller equivalent. */
export class GeneratePayoutsDto {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;
}
