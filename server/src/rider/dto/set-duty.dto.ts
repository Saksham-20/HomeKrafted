import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * `POST /rider/duty` — §2.2's "Go online" toggle. `lat`/`lng` are
 * required only when going online (`RiderDutyService` checks that, not
 * this DTO — going offline sends neither). `@BooleanField()`, not a bare
 * `@IsBoolean()`: the global pipe reads a `"false"` string as `true`
 * (the M17 boolean-field rule), which here would mean a rider trying to
 * go offline stays online.
 */
export class SetDutyDto {
  @BooleanField()
  online!: boolean;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
