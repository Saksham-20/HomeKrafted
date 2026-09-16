import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /rider/jobs/:id/fail` — "Customer unavailable" and its like. Sent to support on the delivery's row, so it needs a real sentence. */
export class FailJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}
