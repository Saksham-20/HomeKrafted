import { IsString, MaxLength, MinLength } from 'class-validator';

/** Shared by `POST .../reject` and `POST .../suspend` — both need a reason, sent to the rider verbatim (the M22 rule). */
export class ReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
